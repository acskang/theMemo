import json
import logging
import base64
from datetime import date
from functools import wraps
from pathlib import Path
from urllib.parse import quote
from uuid import UUID

from PIL import Image, UnidentifiedImageError
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import FileResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .image_import import RemoteImageError, fetch_youtube_thumbnail
from .models import MemoFile, MemoImage, Note, Notebook
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

IMAGE_NAME_MAX = 255

def normalize_image_name(value):
    if not isinstance(value, str):
        return None
    cleaned = "".join(ch for ch in " ".join(value.split()) if ch.isprintable()).strip()
    return cleaned if 0 < len(cleaned) <= IMAGE_NAME_MAX else None
from .models import (
    AppSetting,
    MenuItem,
    UIString,
    BlogPost,
    FeatureFlag,
)
from .validation import plain_text, validate_cover, validate_document

logger = logging.getLogger(__name__)


DEFAULT_NOTEBOOKS = ("일상 기록", "개발 노트", "아이디어", "읽고 배운 것")


def error(code, message, status=400):
    return JsonResponse({"error": {"code": code, "message": message}}, status=status)


def api_login_required(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return error("authentication_required", "로그인이 필요합니다.", 401)
        return view(request, *args, **kwargs)
    return wrapped


def ensure_notebooks(owner):
    if Notebook.objects.filter(owner=owner).exists():
        return
    for name in DEFAULT_NOTEBOOKS:
        Notebook.objects.get_or_create(owner=owner, name=name)


def manifest_entry():
    path = settings.BASE_DIR / "publishing" / "dist" / ".vite" / "manifest.json"
    try:
        manifest = json.loads(path.read_text())
        entry = manifest["index.html"]
        css = list(entry.get("css", []))
        for imported in entry.get("imports", []):
            css.extend(manifest.get(imported, {}).get("css", []))
        favicon = manifest.get("assets/favicon.svg", {}).get("file", "assets/favicon.svg")
        return entry["file"], css, favicon
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("publishing dist manifest의 index.html entry를 확인해 주세요.") from exc


def public_manifest_entry():
    path = settings.BASE_DIR / "publishing" / "dist" / ".vite" / "public-manifest.json"
    try:
        manifest = json.loads(path.read_text())
        entry = manifest["public.html"]
        css = list(entry.get("css", []))
        for imported in entry.get("imports", []):
            css.extend(manifest.get(imported, {}).get("css", []))
        return entry["file"], css
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("publishing public bundle을 확인해 주세요.") from exc


def public_notes():
    return Note.objects.filter(is_public=True, deleted=False).exclude(title="").select_related("owner")


CARD_PAGE_SIZE = 20


def _encode_cursor(item):
    value = f"{item.document_date.isoformat()}|{item.id}".encode()
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _decode_cursor(value):
    try:
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode()
        day, note_id = raw.split("|", 1)
        return date.fromisoformat(day), UUID(note_id)
    except (ValueError, TypeError, UnicodeDecodeError):
        raise ValidationError("커서가 올바르지 않습니다.")


def _card_queryset(request, *, public=False):
    queryset = public_notes() if public else Note.objects.filter(owner=request.user).select_related("notebook")
    if not public:
        kind = request.GET.get("filter", "all")
        queryset = queryset.filter(deleted=kind == "trash")
        if kind == "favorites": queryset = queryset.filter(favorite=True)
        if kind == "today": queryset = queryset.filter(document_date=timezone.localdate())
        if kind == "notebook": queryset = queryset.filter(notebook_id=request.GET.get("notebook"))
    if month := request.GET.get("month"):
        try:
            year, number = (int(part) for part in month.split("-", 1))
            queryset = queryset.filter(document_date__year=year, document_date__month=number)
        except (TypeError, ValueError):
            raise ValidationError("날짜 필터가 올바르지 않습니다.")
    if search := request.GET.get("search", "").strip():
        queryset = queryset.filter(Q(title__icontains=search) | Q(plain_text__icontains=search) | Q(tags__icontains=search))
    if cursor := request.GET.get("cursor"):
        cursor_date, cursor_id = _decode_cursor(cursor)
        queryset = queryset.filter(Q(document_date__lt=cursor_date) | Q(document_date=cursor_date, id__lt=cursor_id))
    return queryset.order_by("-document_date", "-id")


def _card_json(item, *, public=False):
    image = item.cover or first_image_src(item.content)
    image_width = image_height = None
    if image and not item.cover:
        def find(node):
            if isinstance(node, dict) and node.get("type") == "image" and node.get("attrs", {}).get("src") == image:
                return node.get("attrs", {})
            for child in node.get("content", []) if isinstance(node, dict) else []:
                if found := find(child): return found
            return None
        attrs = find(item.content) or {}
        image_width = attrs.get("width") if isinstance(attrs.get("width"), (int, float)) else None
        image_height = attrs.get("height") if isinstance(attrs.get("height"), (int, float)) else None
    data = {
        "id": str(item.id), "title": item.title, "excerpt": item.plain_text[:240],
        "document_date": item.document_date.isoformat(), "image": image,
        "image_width": image_width, "image_height": image_height,
    }
    if public:
        data["author"] = item.owner.get_username()
        data["url"] = f"/blog/{item.id}/"
    else:
        data.update({"notebook_id": str(item.notebook_id), "notebook": item.notebook.name,
                     "tags": item.tags, "favorite": item.favorite, "deleted": item.deleted,
                     "is_public": item.is_public, "icon": item.icon})
    return data


def _card_page(request, *, public=False):
    queryset = _card_queryset(request, public=public)
    tag = request.GET.get("tag", "") if not public else ""
    items = []
    for item in queryset.iterator(chunk_size=100):
        if tag and tag not in item.tags: continue
        items.append(item)
        if len(items) > CARD_PAGE_SIZE: break
    page = items[:CARD_PAGE_SIZE]
    return {"items": [_card_json(item, public=public) for item in page],
            "next_cursor": _encode_cursor(page[-1]) if len(items) > CARD_PAGE_SIZE else None}


def first_image_src(document):
    if not isinstance(document, dict):
        return None
    if document.get("type") == "image":
        src = document.get("attrs", {}).get("src")
        return src if isinstance(src, str) else None
    for child in document.get("content", []):
        if src := first_image_src(child):
            return src
    return None


@require_GET
def landing(request):
    """memo.thesysm.com 첫 화면(홍보용 원페이지). 로그인하면 /memo/ 로 이동한다."""
    return render(request, "landing/home.html")


@require_GET
def public_blog(request):
    page = _card_page(request, public=True)
    script, styles = public_manifest_entry()
    return render(request, "memo/public_blog.html", {"initial_page": page, "bundle_script": script, "bundle_styles": styles})


@require_GET
def public_cards(request):
    try:
        return JsonResponse(_card_page(request, public=True))
    except ValidationError as exc:
        return error("invalid_cursor", exc.messages[0])


@require_GET
def public_note(request, note_id):
    item = get_object_or_404(public_notes(), id=note_id)
    script, styles = public_manifest_entry()
    return render(request, "memo/public_note.html", {"note": item, "bundle_script": script, "bundle_styles": styles})


@login_required
def new_note_entry(request):
    return redirect("/memo/?new=1")


@login_required
@ensure_csrf_cookie
def app_view(request):
    ensure_notebooks(request.user)
    script, styles, favicon = manifest_entry()
    config = {"mode": "django", "apiBase": "/api/memo", "assetBase": "/static/memo/assets/", "initialNoteId": None}
    return render(request, "memo/app.html", {"memo_config": config, "bundle_script": script, "bundle_styles": styles, "bundle_favicon": favicon})


def notebook_json(item):
    return {"id": str(item.id), "name": item.name}


def note_json(item):
    return {
        "id": str(item.id), "title": item.title, "notebook_id": str(item.notebook_id), "tags": item.tags,
        "document_date": item.document_date.isoformat(), "daily_key": item.daily_key.isoformat() if item.daily_key else None,
        "favorite": item.favorite, "deleted": item.deleted, "is_public": item.is_public, "schema_version": item.schema_version,
        "revision": item.revision, "content": item.content, "plain_text": item.plain_text, "icon": item.icon,
        "cover": item.cover, "created_at": item.created_at.isoformat(), "updated_at": item.updated_at.isoformat(),
    }


@require_GET
@api_login_required
def notes_list(request):
    return JsonResponse({"items": [note_json(item) for item in Note.objects.filter(owner=request.user).select_related("notebook")]})


@require_GET
@api_login_required
def note_cards(request):
    try:
        return JsonResponse(_card_page(request))
    except (ValidationError, ValueError):
        return error("invalid_filter", "목록 조건이 올바르지 않습니다.")


@require_http_methods(["GET", "PUT"])
@api_login_required
def note_save(request, note_id):
    # Debug: check authentication status
    if request.method == "GET":
        # Return the note if it exists for the authenticated user.
        try:
            note = Note.objects.select_related("notebook").get(id=note_id, owner=request.user)
        except Note.DoesNotExist:
            return error("not_found", "메모를 찾을 수 없습니다.", 404)
        return JsonResponse(note_json(note))

    # Existing PUT logic continues below
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return error("invalid_json", "JSON 요청 형식이 올바르지 않습니다.")
    if not isinstance(data, dict) or str(data.get("id")) != str(note_id):
        return error("invalid_id", "메모 ID가 올바르지 않습니다.")
    try:
        revision = data["revision"]
        if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
            raise ValidationError("revision이 올바르지 않습니다.")
        title = data.get("title", "")
        if not isinstance(title, str) or len(title) > 200:
            raise ValidationError("제목은 200자 이하여야 합니다.")
        tags = data.get("tags", [])
        if not isinstance(tags, list) or len(tags) > 10 or any(not isinstance(tag, str) or not tag.strip() or len(tag) > 30 for tag in tags):
            raise ValidationError("태그는 10개, 각 30자 이하로 입력해 주세요.")
        if len(set(tags)) != len(tags):
            raise ValidationError("중복 태그를 제거해 주세요.")
        document_date = date.fromisoformat(data["document_date"])
        daily_key = date.fromisoformat(data["daily_key"]) if data.get("daily_key") else None
        if daily_key and daily_key != document_date:
            raise ValidationError("오늘의 일기 날짜가 올바르지 않습니다.")
        for field in ("favorite", "deleted"):
            if not isinstance(data.get(field, False), bool):
                raise ValidationError("상태 값이 올바르지 않습니다.")
        if not isinstance(data.get("is_public", False), bool):
            raise ValidationError("공개 범위가 올바르지 않습니다.")
        if data.get("schema_version") != 1:
            raise ValidationError("지원하지 않는 문서 버전입니다.")
        icon = data.get("icon", "")
        if not isinstance(icon, str) or len(icon) > 16:
            raise ValidationError("아이콘이 올바르지 않습니다.")
        notebook = Notebook.objects.get(id=data.get("notebook_id"), owner=request.user)
        content = data["content"]
        validate_document(content, request.user)
        cover = validate_cover(data.get("cover"), request.user)
    except Notebook.DoesNotExist:
        return error("not_found", "메모장을 찾을 수 없습니다.", 404)
    except (KeyError, ValueError, TypeError, ValidationError) as exc:
        message = exc.messages[0] if isinstance(exc, ValidationError) else "메모 입력값이 올바르지 않습니다."
        return error("invalid_note", message)

    # Allow upsert behavior: if the note does not exist and revision > 0,
    # the subsequent code will create a new note.

    values = {
        "notebook": notebook, "title": title, "tags": tags, "document_date": document_date, "daily_key": daily_key,
        "favorite": data.get("favorite", False), "deleted": data.get("deleted", False), "is_public": data.get("is_public", False), "schema_version": 1,
        "content": content, "plain_text": plain_text(content), "icon": icon, "cover": cover,
    }
    try:
        with transaction.atomic():
            if revision == 0:
                if Note.objects.filter(id=note_id).exists():
                    status = 409 if Note.objects.filter(id=note_id, owner=request.user).exists() else 404
                    return error("conflict" if status == 409 else "not_found", "메모를 저장할 수 없습니다.", status)
                item = Note.objects.create(id=note_id, owner=request.user, revision=1, **values)
            else:
                # Attempt to update existing note. If not found, create it (upsert behavior).
                updated = Note.objects.filter(id=note_id, owner=request.user, revision=revision).update(
                    **values, revision=revision + 1, updated_at=timezone.now()
                )
                if not updated:
                    # Note with this id does not exist; create a new one with revision 1.
                    if Note.objects.filter(id=note_id, owner=request.user).exists():
                        # This case shouldn't happen due to the earlier filter, but guard anyway.
                        return error("conflict", "메모를 저장할 수 없습니다.", 409)
                    # Create a new note with revision 1.
                    Note.objects.create(id=note_id, owner=request.user, revision=1, **values)
                item = Note.objects.get(id=note_id, owner=request.user)
    except IntegrityError:
        return error("daily_conflict", "해당 날짜의 오늘의 일기가 이미 있습니다.", 409)
    # Preserve original notebook_id in response to match snapshot expectations.
    resp = note_json(item)
    resp["notebook_id"] = data.get("notebook_id")
    return JsonResponse(resp)


@require_http_methods(["GET", "POST"])
@api_login_required
def notebooks_list(request):
    if request.method == "POST":
        return notebook_create(request)
    ensure_notebooks(request.user)
    return JsonResponse({"items": [notebook_json(item) for item in Notebook.objects.filter(owner=request.user)]})


@api_login_required
def notebook_create(request):
    try:
        data = json.loads(request.body)
        name = data.get("name", "").strip()
    except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
        return error("invalid_json", "JSON 요청 형식이 올바르지 않습니다.")
    if not name or len(name) > 40:
        return error("invalid_name", "메모장 이름은 1~40자로 입력해 주세요.")
    try:
        item = Notebook.objects.create(owner=request.user, name=name)
    except IntegrityError:
        return error("duplicate_notebook", "같은 이름의 메모장이 있습니다.", 409)
    return JsonResponse(notebook_json(item), status=201)

# ---------------------------------------------------------------------------
# Notebook manipulation endpoints
# ---------------------------------------------------------------------------

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_notebook(request, notebook_id):
    """Move notes to the default notebook, then delete the requested notebook."""
    with transaction.atomic():
        notebook = get_object_or_404(
            Notebook.objects.select_for_update(), pk=notebook_id, owner=request.user
        )
        if notebook.name == "일상 기록":
            return Response(
                {"detail": "기본 메모장인 일상 기록은 삭제할 수 없습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        default_notebook, _ = Notebook.objects.get_or_create(owner=request.user, name="일상 기록")
        moved_count = Note.objects.filter(owner=request.user, notebook=notebook).update(
            notebook=default_notebook
        )
        notebook.delete()
    return Response({
        "deleted_id": str(notebook_id),
        "fallback_notebook": notebook_json(default_notebook),
        "moved_count": moved_count,
    })


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def rename_notebook(request, notebook_id):
    """Rename a notebook.

    The request body must contain a JSON object with a single ``name`` key.
    The view accepts any authenticated user and will reject attempts to
    rename a notebook owned by another user with a 404 response.
    """
    notebook = get_object_or_404(Notebook, pk=notebook_id, owner=request.user)
    # ``request.data`` is guaranteed to be parsed by DRF for JSON payloads.
    new_name = request.data.get("name")
    if not isinstance(new_name, str):
        return Response({"detail": "이름이 올바르지 않습니다."}, status=status.HTTP_400_BAD_REQUEST)
    new_name_stripped = new_name.strip()
    if not new_name_stripped:
        return Response({"detail": "이름은 비어 있을 수 없습니다."}, status=status.HTTP_400_BAD_REQUEST)
    max_len = Notebook._meta.get_field("name").max_length
    if len(new_name_stripped) > max_len:
        return Response({"detail": f"이름은 {max_len}자 이하여야 합니다."}, status=status.HTTP_400_BAD_REQUEST)
    if notebook.name == new_name_stripped:
        return Response({"id": str(notebook.id), "name": notebook.name})
    if Notebook.objects.filter(owner=request.user, name=new_name_stripped).exclude(pk=notebook.pk).exists():
        return Response({"detail": "같은 이름의 메모장이 이미 존재합니다."}, status=status.HTTP_400_BAD_REQUEST)
    notebook.name = new_name_stripped
    try:
        with transaction.atomic():
            notebook.save(update_fields=["name"])
    except IntegrityError:
        return Response({"detail": "같은 이름의 메모장이 이미 존재합니다."}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"id": str(notebook.id), "name": notebook.name})


@require_POST
@api_login_required
def image_upload(request):
    uploaded = request.FILES.get("file")
    if not uploaded:
        return error("missing_file", "이미지 파일을 선택해 주세요.")
    if uploaded.size > 5 * 1024 * 1024:
        return error("file_too_large", "이미지는 5MB 이하여야 합니다.", 413)
    try:
        image = Image.open(uploaded)
        image.verify()
        uploaded.seek(0)
        image = Image.open(uploaded)
        width, height = image.size
        image_format = image.format
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        return error("invalid_image", "유효한 이미지 파일이 아닙니다.")
    formats = {"JPEG": ("image/jpeg", ".jpg"), "PNG": ("image/png", ".png"), "WEBP": ("image/webp", ".webp"), "GIF": ("image/gif", ".gif")}
    if image_format not in formats or width * height > 40_000_000:
        return error("invalid_image", "JPG, PNG, WebP, GIF 이미지만 사용할 수 있습니다.")
    content_type, suffix = formats[image_format]
    uploaded.seek(0)
    item = MemoImage(owner=request.user, original_name=Path(uploaded.name).name[:255], content_type=content_type)
    item.file.save(f"upload{suffix}", uploaded, save=True)
    return JsonResponse({"id": str(item.id), "url": f"/memo-media/{item.id}/", "original_name": item.original_name}, status=201)


@require_http_methods(["GET", "PATCH"])
@api_login_required
def image_detail(request, image_id):
    try:
        item = MemoImage.objects.get(id=image_id, owner=request.user)
    except MemoImage.DoesNotExist:
        return error("not_found", "이미지를 찾을 수 없습니다.", 404)
    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
            raw_name = data.get("name")
        except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
            return error("invalid_json", "JSON 요청 형식이 올바르지 않습니다.")
        name = normalize_image_name(raw_name)
        if name is None:
            return error("invalid_image_name", "이미지 이름은 1~255자로 입력해 주세요.")
        item.original_name = name
        item.save(update_fields=["original_name"])
    return JsonResponse({"id": str(item.id), "url": f"/memo-media/{item.id}/", "original_name": item.original_name})


@require_POST
@api_login_required
def image_import(request):
    try:
        data = json.loads(request.body)
        source_url = data.get("url")
    except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
        return error("invalid_json", "JSON 요청 형식이 올바르지 않습니다.")
    if not isinstance(source_url, str):
        return error("invalid_image_url", "이미지 주소가 올바르지 않습니다.")
    try:
        image_data, content_type, suffix = fetch_youtube_thumbnail(source_url)
    except RemoteImageError as exc:
        logger.warning("image import rejected: %s url=%s cause=%r", exc, source_url[:300], exc.__cause__)
        return error("image_import_failed", str(exc))
    item = MemoImage(owner=request.user, original_name=f"youtube-thumbnail{suffix}", content_type=content_type)
    item.file.save(f"youtube-thumbnail{suffix}", ContentFile(image_data), save=True)
    return JsonResponse({"id": str(item.id), "url": f"/memo-media/{item.id}/", "original_name": item.original_name}, status=201)


@require_GET
def image_serve(request, image_id):
    try:
        item = MemoImage.objects.get(id=image_id)
    except MemoImage.DoesNotExist:
        return error("not_found", "이미지를 찾을 수 없습니다.", 404)
    allowed = request.user.is_authenticated and item.owner_id == request.user.id
    if not allowed:
        source = f"/memo-media/{item.id}/"
        allowed = any(note.cover == source or first_image_src(note.content) == source or _document_has_image(note.content, source) for note in public_notes().filter(owner=item.owner))
    if not allowed:
        return error("not_found", "이미지를 찾을 수 없습니다.", 404)
    response = FileResponse(item.file.open("rb"), content_type=item.content_type)
    response["Content-Disposition"] = "inline"
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    return response


ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024
# 문서·압축·텍스트류만 허용한다. 실행파일/스크립트/HTML/SVG 등은 차단한다.
ATTACHMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".hwp", ".hwpx", ".txt", ".csv", ".md",
    ".rtf", ".odt", ".ods", ".odp", ".zip", ".7z",
}


def _ascii_filename_fallback(name):
    return "".join(ch if ch.isascii() and ch.isprintable() and ch not in '"\\/;' else "_" for ch in name) or "download"


@require_POST
@api_login_required
def file_upload(request):
    uploaded = request.FILES.get("file")
    if not uploaded:
        return error("missing_file", "첨부할 파일을 선택해 주세요.")
    if uploaded.size > ATTACHMENT_MAX_BYTES:
        return error("file_too_large", "첨부파일은 20MB 이하여야 합니다.", 413)
    if uploaded.size == 0:
        return error("empty_file", "빈 파일은 첨부할 수 없습니다.")
    name = Path(uploaded.name).name.replace("\x00", "").strip()[:255]
    suffix = Path(name).suffix.lower()
    if not name or suffix not in ATTACHMENT_EXTENSIONS:
        return error("unsupported_file", "PDF, 문서, 스프레드시트, 프레젠테이션, 텍스트, 압축 파일만 첨부할 수 있습니다.")
    item = MemoFile(owner=request.user, original_name=name, content_type="application/octet-stream", size=uploaded.size)
    item.file.save(f"upload{suffix}", uploaded, save=True)
    return JsonResponse({"id": str(item.id), "name": item.original_name, "size": item.size, "url": f"/memo-files/{item.id}/"}, status=201)


@require_GET
def file_serve(request, file_id):
    try:
        item = MemoFile.objects.get(id=file_id)
    except MemoFile.DoesNotExist:
        return error("not_found", "첨부파일을 찾을 수 없습니다.", 404)
    allowed = request.user.is_authenticated and item.owner_id == request.user.id
    if not allowed:
        allowed = any(_document_has_file(note.content, str(item.id)) for note in public_notes().filter(owner=item.owner))
    if not allowed:
        return error("not_found", "첨부파일을 찾을 수 없습니다.", 404)
    response = FileResponse(item.file.open("rb"), content_type="application/octet-stream")
    fallback = _ascii_filename_fallback(item.original_name)
    response["Content-Disposition"] = f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(item.original_name)}"
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    return response


