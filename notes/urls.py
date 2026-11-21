from django.urls import path

from . import views
from . import backoffice


urlpatterns = [
    path("backoffice/notes/", backoffice.backoffice_notes, name="backoffice-notes"),
    path("backoffice/images/", backoffice.backoffice_images, name="backoffice-images"),
    path("api/memo/notes/", views.notes_list, name="notes-list"),
    path("api/memo/cards/", views.note_cards, name="note-cards"),
    path("api/memo/notes/<uuid:note_id>/", views.note_save, name="note-save"),
    path("api/memo/notebooks/", views.notebooks_list, name="notebooks-list"),
    # New notebook management routes
    path("api/memo/notebooks/<uuid:notebook_id>/delete/", views.delete_notebook, name="notebook-delete"),
    path("api/memo/notebooks/<uuid:notebook_id>/rename/", views.rename_notebook, name="notebook-rename"),
    path("api/memo/images/", views.image_upload, name="image-upload"),
    path("api/memo/images/import/", views.image_import, name="image-import"),
    path("api/memo/images/<uuid:image_id>/", views.image_detail, name="image-detail"),
    path("api/memo/files/", views.file_upload, name="file-upload"),
    path("memo-files/<uuid:file_id>/", views.file_serve, name="file-serve"),
    path("memo-media/<uuid:image_id>/", views.image_serve, name="image-serve"),
    # New API endpoints
    path("api/memo/config/", views.app_config, name="app-config"),
    path("api/blog/posts/", views.blog_posts_list, name="blog-posts-list"),
    path("api/blog/posts/<slug:slug>/", views.blog_post_detail, name="blog-post-detail"),
]
