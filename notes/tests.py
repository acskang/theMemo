import io
import json
import tempfile
import uuid
from unittest.mock import patch

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings

from .models import Note, Notebook
import json
from pathlib import Path
from django.contrib.auth import get_user_model
from .validation import validate_document
from .image_import import MAX_IMAGE_BYTES, RemoteImageError, fetch_youtube_thumbnail, normalize_remote_image


TEST_MEDIA = tempfile.mkdtemp(prefix="thememo-tests-")


@override_settings(MEDIA_ROOT=TEST_MEDIA)
class AuthenticationFlowTests(TestCase):
    password = "SafeMemo!24680"

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user("auth-owner", password=cls.password)

    def csrf_client(self, path):
        client = Client(enforce_csrf_checks=True)
        response = client.get(path)
        return client, response.cookies["csrftoken"].value

    def test_signup_success_duplicate_and_password_validation(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.post("/signup/", {"username": "no-csrf"}).status_code, 403)
        token = client.get("/signup/").cookies["csrftoken"].value
        response = client.post("/signup/", {
            "csrfmiddlewaretoken": token, "username": "new-member",
            "password1": "AnotherSafe!24680", "password2": "AnotherSafe!24680",
        }, follow=True)
        self.assertRedirects(response, "/login/")
        self.assertContains(response, "회원가입이 완료되었습니다")
        created = get_user_model().objects.get(username="new-member")
        self.assertFalse(created.is_staff)
        self.assertFalse(created.is_superuser)
        self.assertEqual(Note.objects.filter(owner=created).count(), 0)
        self.assertEqual(Notebook.objects.filter(owner=created).count(), 0)

        client, token = self.csrf_client("/signup/")
        duplicate = client.post("/signup/", {
            "csrfmiddlewaretoken": token, "username": "new-member",
            "password1": "AnotherSafe!24680", "password2": "AnotherSafe!24680",
        })
        self.assertContains(duplicate, "이미 존재합니다")
        # 베타 테스트 기간에는 약한 비밀번호도 허용한다. 종료 후 강한 비밀번호 검증을 복원하면 이 검증을 뒤집을 것.
        weak = client.post("/signup/", {
            "csrfmiddlewaretoken": token, "username": "weak-member", "password1": "123", "password2": "123",
        })
        self.assertEqual(weak.status_code, 302)
        self.assertTrue(get_user_model().objects.filter(username="weak-member").exists())

    def test_login_success_failure_safe_next_and_csrf(self):
        csrf_client = Client(enforce_csrf_checks=True)
        self.assertEqual(csrf_client.post("/login/", {"username": self.user.username, "password": self.password}).status_code, 403)
        token = csrf_client.get("/login/").cookies["csrftoken"].value
        failed = csrf_client.post("/login/", {"csrfmiddlewaretoken": token, "username": self.user.username, "password": "wrong"})
        self.assertContains(failed, "사용자 이름 또는 비밀번호가 올바르지 않습니다")
        external = csrf_client.post("/login/", {
            "csrfmiddlewaretoken": token, "username": self.user.username, "password": self.password,
            "next": "https://evil.example/steal",
        })
        self.assertRedirects(external, "/memo/", fetch_redirect_response=False)
        token = csrf_client.get("/memo/").cookies["csrftoken"].value
        csrf_client.post("/logout/", {"csrfmiddlewaretoken": token})
        token = csrf_client.get("/login/?next=/password/change/").cookies["csrftoken"].value
        local = csrf_client.post("/login/", {
            "csrfmiddlewaretoken": token, "username": self.user.username, "password": self.password,
            "next": "/password/change/",
        })
        self.assertRedirects(local, "/password/change/", fetch_redirect_response=False)

    def test_logout_requires_post_and_csrf(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        token = client.get("/memo/").cookies["csrftoken"].value
        self.assertEqual(client.get("/logout/").status_code, 405)
        self.assertEqual(client.post("/logout/").status_code, 403)
        response = client.post("/logout/", {"csrfmiddlewaretoken": token})
        self.assertRedirects(response, "/", fetch_redirect_response=False)
        self.assertNotIn("_auth_user_id", client.session)

    def test_password_change_errors_success_and_keeps_session(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        token = client.get("/password/change/").cookies["csrftoken"].value
        self.assertEqual(client.post("/password/change/", {"old_password": self.password}).status_code, 403)
        wrong = client.post("/password/change/", {
            "csrfmiddlewaretoken": token, "old_password": "wrong",
            "new_password1": "ChangedSafe!24680", "new_password2": "ChangedSafe!24680",
        })
        self.assertContains(wrong, "현재 비밀번호가 올바르지 않습니다")
        changed = client.post("/password/change/", {
            "csrfmiddlewaretoken": token, "old_password": self.password,
            "new_password1": "ChangedSafe!24680", "new_password2": "ChangedSafe!24680",
        }, follow=True)
        self.assertRedirects(changed, "/password/change/")
        self.assertContains(changed, "비밀번호가 변경되었습니다")
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("ChangedSafe!24680"))
        self.assertEqual(client.get("/memo/").status_code, 200)
        self.assertIn("_auth_user_id", client.session)

    def test_protected_routes_and_new_user_initialization_stay_owner_scoped(self):
        anonymous = Client()
        self.assertRedirects(anonymous.get("/password/change/"), "/login/?next=/password/change/")
        self.assertEqual(anonymous.get("/api/memo/notes/").status_code, 401)
        other = get_user_model().objects.create_user("empty-owner", password=self.password)
        client = Client(); client.force_login(other)
        self.assertEqual(client.get("/memo/").status_code, 200)
        self.assertEqual(Notebook.objects.filter(owner=other).count(), 4)
        self.assertEqual(Note.objects.filter(owner=other).count(), 0)
        self.assertEqual(Notebook.objects.filter(owner=self.user).count(), 0)


@override_settings(MEDIA_ROOT=TEST_MEDIA)
class MemoApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        users = get_user_model().objects
        cls.user = users.create_user("owner", password="test-password")
        cls.other = users.create_user("other", password="test-password")
        cls.notebook = Notebook.objects.create(owner=cls.user, name="테스트")
        cls.other_notebook = Notebook.objects.create(owner=cls.other, name="남의 메모장")

    def setUp(self):
        self.client.force_login(self.user)

    def payload(self, note_id=None, **changes):
        data = {
            "id": str(note_id or uuid.uuid4()), "title": "기록", "notebook_id": str(self.notebook.id),
            "tags": ["일상"], "document_date": "2026-11-10", "daily_key": None,
            "favorite": False, "deleted": False, "schema_version": 1, "revision": 0,
            "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "안전한 본문", "marks": [{"type": "bold"}]}]}]},
            "icon": "✍️", "cover": None,
        }
        data.update(changes)
        return data

    def put(self, data):
        return self.client.put(f"/api/memo/notes/{data['id']}/", json.dumps(data), content_type="application/json")

    def image_file(self, name="photo.png"):
        stream = io.BytesIO()
        Image.new("RGB", (8, 8), "blue").save(stream, "PNG")
        return SimpleUploadedFile(name, stream.getvalue(), content_type="image/png")

    def test_authentication_and_csrf_boundaries(self):
        anonymous = Client()
        self.assertEqual(anonymous.get("/").status_code, 200)
        self.assertRedirects(anonymous.get("/memo/"), "/login/?next=/memo/")
        self.assertEqual(anonymous.get("/api/memo/notes/").status_code, 401)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.user)
        response = csrf_client.post("/api/memo/notebooks/", json.dumps({"name": "거부"}), content_type="application/json")
        self.assertEqual(response.status_code, 403)

    def test_authenticated_app_uses_django_bootstrap_and_existing_bundle(self):
        response = self.client.get("/memo/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="smartmemo-config"')
        self.assertContains(response, '"mode": "django"')
        self.assertNotContains(response, '"mode":"demo"')
        self.assertContains(response, "/static/memo/assets/index-")
        # 이미 메모장이 있는 사용자에게는 기본 메모장을 다시 만들지 않는다.
        self.assertEqual(Notebook.objects.filter(owner=self.user).count(), 1)

    def test_create_update_requery_preserves_json_and_state(self):
        data = self.payload(favorite=True)
        created = self.put(data)
        self.assertEqual(created.status_code, 200)
        saved = created.json()
        self.assertEqual(saved["revision"], 1)
        self.assertEqual(saved["content"], data["content"])
        self.assertEqual(saved["plain_text"], "안전한 본문")
        saved.update({"revision": 1, "deleted": True, "favorite": False})
        updated = self.put(saved)
        self.assertEqual(updated.status_code, 200)
        saved = updated.json()
        saved.update({"revision": 2, "deleted": False})
        self.assertEqual(self.put(saved).status_code, 200)
        item = self.client.get("/api/memo/notes/").json()["items"][0]
        self.assertFalse(item["deleted"])
        self.assertEqual(item["tags"], ["일상"])

    def test_tiptap_starter_kit_marks_from_pasted_html_are_accepted(self):
        marks = [{"type": mark} for mark in ("bold", "italic", "strike", "code", "underline")]
        content = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "붙여넣은 본문", "marks": marks},
            ]}],
        }
        response = self.put(self.payload(content=content))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["content"], content)

    def test_stale_revision_returns_409_without_overwrite(self):
        data = self.payload()
        saved = self.put(data).json()
        current = {**saved, "revision": 1, "title": "최신 제목"}
        self.assertEqual(self.put(current).status_code, 200)
        stale = {**saved, "revision": 1, "title": "덮어쓰기"}
        self.assertEqual(self.put(stale).status_code, 409)
        self.assertEqual(Note.objects.get(id=data["id"]).title, "최신 제목")