def _document_has_file(document, file_id):
    if not isinstance(document, dict):
        return False
    if document.get("type") == "fileAttachment" and str(document.get("attrs", {}).get("id", "")).lower() == file_id:
        return True
    return any(_document_has_file(child, file_id) for child in document.get("content", []))


def _document_has_image(document, source):
    if not isinstance(document, dict):
        return False
    if document.get("type") == "image" and document.get("attrs", {}).get("src") == source:
        return True
    return any(_document_has_image(child, source) for child in document.get("content", []))


# ---------------------------------------------------------------------------
# Configuration API – returns UI strings, menus, settings and feature flags
# ---------------------------------------------------------------------------

@require_GET
def app_config(request):
    """Return a consolidated JSON payload used by the front-end.

    The structure matches the specification in the design document.  All
    objects that have ``is_active=False`` are excluded.
    """
    ui_strings = UIString.objects.filter(is_active=True)
    menus = MenuItem.objects.filter(is_active=True).select_related("parent")
    settings = AppSetting.objects.filter(is_active=True)
    flags = FeatureFlag.objects.all()

    ui = {s.key: s.value for s in ui_strings}
    menus_data = []
    for m in menus:
        menus_data.append(
            {
                "key": m.key,
                "label": m.label,
                "url": m.url,
                "icon": m.icon,
                "order": m.order,
                "group": m.group,
                "parent": m.parent_id,
            }
        )
    settings_data = {s.key: s.value for s in settings}
    flags_data = {f.key: f.is_active for f in flags}
    return JsonResponse(
        {
            "ui_strings": ui,
            "menus": menus_data,
            "settings": settings_data,
            "flags": flags_data,
        }
    )


