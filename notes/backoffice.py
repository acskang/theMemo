import re
from pathlib import PurePosixPath
from uuid import UUID

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.core.files import File
from django.contrib.auth.decorators import user_passes_test
from django.core.files.storage import default_storage
from django.core.paginator import Paginator
from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import BlogPost, MemoImage, Note, Notebook


IMAGE_REFERENCE = re.compile(r"/memo-media/([0-9a-fA-F-]{36})/")
STORED_IMAGE = re.compile(r"[0-9a-fA-F-]{36}\.(?:jpg|jpeg|png|webp|gif)", re.IGNORECASE)


def superuser_required(view):
    return user_passes_test(lambda user: user.is_active and user.is_superuser)(view)


def _image_ids_in(value, result):
    if isinstance(value, str):
        result.update(match.lower() for match in IMAGE_REFERENCE.findall(value))
    elif isinstance(value, dict):
        for child in value.values():
            _image_ids_in(child, result)
    elif isinstance(value, list):
        for child in value:
            _image_ids_in(child, result)


def _rewrite_image_ids(value, replacements):
    if isinstance(value, str):
        return IMAGE_REFERENCE.sub(
            lambda match: f"/memo-media/{replacements.get(match.group(1).lower(), match.group(1))}/",
            value,
        )
    if isinstance(value, dict):
        return {key: _rewrite_image_ids(child, replacements) for key, child in value.items()}
    if isinstance(value, list):
        return [_rewrite_image_ids(child, replacements) for child in value]
    return value


def _referenced_image_ids():
    result = set()
    for content, cover in Note.objects.values_list("content", "cover").iterator(chunk_size=500):
        _image_ids_in(content, result)
        _image_ids_in(cover, result)
    for content, cover in BlogPost.objects.values_list("content", "cover").iterator(chunk_size=500):
        _image_ids_in(content, result)
        _image_ids_in(cover, result)
    return result


def _orphan_images():
    referenced = _referenced_image_ids()
    rows = []
    known_files = set()
    for image in MemoImage.objects.select_related("owner").iterator(chunk_size=500):
        name = image.file.name
        if not name or PurePosixPath(name).parent != PurePosixPath("memo-images") or not STORED_IMAGE.fullmatch(PurePosixPath(name).name):
            continue
        if name:
            known_files.add(name)
        if str(image.id).lower() in referenced:
            continue
        exists = bool(name and default_storage.exists(name))
        try:
            size = default_storage.size(name) if exists else 0
        except (OSError, ValueError):
            size = 0
        rows.append({
            "key": f"db:{image.id}", "id": str(image.id), "name": image.original_name,
            "owner": image.owner.username, "path": name, "exists": exists,
            "size": size, "kind": "record",
        })

    try:
        _, filenames = default_storage.listdir("memo-images")
    except (FileNotFoundError, NotImplementedError, OSError):
        filenames = []
    for filename in filenames:
        if not STORED_IMAGE.fullmatch(filename):
            continue
        path = str(PurePosixPath("memo-images") / filename)
        if path in known_files:
            continue
        image_id = filename.rsplit(".", 1)[0].lower()
        if image_id in referenced:
            continue
        try:
            size = default_storage.size(path)
        except (OSError, ValueError):
            size = 0
        rows.append({
            "key": f"file:{filename}", "id": image_id, "name": filename,
            "owner": "레코드 없음", "path": path, "exists": True,
            "size": size, "kind": "file",
        })
    return rows


