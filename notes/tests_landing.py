from django.contrib.auth import get_user_model
from django.test import Client, TestCase


class LandingPageTests(TestCase):
    def test_root_is_landing_page_with_login_link_to_memo(self):
        response = Client().get("/")
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "landing/home.html")
        html = response.content.decode()
        self.assertIn("30년의 아키텍처 위에", html)
        self.assertIn('href="/login/?next=/memo/"', html)
        self.assertNotIn("sc-for", html)
        self.assertNotIn("[정확도", html)

    def test_authenticated_user_sees_my_memo_link(self):
        user = get_user_model().objects.create_user("landing", password="pw-12345-pw")
        client = Client()
        client.force_login(user)
        html = client.get("/").content.decode()
        self.assertIn('href="/memo/"', html)
        self.assertNotIn('id="landing-login"', html)

    def test_login_from_landing_goes_to_memo_list(self):
        get_user_model().objects.create_user("landing", password="pw-12345-pw")
        client = Client()
        response = client.post("/login/?next=/memo/", {"username": "landing", "password": "pw-12345-pw"})
        self.assertRedirects(response, "/memo/", fetch_redirect_response=False)

    def test_public_blog_moved_to_blog_path(self):
        response = Client().get("/blog/")
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "memo/public_blog.html")
