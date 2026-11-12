"""Tests for :class:`~notes.admin.BlogPostAdmin` permissions.

The tests are written using :class:`django.test.TestCase` which sets up a
fresh test database and configures Django automatically.  The import of the
``BlogPost`` model is performed lazily inside the test methods to avoid
importing Django settings before the test framework has initialised them.
"""

import os, sys
# Ensure the project root (parent of 'notes') is on sys.path so that the
# ``theMemo`` package can be resolved.
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir))
if project_root not in sys.path:
    sys.path.insert(0, project_root)
# Set the settings module before importing any Django code.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "theMemo.settings")
import sys
print("test module sys.path:", sys.path)
from django.test import TestCase, Client, override_settings
from django.urls import reverse



class BlogPostAdminPermissionTests(TestCase):
    def setUp(self):
        super().setUp()
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.super_user = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="pass"
        )
        self.staff_user = User.objects.create_user(
            username="staff", email="staff@example.com", password="pass"
        )
        self.staff_user.is_staff = True
        self.staff_user.save()
        # Create a BlogPost instance.
        BlogPost = __import__("notes.models", fromlist=["BlogPost"]).BlogPost
        self.post = BlogPost.objects.create(
            owner=self.super_user,
            title="침범",
            subtitle="",
            excerpt="",
            slug="침범",
            content={"content": []},
            is_public=True,
        )

        self.client = Client()

    def _login_as(self, user):
        logged_in = self.client.login(username=user.username, password="pass")
        assert logged_in, f"Failed to log in as {user.username}"

    def test_superuser_can_delete_blogpost(self):
        """Super‑user sees delete action and can delete a post."""
        self._login_as(self.super_user)
        changelist_url = reverse("admin:notes_blogpost_changelist")
        response = self.client.get(changelist_url)
        self.assertEqual(response.status_code, 200)
        self.assertIn("delete_selected", response.content.decode())

        # Perform the delete action via the changelist form.
        post_id = str(self.post.id)
        response = self.client.post(
            changelist_url,
            {
                "action": "delete_selected",
                "_selected_action": [post_id],
            },
            follow=True,
        )
        self.assertFalse(self.post.__class__.objects.filter(id=self.post.id).exists())
        self.assertIn("successfully deleted", response.content.decode())

    def test_staff_cannot_delete_blogpost(self):
        """Staff user cannot see delete action and deletion fails."""
        self._login_as(self.staff_user)
        changelist_url = reverse("admin:notes_blogpost_changelist")
        response = self.client.get(changelist_url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("delete_selected", response.content.decode())

        # Attempt to perform delete; should return 403.
        post_id = str(self.post.id)
        response = self.client.post(
            changelist_url,
            {
                "action": "delete_selected",
                "_selected_action": [post_id],
            },
            follow=True,
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(self.post.__class__.objects.filter(id=self.post.id).exists())

    def test_delete_confirmation_page_shows_details(self):
        """Delete confirmation shows the post’s title and owner."""
        self._login_as(self.super_user)
        delete_url = reverse("admin:notes_blogpost_delete", args=[self.post.id])
        response = self.client.get(delete_url)
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertIn(self.post.title, content)
        self.assertIn(self.post.owner.username, content)
        self.assertIn("<input type='submit'", content)