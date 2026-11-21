import re
import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase

from notes.models import Note, Notebook


class UserMenuTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("menuuser", password="pw-for-test-12345")
        notebook = Notebook.objects.create(owner=self.user, name="일상 기록")
        self.note = Note.objects.create(
            id=uuid.uuid4(), owner=self.user, notebook=notebook, title="공개 글",
            document_date="2026-11-13", is_public=True,
            content={"type": "doc", "content": [{"type": "paragraph"}]},
        )
        self.urls = ["/blog/", f"/blog/{self.note.id}/"]

    def test_logged_in_has_dropdown_with_post_logout(self):
        self.client.force_login(self.user)
        for url in self.urls:
            html = self.client.get(url).content.decode()
            self.assertIn('id="user-menu-btn"', html, url)
            form = re.search(r'<form[^>]*action="/logout/"[^>]*>', html)
            self.assertIsNotNone(form, url)
            self.assertIn('method="post"', form.group(0).lower(), url)
            self.assertIn("csrfmiddlewaretoken", html, url)
            self.assertEqual(html.count('href="/password/change/"'), 1, url)
            self.assertNotRegex(html, r'<a[^>]*href="/password/change/"[^>]*>\s*menuuser\s*</a>')
            self.assertNotRegex(html, r"^\s*\d+ \|", msg=url)

    def test_anonymous_has_no_menu(self):
        for url in self.urls:
            html = self.client.get(url).content.decode()
            self.assertNotIn('id="user-menu-btn"', html, url)
            self.assertNotIn('action="/logout/"', html, url)