def _change_note_owners(notes, target):
    note_ids = [note.id for note in notes]
    moving_keys = [note.daily_key for note in notes if not note.deleted and note.daily_key]
    duplicates = {key for key in moving_keys if moving_keys.count(key) > 1}
    existing = set(Note.objects.filter(owner=target, deleted=False, daily_key__in=moving_keys)
                   .exclude(id__in=note_ids).values_list("daily_key", flat=True))
    if duplicates | existing:
        return False, "대상 사용자에게 같은 날짜의 오늘의 메모가 있어 소유자를 변경하지 않았습니다."

    selected_image_ids = set()
    for note in notes:
        _image_ids_in(note.content, selected_image_ids)
        _image_ids_in(note.cover, selected_image_ids)
    outside_image_ids = set()
    for content, cover in Note.objects.exclude(id__in=note_ids).values_list("content", "cover").iterator(chunk_size=500):
        _image_ids_in(content, outside_image_ids)
        _image_ids_in(cover, outside_image_ids)
    for content, cover in BlogPost.objects.values_list("content", "cover").iterator(chunk_size=500):
        _image_ids_in(content, outside_image_ids)
        _image_ids_in(cover, outside_image_ids)
    shared_image_ids = selected_image_ids & outside_image_ids
    image_map = {}
    created_storage_names = []
    try:
        with transaction.atomic():
            for image in MemoImage.objects.filter(id__in=selected_image_ids):
                if str(image.id).lower() in shared_image_ids:
                    clone = MemoImage(owner=target, original_name=image.original_name, content_type=image.content_type)
                    with image.file.open("rb") as source:
                        clone.file.save(PurePosixPath(image.file.name).name, File(source), save=True)
                    created_storage_names.append(clone.file.name)
                    image_map[str(image.id).lower()] = str(clone.id)
                elif image.owner_id != target.pk:
                    image.owner = target
                    image.save(update_fields=["owner"])
            for note in notes:
                notebook, _ = Notebook.objects.get_or_create(owner=target, name=note.notebook.name)
                note.owner = target
                note.notebook = notebook
                if image_map:
                    note.content = _rewrite_image_ids(note.content, image_map)
                    note.cover = _rewrite_image_ids(note.cover, image_map)
                note.revision += 1
                note.updated_at = timezone.now()
                note.save(update_fields=["owner", "notebook", "content", "cover", "revision", "updated_at"])
        return True, f"메모 {len(notes)}개의 소유자를 {target.username}(으)로 변경했습니다."
    except IntegrityError:
        for name in created_storage_names:
            default_storage.delete(name)
        return False, "소유자 변경 중 데이터 충돌이 발생해 작업을 취소했습니다."
    except Exception:
        for name in created_storage_names:
            default_storage.delete(name)
        raise


