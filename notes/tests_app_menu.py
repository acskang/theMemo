import re

from django.contrib.auth import get_user_model
from django.test import TestCase


class AppMenuTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("appmenuuser", password="pw-for-test-12345")
        self.client.force_login(self.user)

    def page(self):
        response = self.client.get("/memo/")
        self.assertEqual(response.status_code, 200)
        return response.content.decode()

    def test_header_user_menu_has_password_link_and_post_logout(self):
        html = self.page()
        header = re.search(r"<header.*?</header>", html, re.S)
        self.assertIsNotNone(header)
        self.assertIn('id="user-menu-btn"', header.group(0))
        self.assertIn("appmenuuser", header.group(0))
        form = re.search(r'<form[^>]*action="/logout/"[^>]*>', html)
        self.assertIsNotNone(form)
        self.assertIn('method="post"', form.group(0).lower())
        self.assertIn("csrfmiddlewaretoken", html)
        self.assertEqual(html.count('action="/logout/"'), 1)
        self.assertEqual(html.count('href="/password/change/"'), 1)

    def test_help_moved_from_header_to_sidebar(self):
        html = self.page()
        self.assertEqual(html.count('data-action="help"'), 1)
        header = re.search(r"<header.*?</header>", html, re.S)
        self.assertIsNotNone(header)
        self.assertNotIn('data-action="help"', header.group(0))
        self.assertGreater(html.index('data-action="help"'), header.end())