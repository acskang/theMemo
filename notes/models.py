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
