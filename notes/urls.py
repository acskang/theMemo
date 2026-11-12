from django.urls import path

from . import views


urlpatterns = [
    path("api/memo/notes/", views.notes_list, name="notes-list"),
    path("api/memo/cards/", views.note_cards, name="note-cards"),
    path("api/memo/notes/<uuid:note_id>/", views.note_save, name="note-save"),
    path("api/memo/notebooks/", views.notebooks_list, name="notebooks-list"),
    path("api/memo/images/", views.image_upload, name="image-upload"),
    path("api/memo/images/import/", views.image_import, name="image-import"),
    path("memo-media/<uuid:image_id>/", views.image_serve, name="image-serve"),
    # New API endpoints
    path("api/memo/config/", views.app_config, name="app-config"),
    path("api/blog/posts/", views.blog_posts_list, name="blog-posts-list"),
    path("api/blog/posts/<slug:slug>/", views.blog_post_detail, name="blog-post-detail"),
]
