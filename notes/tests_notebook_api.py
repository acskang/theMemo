"""Unit tests for the Notebook deletion and renaming API endpoints.

These tests exercise the views added in ``notes/views.py`` and verify that
the expected HTTP status codes and response bodies are returned in all
common scenarios.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
import uuid

from .models import Notebook, Note


class NotebookApiTests(TestCase):
    """Test the DELETE /rename API endpoints for notebooks."""

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user("user", password="pw")
        self.other = User.objects.create_user("other", password="pw")
        self.client = APIClient()
        self.client.force_login(self.user)
        # Create notebooks for the user
        self.nbook = Notebook.objects.create(owner=self.user, name="Test Notebook")
        self.other_nbook = Notebook.objects.create(owner=self.other, name="Other Notebook")
        # Create a note attached to self.nbook
        Note.objects.create(
            id=uuid.uuid4(),
            owner=self.user,
            notebook=self.nbook,
            title="A note",
            tags=[],
            document_date="2026-11-10",
            content={"type": "doc"},
        )

    # ------------------------------------------------------------------
    # DELETE
    # ------------------------------------------------------------------
    def test_delete_notebook_success_no_notes(self):
        Notebook.objects.create(owner=self.user, name="일상 기록")
        # Create a notebook without notes
        nb = Notebook.objects.create(owner=self.user, name="Empty Notebook")
        url = reverse("notebook-delete", args=[nb.id])
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_200_OK
        assert not Notebook.objects.filter(id=nb.id).exists()

    def test_delete_notebook_moves_notes_to_daily_notebook(self):
        daily = Notebook.objects.create(owner=self.user, name="일상 기록")
        url = reverse("notebook-delete", args=[self.nbook.id])
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["moved_count"] == 1
        assert response.json()["fallback_notebook"]["id"] == str(daily.id)
        assert not Notebook.objects.filter(id=self.nbook.id).exists()
        assert Note.objects.get(title="A note").notebook == daily

    def test_delete_daily_notebook_is_rejected(self):
        daily = Notebook.objects.create(owner=self.user, name="일상 기록")
        response = self.client.delete(reverse("notebook-delete", args=[daily.id]))
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert Notebook.objects.filter(id=daily.id).exists()

    def test_delete_notebook_not_found(self):
        fake_id = uuid.uuid4()
        url = reverse("notebook-delete", args=[fake_id])
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_notebook_other_user(self):
        url = reverse("notebook-delete", args=[self.other_nbook.id])
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_notebook_unauthenticated(self):
        self.client.logout()
        url = reverse("notebook-delete", args=[self.nbook.id])
        response = self.client.delete(url)
        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # PATCH (rename)
    # ------------------------------------------------------------------
    def test_rename_notebook_success(self):
        url = reverse("notebook-rename", args=[self.nbook.id])
        response = self.client.patch(url, {"name": "Renamed"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        self.nbook.refresh_from_db()
        assert self.nbook.name == "Renamed"

    def test_rename_notebook_duplicate(self):
        # Attempt to rename to an existing name for same user
        Notebook.objects.create(owner=self.user, name="Duplicate")
        url = reverse("notebook-rename", args=[self.nbook.id])
        response = self.client.patch(url, {"name": "Duplicate"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        self.nbook.refresh_from_db()
        assert self.nbook.name != "Duplicate"

    def test_rename_notebook_empty_name(self):
        url = reverse("notebook-rename", args=[self.nbook.id])
        response = self.client.patch(url, {"name": "   "}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        self.nbook.refresh_from_db()
        assert self.nbook.name == "Test Notebook"

    def test_rename_notebook_same_name(self):
        url = reverse("notebook-rename", args=[self.nbook.id])
        response = self.client.patch(url, {"name": "Test Notebook"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        self.nbook.refresh_from_db()
        assert self.nbook.name == "Test Notebook"

    def test_rename_notebook_not_found(self):
        fake_id = uuid.uuid4()
        url = reverse("notebook-rename", args=[fake_id])
        response = self.client.patch(url, {"name": "New"}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_rename_notebook_other_user(self):
        url = reverse("notebook-rename", args=[self.other_nbook.id])
        response = self.client.patch(url, {"name": "New"}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_rename_notebook_unauthenticated(self):
        self.client.logout()
        url = reverse("notebook-rename", args=[self.nbook.id])
        response = self.client.patch(url, {"name": "New"}, format="json")
        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
