import io
import json
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from PIL import Image

from notes.models import MemoImage


class ImageNameApiTests(TestCase):
    def setUp(self):
        media = tempfile.mkdtemp(prefix="thememo-test-media-")
        self.addCleanup(shutil.rmtree, media, True)
        self.enterContext(override_settings(MEDIA_ROOT=media))
        User = get_user_model()
        self.owner = User.objects.create_user("img-owner", password="pw-for-test-12345")
        self.other = User.objects.create_user("img-other", password="pw-for-test-12345")
        buffer = io.BytesIO()
        Image.new("RGB", (2, 2), "white").save(buffer, "PNG")
        self.image = MemoImage(owner=self.owner, original_name="upload.png", content_type="image/png")
        self.image.file.save("upload.png", ContentFile(buffer.getvalue()), save=True)
        self.url = f"/api/memo/images/{self.image.id}/"

    def patch(self, name):
        return self.client.patch(self.url, data=json.dumps({"name": name}), content_type="application/json")

    def test_owner_reads_name(self):
        self.client.force_login(self.owner)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["original_name"], "upload.png")
        self.assertEqual(response.json()["url"], f"/memo-media/{self.image.id}/")

    def test_owner_renames_and_normalizes(self):
        self.client.force_login(self.owner)
        response = self.patch("  쪽대밭   강남 -45억.png ")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["original_name"], "쪽대밭 강남 -45억.png")
        self.image.refresh_from_db()
        self.assertEqual(self.image.original_name, "쪽대밭 강남 -45억.png")

    def test_rejects_invalid_names(self):
        self.client.force_login(self.owner)
        for bad in ["", "   ", "x" * 256, 123, None]:
            response = self.patch(bad)
            self.assertEqual(response.status_code, 400, repr(bad))
            self.assertEqual(response.json()["error"]["code"], "invalid_image_name", repr(bad))
        self.image.refresh_from_db()
        self.assertEqual(self.image.original_name, "upload.png")

    def test_accepts_255_chars(self):
        self.client.force_login(self.owner)
        self.assertEqual(self.patch("x" * 255).status_code, 200)

    def test_invalid_json(self):
        self.client.force_login(self.owner)
        response = self.client.patch(self.url, data="not json", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_json")

    def test_other_user_gets_404(self):
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.patch("hijack.png").status_code, 404)
        self.image.refresh_from_db()
        self.assertEqual(self.image.original_name, "upload.png")

    def test_anonymous_gets_401(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.patch("x.png").status_code, 401)

    def test_admin_list_shows_original_name_column(self):
        admin_user = get_user_model().objects.create_superuser("img-admin", "admin@example.com", "pw-for-test-12345")
        self.image.original_name = "admin-list-visible-name.png"
        self.image.save(update_fields=["original_name"])
        self.client.force_login(admin_user)
        response = self.client.get("/admin/notes/memoimage/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "field-original_name")
        self.assertContains(response, "admin-list-visible-name.png")