import json
from io import BytesIO
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
import tempfile

from .models import MemoFile, Note, Notebook
from .validation import plain_text, validate_document


def doc(file_id, name="보고서.pdf", size=10):
    return {"type": "doc", "content": [{"type": "fileAttachment", "attrs": {"id": str(file_id), "name": name, "size": size}}]}


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AttachmentTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user("owner", password="pw-12345-xyz")
        self.other = User.objects.create_user("other", password="pw-12345-xyz")
        self.client.force_login(self.owner)

    def upload(self, name="보고서.pdf", data=b"%PDF-1.4 hello"):
        return self.client.post("/api/memo/files/", {"file": SimpleUploadedFile(name, data)})

    def test_upload_and_owner_download(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual((body["name"], body["size"]), ("보고서.pdf", 14))
        download = self.client.get(body["url"])
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Content-Type"], "application/octet-stream")
        self.assertIn("attachment;", download["Content-Disposition"])
        self.assertIn("UTF-8''%EB%B3%B4%EA%B3%A0%EC%84%9C.pdf", download["Content-Disposition"])
        self.assertEqual(b"".join(download.streaming_content), b"%PDF-1.4 hello")

    def test_rejects_executable_empty_and_oversize(self):
        self.assertEqual(self.upload("a.exe").status_code, 400)
        self.assertEqual(self.upload("a.html", b"<script>").status_code, 400)
        self.assertEqual(self.upload("a.svg", b"<svg/>").status_code, 400)
        self.assertEqual(self.upload("a.pdf", b"").status_code, 400)
        self.assertEqual(self.upload("a.pdf", b"x" * (20 * 1024 * 1024 + 1)).status_code, 413)

    def test_anonymous_cannot_upload(self):
        self.client.logout()
        self.assertIn(self.upload().status_code, (401, 403))

    def test_private_file_hidden_from_others_and_anonymous(self):
        url = self.upload().json()["url"]
        self.client.logout()
        self.assertEqual(self.client.get(url).status_code, 404)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_public_note_exposes_file_to_anyone(self):
        item = self.upload().json()
        notebook = Notebook.objects.create(owner=self.owner, name="n")
        Note.objects.create(id=uuid4(), owner=self.owner, notebook=notebook, title="t", document_date="2026-01-01", content=doc(item["id"]), is_public=True)
        self.client.logout()
        self.assertEqual(self.client.get(item["url"]).status_code, 200)
        other_file = self.client.get(f"/memo-files/{uuid4()}/")
        self.assertEqual(other_file.status_code, 404)

    def test_validation_requires_own_file(self):
        item = self.upload().json()
        validate_document(doc(item["id"]), self.owner)
        with self.assertRaises(ValidationError):
            validate_document(doc(item["id"]), self.other)
        with self.assertRaises(ValidationError):
            validate_document(doc(uuid4()), self.owner)
        with self.assertRaises(ValidationError):
            validate_document(doc("not-a-uuid"), self.owner)
        with self.assertRaises(ValidationError):
            validate_document(doc(item["id"], name=""), self.owner)
        with self.assertRaises(ValidationError):
            validate_document(doc(item["id"], size=-1), self.owner)

    def test_plain_text_includes_file_name(self):
        self.assertIn("보고서.pdf", plain_text(doc(uuid4())))
