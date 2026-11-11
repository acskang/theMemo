from django.contrib import admin
from django.contrib.auth.views import LogoutView
from django.urls import include, path

from notes.views import app_view, new_note_entry, public_blog, public_cards, public_note
from notes.auth_views import MemoLoginView, MemoPasswordChangeView, SignUpView


urlpatterns = [
    path("admin/", admin.site.urls),
    path("login/", MemoLoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(next_page="public-blog"), name="logout"),
    path("signup/", SignUpView.as_view(), name="signup"),
    path("password/change/", MemoPasswordChangeView.as_view(), name="password-change"),
    path("", public_blog, name="public-blog"),
    path("api/public/cards/", public_cards, name="public-cards"),
    path("blog/<uuid:note_id>/", public_note, name="public-note"),
    path("write/", new_note_entry, name="new-note-entry"),
    path("memo/", app_view, name="memo-app"),
    path("", include("notes.urls")),
]