@superuser_required
@require_http_methods(["GET", "POST"])
def backoffice_notes(request):
    if request.method == "POST":
        action = request.POST.get("action")
        if action == "update_one":
            note = Note.objects.select_related("owner", "notebook").filter(id=request.POST.get("note_id")).first()
            target = get_user_model().objects.filter(pk=request.POST.get("owner_id")).first()
            notebook = Notebook.objects.filter(pk=request.POST.get("notebook_id"), owner=target).first() if target else None
            public_value = request.POST.get("is_public")
            if not note or not target or not notebook or public_value not in {"true", "false"}:
                messages.error(request, "메모, 소유자, 메모장 또는 공개 범위 값이 올바르지 않습니다.")
                return redirect("backoffice-notes")
            if note.owner_id != target.pk:
                succeeded, message = _change_note_owners([note], target)
                if not succeeded:
                    messages.error(request, message)
                    return redirect("backoffice-notes")
                note.refresh_from_db()
            note.owner = target
            note.notebook = notebook
            note.is_public = public_value == "true"
            note.revision += 1
            note.updated_at = timezone.now()
            note.save(update_fields=["owner", "notebook", "is_public", "revision", "updated_at"])
            messages.success(request, f"‘{note.title or '제목 없는 메모'}’ 메모를 수정했습니다.")
            return redirect("backoffice-notes")

        ids = []
        for value in request.POST.getlist("selected"):
            try:
                ids.append(UUID(value))
            except (ValueError, TypeError, AttributeError):
                continue
        notes = list(Note.objects.filter(id__in=ids).select_related("notebook", "owner"))
        if not notes:
            messages.error(request, "처리할 메모를 선택해 주세요.")
        elif action == "delete":
            Note.objects.filter(id__in=[note.id for note in notes]).delete()
            messages.success(request, f"메모 {len(notes)}개를 영구 삭제했습니다. 사용되지 않는 이미지는 이미지 정리 화면에서 확인할 수 있습니다.")
        elif action in {"public", "private"}:
            count = Note.objects.filter(id__in=[note.id for note in notes]).update(is_public=(action == "public"), revision=F("revision") + 1, updated_at=timezone.now())
            messages.success(request, f"메모 {count}개의 공개 범위를 변경했습니다.")
        elif action == "notebook":
            notebook = Notebook.objects.select_related("owner").filter(pk=request.POST.get("notebook_id")).first()
            if notebook is None:
                messages.error(request, "변경할 메모장을 선택해 주세요.")
            elif any(note.owner_id != notebook.owner_id for note in notes):
                messages.error(request, "선택한 메모들의 소유자가 메모장 소유자와 같아야 합니다.")
            else:
                Note.objects.filter(id__in=[note.id for note in notes]).update(notebook=notebook, revision=F("revision") + 1, updated_at=timezone.now())
                messages.success(request, f"메모 {len(notes)}개의 메모장을 ‘{notebook.name}’으로 변경했습니다.")
        elif action == "owner":
            user_model = get_user_model()
            target = user_model.objects.filter(pk=request.POST.get("owner_id")).first()
            if target is None:
                messages.error(request, "소유자를 변경할 대상 사용자를 선택해 주세요.")
            else:
                succeeded, message = _change_note_owners(notes, target)
                (messages.success if succeeded else messages.error)(request, message)
        else:
            messages.error(request, "지원하지 않는 작업입니다.")
        return redirect("backoffice-notes")

    queryset = Note.objects.select_related("owner", "notebook")
    search = request.GET.get("q", "").strip()
    if search:
        queryset = queryset.filter(Q(title__icontains=search) | Q(plain_text__icontains=search) | Q(owner__username__icontains=search))
    visibility = request.GET.get("visibility", "")
    if visibility in {"public", "private"}:
        queryset = queryset.filter(is_public=(visibility == "public"))
    state = request.GET.get("state", "")
    if state in {"active", "trash"}:
        queryset = queryset.filter(deleted=(state == "trash"))
    page = Paginator(queryset.order_by("-updated_at"), 50).get_page(request.GET.get("page"))
    return render(request, "backoffice/notes.html", {
        "page": page, "search": search, "visibility": visibility, "state": state,
        "users": get_user_model().objects.order_by("username"),
        "notebooks": Notebook.objects.select_related("owner").order_by("owner__username", "name"),
        "section": "notes",
    })


@superuser_required
@require_http_methods(["GET", "POST"])
def backoffice_images(request):
    if request.method == "POST":
        candidates = {row["key"]: row for row in _orphan_images()}
        selected = set(request.POST.getlist("selected"))
        targets = [candidates[key] for key in selected if key in candidates]
        removed = 0
        for row in targets:
            if row["kind"] == "record":
                image = MemoImage.objects.filter(id=row["id"]).first()
                if image:
                    if image.file.name and image.file.name.startswith("memo-images/"):
                        default_storage.delete(image.file.name)
                    image.delete()
                    removed += 1
            else:
                # The submitted key is matched against a freshly recomputed,
                # storage-listed orphan; arbitrary storage paths are rejected.
                if row["path"].startswith("memo-images/"):
                    default_storage.delete(row["path"])
                    removed += 1
        messages.success(request, f"고아 이미지 {removed}개를 정리했습니다.")
        return redirect("backoffice-images")
    return render(request, "backoffice/images.html", {"images": _orphan_images(), "section": "images"})
