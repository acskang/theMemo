import uuid
from pathlib import Path

from django.conf import settings
from django.db import models
from django.db.models import Q


class Notebook(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notebooks")
    name = models.CharField(max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["owner", "name"], name="unique_owner_notebook_name")]
        ordering = ["created_at", "id"]


class Note(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes")
    notebook = models.ForeignKey(Notebook, on_delete=models.PROTECT, related_name="notes")
    title = models.CharField(max_length=200, blank=True)
    tags = models.JSONField(default=list)
    document_date = models.DateField()
    daily_key = models.DateField(null=True, blank=True)
    favorite = models.BooleanField(default=False)
    deleted = models.BooleanField(default=False)
    is_public = models.BooleanField(default=False)
    schema_version = models.PositiveSmallIntegerField(default=1)
    revision = models.PositiveIntegerField(default=1)
    content = models.JSONField()
    plain_text = models.TextField(blank=True)
    icon = models.CharField(max_length=16, blank=True)
    cover = models.CharField(max_length=200, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [models.UniqueConstraint(fields=["owner", "daily_key"], condition=Q(deleted=False, daily_key__isnull=False), name="unique_active_daily_note")]


def private_image_path(instance, filename):
    suffix = Path(filename).suffix.lower()
    return f"memo-images/{instance.id}{suffix}"


class MemoImage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memo_images")
    file = models.ImageField(upload_to=private_image_path)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=30)
    created_at = models.DateTimeField(auto_now_add=True)


# New models for configuration and content management
class AppSetting(models.Model):
    """Site‑wide settings that can be edited via Django Admin.

    * ``key`` – unique identifier (e.g. ``site_title``)
    * ``value`` – arbitrary JSON data, usually a string.
    * ``label`` – human readable description for the admin UI.
    * ``description`` – optional admin help text.
    * ``is_active`` – whether the setting should be exposed to the front‑end.
    * ``created_at`` / ``updated_at`` – timestamps.
    """

    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()
    label = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return f"{self.key}: {self.value}"


class MenuItem(models.Model):
    """Defines a navigation menu item.

    ``group`` distinguishes header, sidebar, or footer menus.
    ``parent`` allows nesting.  Validation for circular references is
    performed in ``clean()``.
    """

    GROUP_CHOICES = (
        ("header", "Header"),
        ("sidebar", "Sidebar"),
        ("footer", "Footer"),
    )

    key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=200)
    url = models.CharField(max_length=200)
    icon = models.CharField(max_length=50, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    group = models.CharField(max_length=20, choices=GROUP_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["group", "order", "key"]
        unique_together = [("parent", "key")]

    def __str__(self):
        return f"{self.group}:{self.key}"

    def clean(self):
        # Prevent self as parent and circular references.
        if self.parent and self.parent_id == self.id:
            raise ValidationError("A menu item cannot be its own parent.")
        # Detect circular reference.
        ancestor = self.parent
        while ancestor:
            if ancestor.id == self.id:
                raise ValidationError("Circular menu reference detected.")
            ancestor = ancestor.parent


class UIString(models.Model):
    """Generic UI text that can be looked up via a key.

    ``type`` gives context to the admin (button, tooltip, etc.).
    """

    TYPE_CHOICES = (
        ("button", "Button"),
        ("label", "Label"),
        ("tooltip", "Tooltip"),
        ("dialog", "Dialog"),
        ("shortcut", "Shortcut"),
        ("toast", "Toast"),
        ("message", "Message"),
        ("placeholder", "Placeholder"),
        ("title", "Title"),
    )

    key = models.CharField(max_length=200, unique=True)
    value = models.TextField()
    description = models.TextField(blank=True)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return f"{self.key}: {self.value[:20]}"


class BlogPost(models.Model):
    """Public blog post independent from ``Note``.

    The model stores the raw Tiptap JSON in ``content`` and optional cover
    image.  Only ``is_public`` posts are returned by the public API.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="blog_posts")
    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=200, blank=True)
    excerpt = models.TextField(blank=True)
    slug = models.SlugField(max_length=200, unique=True)
    content = models.JSONField()
    cover = models.CharField(max_length=200, null=True, blank=True)
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    order = models.IntegerField(default=0)
    seo_title = models.CharField(max_length=200, blank=True)
    seo_description = models.TextField(blank=True)
    tags = models.JSONField(default=list)

    class Meta:
        ordering = ["-created_at", "order"]

    def __str__(self):
        return f"{self.title} ({self.slug})"


class FeatureFlag(models.Model):
    """Simple boolean toggle for optional functionality."""

    key = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return f"{self.key}: {'ON' if self.is_active else 'OFF'}"