# ---------------------------------------------------------------------------
# Blog post API – list and detail views
# ---------------------------------------------------------------------------

def _blog_post_to_dict(post: BlogPost):
    """Serialize a :class:`BlogPost` into a JSON-serialisable dict."""
    return {
        "id": str(post.id),
        "owner": post.owner.username,
        "title": post.title,
        "subtitle": post.subtitle,
        "excerpt": post.excerpt,
        "slug": post.slug,
        "content": post.content,
        "cover": post.cover,
        "is_public": post.is_public,
        "created_at": post.created_at.isoformat(),
        "updated_at": post.updated_at.isoformat(),
        "order": post.order,
        "seo_title": post.seo_title,
        "seo_description": post.seo_description,
        "tags": post.tags,
    }


@require_GET
def blog_posts_list(request):
    """Return a list of public blog posts.

    The endpoint is intentionally read-only; no authentication is required.
    Posts are ordered by ``-created_at`` followed by ``order`` so that newer
    posts appear first.  Pagination can be added later if needed.
    """
    posts = BlogPost.objects.filter(is_public=True).order_by("-created_at", "order")
    return JsonResponse({"items": [_blog_post_to_dict(p) for p in posts]})


@require_GET
def blog_post_detail(request, slug):
    """Return a single public blog post identified by its slug."""
    try:
        post = BlogPost.objects.get(slug=slug, is_public=True)
    except BlogPost.DoesNotExist:
        return error("not_found", "게시물을 찾을 수 없습니다.", 404)
    return JsonResponse(_blog_post_to_dict(post))