class ValidationSnapshotTests(MemoApiTests):
    """Regression test for the "save‑failure‑note.json" snapshot.

    The original issue caused a ``ValidationError`` because the front‑end
    emitted a ``link`` mark that contained a ``title`` attribute, which
    was not whitelisted in :pydata:`MARK_ATTRS` inside
    ``notes/validation.py``.

    This test ensures that the updated validator accepts the snapshot
    without raising an exception and that the document structure is
    otherwise unchanged.
    """

    @staticmethod
    def _load_snapshot() -> dict:
        snapshot_path = Path(__file__).resolve().parent.parent / "docs" / "save-failure-note.json"
        with snapshot_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data

    def test_snapshot_validates(self):
        data = self._load_snapshot()
        user = get_user_model().objects.create_user("snapshot-user")
        # ``validate_document`` should not raise ``ValidationError`` for this input.
        try:
            validate_document(data["content"], user)
        except Exception as exc:
            self.fail(f"validate_document raised an unexpected exception: {exc}")

    def test_other_user_resources_are_hidden(self):
        foreign_id = uuid.uuid4()
        Note.objects.create(
            id=foreign_id, owner=self.other, notebook=self.other_notebook, title="비밀", document_date="2026-11-10",
            content={"type": "doc", "content": [{"type": "paragraph"}]}, plain_text="",
        )
        data = self.payload(note_id=foreign_id)
        self.assertEqual(self.put(data).status_code, 404)
        data = self.payload(notebook_id=str(self.other_notebook.id))
        self.assertEqual(self.put(data).status_code, 404)
        self.client.force_login(self.other)
        image = self.client.post("/api/memo/images/", {"file": self.image_file()}).json()
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(image["url"]).status_code, 404)
        data = self.payload(content={"type": "doc", "content": [{"type": "image", "attrs": {"src": image["url"], "alt": "", "caption": "", "width": "100%"}}]})
        self.assertEqual(self.put(data).status_code, 400)

    def test_rejects_unsafe_json_and_urls(self):
        bad_node = self.payload(content={"type": "doc", "content": [{"type": "html", "attrs": {"onerror": "alert(1)"}}]})
        self.assertEqual(self.put(bad_node).status_code, 400)
        bad_link = self.payload(content={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x", "marks": [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}]}]}]})
        self.assertEqual(self.put(bad_link).status_code, 400)
        external_image = self.payload(content={"type": "doc", "content": [{"type": "image", "attrs": {"src": "https://example.com/a.png"}}]})
        self.assertEqual(self.put(external_image).status_code, 400)

    def test_tiptap_table_cell_align_round_trips(self):
        content = {
            "type": "doc",
            "content": [{
                "type": "table",
                "content": [{
                    "type": "tableRow",
                    "content": [{
                        "type": "tableCell",
                        "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None, "align": None},
                        "content": [{"type": "paragraph", "attrs": {"textAlign": None}, "content": [{
                            "type": "text",
                            "text": "서식",
                            "marks": [{"type": "textStyle", "attrs": {
                                "backgroundColor": "", "color": "#f9fafb", "fontFamily": "", "fontSize": "", "lineHeight": "1.5",
                            }}],
                        }]}],
                    }],
                }],
            }],
        }
        created = self.put(self.payload(content=content))
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["content"], content)
        stored = next(item for item in self.client.get("/api/memo/notes/").json()["items"] if item["id"] == created.json()["id"])
        self.assertEqual(stored["content"], content)

        unsafe = self.payload(content={
            "type": "doc",
            "content": [{"type": "table", "content": [{"type": "tableRow", "content": [{
                "type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None, "align": "expression(alert(1))"},
                "content": [{"type": "paragraph"}],
            }]}]}],
        })
        self.assertEqual(self.put(unsafe).status_code, 400)

    def test_block_line_height_round_trips_and_rejects_invalid_value(self):
        content = {"type": "doc", "content": [
            {"type": "paragraph", "attrs": {"textAlign": None, "lineHeight": "1.75"}, "content": [{"type": "text", "text": "첫 문단"}]},
            {"type": "heading", "attrs": {"level": 2, "textAlign": None, "lineHeight": "2.1"}, "content": [{"type": "text", "text": "제목"}]},
        ]}
        response = self.put(self.payload(content=content))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["content"], content)

        for invalid in ("0.99", "3.01", "9", 1.75):
            content["content"][0]["attrs"]["lineHeight"] = invalid
            self.assertEqual(self.put(self.payload(content=content)).status_code, 400)

    def test_private_image_upload_insert_and_retrieve(self):
        response = self.client.post("/api/memo/images/", {"file": self.image_file("../photo.png")})
        self.assertEqual(response.status_code, 201)
        image = response.json()
        self.assertEqual(image["original_name"], "photo.png")
        content = {"type": "doc", "content": [{"type": "image", "attrs": {"src": image["url"], "alt": "파란색", "caption": "사진", "width": "100%"}}]}
        self.assertEqual(self.put(self.payload(content=content, cover=image["url"])).status_code, 200)
        served = self.client.get(image["url"])
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served["Cache-Control"], "private, no-store")
        anonymous = Client()
        self.assertEqual(anonymous.get(image["url"]).status_code, 404)

    def test_public_blog_detail_and_referenced_image_follow_visibility(self):
        uploaded = self.client.post("/api/memo/images/", {"file": self.image_file("public.png")}).json()
        unlinked = self.client.post("/api/memo/images/", {"file": self.image_file("unlinked.png")}).json()
        content = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "공개 본문"}]}, {"type": "image", "attrs": {"src": uploaded["url"], "alt": "", "caption": "", "width": "100%"}}]}
        created = self.put(self.payload(title="공개 기록", content=content, is_public=True)).json()
        self.assertTrue(created["is_public"])
        self.assertTrue(next(item for item in self.client.get("/api/memo/notes/").json()["items"] if item["id"] == created["id"])["is_public"])
        self.put(self.payload(title="비공개 기록", is_public=False))
        trashed = self.put(self.payload(title="휴지통 공개 기록", is_public=True, deleted=True)).json()
        draft = self.put(self.payload(title="", is_public=True)).json()

        anonymous = Client()
        listing = anonymous.get("/blog/")
        self.assertEqual(listing.status_code, 200)
        self.assertContains(listing, "공개 기록")
        self.assertNotContains(listing, "비공개 기록")
        self.assertNotContains(listing, "휴지통 공개 기록")
        detail = anonymous.get(f"/blog/{created['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertContains(detail, 'id="public-note-json"')
        self.assertEqual(anonymous.get(uploaded["url"]).status_code, 200)
        self.assertEqual(anonymous.get(unlinked["url"]).status_code, 404)

        private_id = self.put(self.payload(title="직접 접근 비공개", is_public=False)).json()["id"]
        self.assertEqual(anonymous.get(f"/blog/{private_id}/").status_code, 404)
        self.assertEqual(anonymous.get(f"/blog/{trashed['id']}/").status_code, 404)
        self.assertEqual(anonymous.get(f"/blog/{draft['id']}/").status_code, 404)
        self.client.force_login(self.other)
        self.assertEqual(self.put({**created, "revision": created["revision"], "title": "침범"}).status_code, 404)
        self.client.force_login(self.user)
        hidden = self.put({**created, "revision": created["revision"], "is_public": False})
        self.assertEqual(hidden.status_code, 200)
        self.assertFalse(hidden.json()["is_public"])
        self.assertFalse(next(item for item in self.client.get("/api/memo/notes/").json()["items"] if item["id"] == created["id"])["is_public"])
        self.assertEqual(anonymous.get(f"/blog/{created['id']}/").status_code, 404)
        self.assertEqual(anonymous.get(uploaded["url"]).status_code, 404)

    def test_card_cursor_pages_are_stable_minimal_and_owner_scoped(self):
        for index in range(45):
            Note.objects.create(
                id=uuid.uuid4(), owner=self.user, notebook=self.notebook, title=f"카드 {index:02d}",
                tags=["짝수" if index % 2 == 0 else "홀수"], document_date="2026-11-10",
                content={"type": "doc", "content": [{"type": "paragraph"}]}, plain_text=f"요약 {index}",
                is_public=index < 3,
            )
        first = self.client.get("/api/memo/cards/")
        self.assertEqual(first.status_code, 200)
        first_page = first.json()
        self.assertEqual(len(first_page["items"]), 20)
        self.assertNotIn("content", first_page["items"][0])
        second_page = self.client.get("/api/memo/cards/", {"cursor": first_page["next_cursor"]}).json()
        third_page = self.client.get("/api/memo/cards/", {"cursor": second_page["next_cursor"]}).json()
        ids = [item["id"] for page in (first_page, second_page, third_page) for item in page["items"]]
        self.assertEqual(len(ids), 45)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIsNone(third_page["next_cursor"])
        self.client.force_login(self.other)
        self.assertEqual(self.client.get("/api/memo/cards/").json()["items"], [])
        public = Client().get("/api/public/cards/").json()
        self.assertEqual(len(public["items"]), 3)
        self.assertTrue(all("content" not in item and "notebook" not in item for item in public["items"]))

    @patch("notes.views.fetch_youtube_thumbnail")
    def test_youtube_import_becomes_owned_image_and_round_trips(self, fetch):
        stream = io.BytesIO()
        Image.new("RGB", (8, 8), "red").save(stream, "JPEG")
        fetch.return_value = (stream.getvalue(), "image/jpeg", ".jpg")
        source = "https://i.ytimg.com/vi/abcdefghijk/hq720.jpg"
        imported = self.client.post("/api/memo/images/import/", json.dumps({"url": source}), content_type="application/json")
        self.assertEqual(imported.status_code, 201)
        protected = imported.json()["url"]
        content = {"type": "doc", "content": [{"type": "image", "attrs": {
            "src": protected, "alt": "thumbnail", "title": None, "caption": "", "width": "100%", "height": None,
            "linkUrl": "https://www.youtube.com/watch?v=abcdefghijk",
        }}]}
        created = self.put(self.payload(content=content))
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["content"], content)
        self.assertEqual(self.client.get(protected).status_code, 200)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(protected).status_code, 404)

    def test_image_block_metadata_round_trips_and_rejects_unsafe_values(self):
        response = self.client.post("/api/memo/images/", {"file": self.image_file()})
        protected = response.json()["url"]
        base = {"src": protected, "alt": "", "caption": "한글 캡션", "width": 640, "height": None, "alignment": "right"}
        content = {"type": "doc", "content": [{"type": "image", "attrs": {**base, "linkUrl": "https://example.com/watch?q=1"}}]}
        created = self.put(self.payload(content=content))
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["content"], content)
        stored = next(item for item in self.client.get("/api/memo/notes/").json()["items"] if item["id"] == created.json()["id"])
        self.assertEqual(stored["content"], content)

        for link in ("javascript:alert(1)", "data:image/png;base64,AA==", "https://attacker@example.com/path"):
            content = {"type": "doc", "content": [{"type": "image", "attrs": {**base, "linkUrl": link}}]}
            self.assertEqual(self.put(self.payload(content=content)).status_code, 400)
        for changes in ({"width": 0}, {"width": 2401}, {"width": "640px"}, {"alignment": "justify"}, {"caption": "x" * 301}):
            content = {"type": "doc", "content": [{"type": "image", "attrs": {**base, **changes}}]}
            self.assertEqual(self.put(self.payload(content=content)).status_code, 400)

    def test_rejects_disguised_and_oversized_images(self):
        fake = SimpleUploadedFile("fake.png", b"<html>not an image</html>", content_type="image/png")
        self.assertEqual(self.client.post("/api/memo/images/", {"file": fake}).status_code, 400)
        large = SimpleUploadedFile("large.png", b"x" * (5 * 1024 * 1024 + 1), content_type="image/png")
        self.assertEqual(self.client.post("/api/memo/images/", {"file": large}).status_code, 413)

    def test_active_daily_note_is_unique_and_restore_conflicts(self):
        first = self.payload(daily_key="2026-11-10")
        saved = self.put(first).json()
        second = self.payload(daily_key="2026-11-10")
        self.assertEqual(self.put(second).status_code, 409)
        saved.update({"revision": 1, "deleted": True})
        trashed = self.put(saved).json()
        self.assertEqual(self.put(second).status_code, 200)
        trashed.update({"revision": 2, "deleted": False})
        self.assertEqual(self.put(trashed).status_code, 409)

    # ---------------------------------------------------------------------
    # Notebook delete & rename tests
    # ---------------------------------------------------------------------
    def test_delete_own_notebook(self):
        notebook = Notebook.objects.create(owner=self.user, name="삭제 테스트")
        count_before = Notebook.objects.filter(owner=self.user).count()
        response = self.client.delete(f"/api/memo/notebooks/{notebook.id}/delete/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Notebook.objects.filter(id=notebook.id).exists())
        self.assertTrue(Notebook.objects.filter(owner=self.user, name="일상 기록").exists())
        self.assertEqual(Notebook.objects.filter(owner=self.user).count(), count_before)

    def test_delete_other_user_notebook(self):
        notebook = Notebook.objects.create(owner=self.other, name="다른 사람 메모장")
        response = self.client.delete(f"/api/memo/notebooks/{notebook.id}/delete/")
        self.assertEqual(response.status_code, 404)

    def test_rename_own_notebook(self):
        notebook = Notebook.objects.create(owner=self.user, name="이름 변경 테스트")
        new_name = "새 이름"
        response = self.client.patch(
            f"/api/memo/notebooks/{notebook.id}/rename/",
            json.dumps({"name": new_name}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        notebook.refresh_from_db()
        self.assertEqual(notebook.name, new_name)

    def test_rename_other_user_notebook(self):
        notebook = Notebook.objects.create(owner=self.other, name="다른 사람 메모장")
        response = self.client.patch(
            f"/api/memo/notebooks/{notebook.id}/rename/",
            json.dumps({"name": "악성 이름"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)


class SnapshotValidationAndPersistenceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        users = get_user_model().objects
        cls.user = users.create_user("snapshot-user", password="test-password")
        # Create a notebook with the specific UUID that appears in the snapshot
        # so the view can find it. The name is arbitrary but kept short.
        cls.notebook = Notebook.objects.create(
            id="966639ae-dc12-45df-9a88-9fc5efc9ba18",
            owner=cls.user,
            name="테스트",
        )
        # The original test used a class‑level client that was never
        # attached to the instance used in each test method.  Django's
        # TestCase automatically creates a fresh ``self.client`` for
        # every test, so the forced login performed here was ignored.
        # To keep the test suite working we store the client on the
        # class and then log in the instance client in a custom
        # ``setUp`` method below.
        cls.client = Client()
        cls.client.force_login(cls.user)

    def setUp(self):
        super().setUp()
        # Attach the class‑level authenticated client to the instance
        # so that the test methods can use ``self.client`` as expected.
        self.client = self.__class__.client

    def _load_snapshot(self):
        snapshot_path = Path(__file__).resolve().parent.parent / "docs" / "save-failure-current.json"
        with snapshot_path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def test_snapshot_can_be_saved_and_retrieved(self):
        data = self._load_snapshot()
        # Use PUT to create or update the note
        # Ensure the client is logged in for this test
        self.client.force_login(self.user)
        response = self.client.put(f"/api/memo/notes/{data['id']}/", json.dumps(data), content_type="application/json")
        self.assertEqual(response.status_code, 200, msg="PUT should succeed for snapshot")
        saved = response.json()
        # Ensure the content matches
        self.assertEqual(saved["content"], data["content"], msg="Content should round‑trip")
        # Now retrieve via GET
        get_resp = self.client.get(f"/api/memo/notes/{data['id']}/")
        self.assertEqual(get_resp.status_code, 200, msg="GET should succeed after PUT")
        retrieved = get_resp.json()
        self.assertEqual(retrieved["content"], data["content"], msg="GET content should match snapshot")


class RemoteImageFetchTests(TestCase):
    ACTUAL_YOUTUBE_URL = "https://i.ytimg.com/vi/7mQwJhtotxM/hq720.jpg?sqp=-oaymwEnCNAFEJQDSFryq4qpAxkIARUAAIhCGAHYAQHiAQoIGBACGAY4AUAB&rs=AOn4CLCIHtNfJPWMcOdyxYtvR83kxu0lRA"
    class Response(io.BytesIO):
        def __init__(self, data=b"", status=200, headers=None):
            super().__init__(data)
            self.status = status
            self.headers = headers or {}
        def __enter__(self): return self
        def __exit__(self, *args): self.close()

    def jpeg(self):
        stream = io.BytesIO()
        Image.new("RGB", (8, 8), "red").save(stream, "JPEG")
        return stream.getvalue()

    def avif(self, mode="RGB"):
        stream = io.BytesIO()
        color = (255, 0, 0, 128) if mode == "RGBA" else "red"
        Image.new(mode, (720, 404), color).save(stream, "AVIF")
        return stream.getvalue()

    @patch("notes.image_import.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("142.250.1.1", 443))])
    @patch("notes.image_import._open_once")
    def test_allowed_youtube_thumbnail_is_content_validated(self, opened, _dns):
        avif = self.avif()
        opened.return_value = self.Response(avif, headers={"Content-Type": "image/avif", "Content-Length": str(len(avif))})
        data, content_type, suffix = fetch_youtube_thumbnail(self.ACTUAL_YOUTUBE_URL)
        decoded = Image.open(io.BytesIO(data))
        decoded.load()
        self.assertEqual((decoded.format, decoded.size), ("JPEG", (720, 404)))
        self.assertEqual((content_type, suffix), ("image/jpeg", ".jpg"))
        self.assertEqual(opened.call_args.args[0], self.ACTUAL_YOUTUBE_URL)

    def test_avif_alpha_is_normalized_to_decodable_png(self):
        data, content_type, suffix = normalize_remote_image(self.avif("RGBA"))
        decoded = Image.open(io.BytesIO(data))
        decoded.load()
        self.assertEqual((decoded.format, decoded.mode, decoded.size), ("PNG", "RGBA", (720, 404)))
        self.assertEqual((content_type, suffix), ("image/png", ".png"))

    def test_rejects_arbitrary_private_and_oversized_sources(self):
        for source in (
            "https://example.com/a.jpg",
            "http://i.ytimg.com/vi/abcdefghijk/hq720.jpg",
            "https://127.0.0.1/a.jpg",
            "https://i.ytimg.com.evil.example/vi/abcdefghijk/hq720.jpg",
            "https://attacker@i.ytimg.com/vi/abcdefghijk/hq720.jpg",
            "https://i.ytimg.com:444/vi/abcdefghijk/hq720.jpg",
            "https://i.ytimg.com/not-vi/abcdefghijk/hq720.jpg",
            "https://i.ytimg.com/vi/abcdefghijk/hq720.jpg?sqp=valid&rs=valid&extra=bad",
            "https://i.ytimg.com/vi/abcdefghijk/hq720.jpg?sqp=valid&sqp=again",
        ):
            with self.assertRaises(RemoteImageError):
                fetch_youtube_thumbnail(source)
        with patch("notes.image_import.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 443))]):
            with self.assertRaises(RemoteImageError):
                fetch_youtube_thumbnail("https://i.ytimg.com/vi/abcdefghijk/hq720.jpg")
        response = self.Response(b"", headers={"Content-Length": str(MAX_IMAGE_BYTES + 1)})
        with patch("notes.image_import.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("142.250.1.1", 443))]), patch("notes.image_import._open_once", return_value=response):
            with self.assertRaises(RemoteImageError):
                fetch_youtube_thumbnail("https://i.ytimg.com/vi/abcdefghijk/hq720.jpg")

    @patch("notes.image_import.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("142.250.1.1", 443))])
    @patch("notes.image_import._open_once")
    def test_rejects_redirect_to_unapproved_host_and_fake_image(self, opened, _dns):
        opened.return_value = self.Response(status=302, headers={"Location": "https://example.com/image.jpg"})
        with self.assertRaises(RemoteImageError):
            fetch_youtube_thumbnail("https://i.ytimg.com/vi/abcdefghijk/hq720.jpg")
        opened.return_value = self.Response(b"not an image")
        with self.assertRaises(RemoteImageError):
            fetch_youtube_thumbnail("https://i.ytimg.com/vi/abcdefghijk/hq720.jpg")

