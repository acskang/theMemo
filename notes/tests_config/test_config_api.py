"""Integration tests for the public configuration and blog APIs.

The tests run against a fresh test database created by Django's test
framework.  They are isolated from the production database and do not
alter any existing data.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from notes.models import (
    UIString,
    MenuItem,
    AppSetting,
    FeatureFlag,
    BlogPost,
)


@override_settings(CSRF_TRUSTED_ORIGINS=["https://memo.thesysm.com"])
class ConfigAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user(username="tester", password="pass")

        # UIString – one active, one inactive
        UIString.objects.create(key="button.test_config", value="Test", type="button", is_active=True)
        UIString.objects.create(key="button.inactive_config", value="Inactive", type="button", is_active=False)

        # MenuItem – one active, one inactive
        MenuItem.objects.create(
            key="header.test_config",
            label="Test Header",
            url="/test/",
            icon="test",
            order=1,
            group="header",
            is_active=True,
        )
        MenuItem.objects.create(
            key="header.inactive_config",
            label="Inactive Header",
            url="/inactive/",
            icon="inact",
            order=2,
            group="header",
            is_active=False,
        )

        # AppSetting – one active, one inactive
        AppSetting.objects.create(key="site_title_test_config", value="TestSite", is_active=True)
        AppSetting.objects.create(key="site_secret_test_config", value="supersecret", is_active=False)

        # FeatureFlag – two flags, one true, one false
        FeatureFlag.objects.create(key="feature_enabled_test_config", is_active=True)
        FeatureFlag.objects.create(key="feature_disabled_test_config", is_active=False)

        # Blog posts – one public, one private
        BlogPost.objects.create(
            title="Public Post",
            slug="public-post",
            content="\u003cp\u003ePublic\u003c/p\u003e",
            is_public=True,
            order=1,
            owner=cls.user,
        )
        BlogPost.objects.create(
            title="Private Post",
            slug="private-post",
            content="\u003cp\u003ePrivate\u003c/p\u003e",
            is_public=False,
            order=2,
            owner=cls.user,
        )

    def test_app_config_get(self):
        response = self.client.get("/api/memo/config/")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # ui_strings should contain only active entry
        self.assertIn("button.test_config", data["ui_strings"])
        self.assertNotIn("button.inactive_config", data["ui_strings"])

        # menus should contain only active entry
        menu_keys = {m["key"] for m in data["menus"]}
        self.assertIn("header.test_config", menu_keys)
        self.assertNotIn("header.inactive_config", menu_keys)

        # settings should contain only active entry
        self.assertIn("site_title_test_config", data["settings"])
        self.assertNotIn("site_secret_test_config", data["settings"])

        # flags should contain both values
        self.assertIn("feature_enabled_test_config", data["flags"])
        self.assertIn("feature_disabled_test_config", data["flags"])
        self.assertTrue(data["flags"]["feature_enabled_test_config"])
        self.assertFalse(data["flags"]["feature_disabled_test_config"])

    def test_app_config_method_not_allowed(self):
        # POST should be rejected with 405
        response = self.client.post("/api/memo/config/", data={})
        self.assertEqual(response.status_code, 405)
        # PUT/DELETE also 405
        response = self.client.put("/api/memo/config/", data={})
        self.assertEqual(response.status_code, 405)

    def test_blog_posts_list(self):
        response = self.client.get("/api/blog/posts/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        items = data["items"]
        # Only the public post should appear
        slugs = [item["slug"] for item in items]
        self.assertIn("public-post", slugs)
        self.assertNotIn("private-post", slugs)

    def test_blog_post_detail_public(self):
        response = self.client.get("/api/blog/posts/public-post/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["slug"], "public-post")

    def test_blog_post_detail_private(self):
        response = self.client.get("/api/blog/posts/private-post/")
        self.assertEqual(response.status_code, 404)

    def test_blog_post_detail_nonexistent(self):
        response = self.client.get("/api/blog/posts/nonexistent/")
        self.assertEqual(response.status_code, 404)
