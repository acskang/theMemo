import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from notes.models import Notebook

MAX = Notebook._meta.get_field("name").max_length


class NotebookRenameTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user("nb-owner", password="pw-for-test-12345")
        self.other = User.objects.create_user("nb-other", password="pw-for-test-12345")
        self.client.force_login(self.user)
        self.client.get("/api/memo/notebooks/")
        self.notebook = Notebook.objects.get(owner=self.user, name="일상 기록")

    def rename(self, notebook_id, name):
        return self.client.patch(
            f"/api/memo/notebooks/{notebook_id}/rename/",
            data=json.dumps({"name": name}),
            content_type="application/json",
        )

    def test_rename_success_keeps_id(self):
        response = self.rename(self.notebook.id, "나의 하루")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"id": str(self.notebook.id), "name": "나의 하루"})
        self.notebook.refresh_from_db()
        self.assertEqual(self.notebook.name, "나의 하루")

    def test_rename_strips_whitespace(self):
        self.assertEqual(self.rename(self.notebook.id, "  새 이름  ").json()["name"], "새 이름")

    def test_rename_same_name_ok(self):
        self.assertEqual(self.rename(self.notebook.id, "일상 기록").status_code, 200)

    def test_rename_rejects_empty_and_non_string(self):
        for bad in ["", "   ", 123, None]:
            self.assertEqual(self.rename(self.notebook.id, bad).status_code, 400, repr(bad))
        self.notebook.refresh_from_db()
        self.assertEqual(self.notebook.name, "일상 기록")

    def test_rename_length_limit(self):
        self.assertEqual(self.rename(self.notebook.id, "가" * (MAX + 1)).status_code, 400)
        self.assertEqual(self.rename(self.notebook.id, "가" * MAX).status_code, 200)

    def test_rename_duplicate_rejected(self):
        self.assertEqual(self.rename(self.notebook.id, "개발 노트").status_code, 400)
        self.notebook.refresh_from_db()
        self.assertEqual(self.notebook.name, "일상 기록")

    def test_rename_other_users_notebook_404(self):
        self.client.force_login(self.other)
        self.client.get("/api/memo/notebooks/")
        self.assertEqual(self.rename(self.notebook.id, "hijack").status_code, 404)
        self.notebook.refresh_from_db()
        self.assertEqual(self.notebook.name, "일상 기록")

    def test_rename_requires_login(self):
        self.client.logout()
        self.assertIn(self.rename(self.notebook.id, "x").status_code, (401, 403))

    def test_defaults_not_recreated_after_rename(self):
        self.rename(self.notebook.id, "나의 하루")
        response = self.client.get("/api/memo/notebooks/")
        names = [item["name"] for item in response.json()["items"]]
        self.assertNotIn("일상 기록", names)
        self.assertIn("나의 하루", names)
        self.assertEqual(Notebook.objects.filter(owner=self.user).count(), 4)

    def test_new_user_gets_defaults_once(self):
        self.client.force_login(self.other)
        first = self.client.get("/api/memo/notebooks/").json()["items"]
        second = self.client.get("/api/memo/notebooks/").json()["items"]
        self.assertEqual(len(first), 4)
        self.assertEqual(len(second), 4)