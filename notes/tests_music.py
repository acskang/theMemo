import tempfile
from datetime import date
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from .models import MemoFile, Note, Notebook

DATA = bytes(range(256)) * 4  # 1024 bytes


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class NoteMusicTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user("owner", password="pw-12345-xyz")
        self.other = User.objects.create_user("other", password="pw-12345-xyz")
        book = Notebook.objects.create(owner=self.owner, name="일상")
        self.note = Note.objects.create(id=uuid4(), owner=self.owner, notebook=book, document_date=date.today(), content={"type": "doc", "content": []})
        self.url = f"/api/memo/notes/{self.note.id}/music/"
        self.client.force_login(self.owner)

    def upload(self, name="bgm.mp3", data=DATA):
        return self.client.post(self.url, {"file": SimpleUploadedFile(name, data)})

    def test_upload_exposes_music_in_note_json_and_streams(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.content)
        music = response.json()["music"]
        self.assertEqual((music["name"], music["size"], music["url"]), ("bgm.mp3", 1024, self.url))
        note = self.client.get(f"/api/memo/notes/{self.note.id}/").json()
        self.assertEqual(note["music"]["name"], "bgm.mp3")
        listed = self.client.get("/api/memo/notes/").json()["items"][0]
        self.assertEqual(listed["music"]["id"], music["id"])
        stream = self.client.get(self.url)
        self.assertEqual(stream.status_code, 200)
        self.assertEqual(stream["Content-Type"], "audio/mpeg")
        self.assertEqual(stream["Accept-Ranges"], "bytes")
        self.assertEqual(b"".join(stream.streaming_content), DATA)

    def test_range_requests(self):
        self.upload()
        part = self.client.get(self.url, HTTP_RANGE="bytes=10-19")
        self.assertEqual(part.status_code, 206)
        self.assertEqual(part["Content-Range"], "bytes 10-19/1024")
        self.assertEqual(b"".join(part.streaming_content), DATA[10:20])
        tail = self.client.get(self.url, HTTP_RANGE="bytes=-4")
        self.assertEqual(b"".join(tail.streaming_content), DATA[-4:])
        self.assertEqual(self.client.get(self.url, HTTP_RANGE="bytes=5000-").status_code, 416)

    def test_replace_removes_previous_file(self):
        first = self.upload().json()["music"]["id"]
        second = self.upload("new.m4a").json()["music"]
        self.assertNotEqual(first, second["id"])
        self.assertFalse(MemoFile.objects.filter(id=first).exists())
        self.assertEqual(MemoFile.objects.count(), 1)
        self.assertEqual(self.client.get(self.url)["Content-Type"], "audio/mp4")

    def test_delete(self):
        self.upload()
        response = self.client.delete(self.url)
        self.assertEqual(response.json(), {"music": None})
        self.assertEqual(MemoFile.objects.count(), 0)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertIsNone(self.client.get(f"/api/memo/notes/{self.note.id}/").json()["music"])

    def test_rejects_bad_files(self):
        self.assertEqual(self.upload("evil.html", b"<script>").status_code, 400)
        self.assertEqual(self.upload("empty.mp3", b"").status_code, 400)
        self.assertEqual(self.client.post(self.url, {}).status_code, 400)
        with override_settings():
            from . import views
            old = views.MUSIC_MAX_BYTES; views.MUSIC_MAX_BYTES = 100
            try:
                self.assertEqual(self.upload().status_code, 413)
            finally:
                views.MUSIC_MAX_BYTES = old

    def test_other_users_and_anonymous_are_blocked(self):
        self.upload()
        self.client.logout()
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.post(self.url, {"file": SimpleUploadedFile("a.mp3", DATA)}).status_code, 401)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.delete(self.url).status_code, 404)
        self.assertEqual(MemoFile.objects.count(), 1)

    def test_saving_note_keeps_music(self):
        self.upload()
        payload = {
            "id": str(self.note.id), "revision": 1, "title": "t", "tags": [], "document_date": date.today().isoformat(), "daily_key": None,
            "favorite": False, "deleted": False, "is_public": False, "schema_version": 1, "icon": "", "cover": None,
            "notebook_id": str(self.note.notebook_id), "content": {"type": "doc", "content": []},
        }
        import json
        response = self.client.put(f"/api/memo/notes/{self.note.id}/", json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["music"]["name"], "bgm.mp3")
