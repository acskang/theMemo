from django.contrib import admin
from .models import (
    MemoImage,
    Note,
    Notebook,
    AppSetting,
    MenuItem,
    UIString,
    BlogPost,
    FeatureFlag,
)

# ---------------------------------------------------------------------------
# NOTE Admin
# ---------------------------------------------------------------------------
@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    """Custom admin for :class:`~notes.models.Note`.

    Only the ``list_display`` is overridden to show ``id`` and ``title``.
    All other default behaviors (search, ordering, filtering, permissions, and
    delete actions) are inherited from :class:`django.contrib.admin.ModelAdmin`.
    """

    # Show ID and title in the changelist
    list_display = ("id", "title")

# Register the remaining models with the default admin interface.
admin.site.register([Notebook, MemoImage])
 # Removed duplicate registration of ``Note`` to avoid AlreadyRegistered error.


@admin.register(AppSetting)
class AppSettingAdmin(admin.ModelAdmin):
    list_display = ("key", "label", "is_active", "created_at")
    search_fields = ("key", "label")
    list_filter = ("is_active",)
    ordering = ("key",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ("key", "label", "group", "order", "is_active", "parent")
    search_fields = ("key", "label")
    list_filter = ("group", "is_active")
    ordering = ("group", "order", "key")
    raw_id_fields = ("parent",)


@admin.register(UIString)
class UIStringAdmin(admin.ModelAdmin):
    list_display = ("key", "type", "is_active", "created_at")
    search_fields = ("key", "value")
    list_filter = ("type", "is_active")
    ordering = ("key",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    """Admin interface for :class:`~notes.models.BlogPost`.

    The requirements for this project are:
    * Show *title*, *owner* (username), *created_at* and *is_public* in the
      list view.
    * Allow searching by *title* and by the owner's *username*.
    * Permit deletion only for super‑users and support bulk delete with the
      default confirmation flow.
    """

    # ---------------------------------------------------------------------
    # List display
    # ---------------------------------------------------------------------
    list_display = (
        "title",
        "owner",
        "is_public",
        "created_at",
    )

    # ---------------------------------------------------------------------
    # Search and filtering
    # ---------------------------------------------------------------------
    search_fields = ("title", "owner__username")
    list_filter = ("is_public", "created_at")
    ordering = ("-created_at", "order")
    readonly_fields = ("created_at", "updated_at")

    # ---------------------------------------------------------------------
    # Permissions
    # ---------------------------------------------------------------------
    def has_delete_permission(self, request, obj=None):
        """Super‑users only may delete ``BlogPost`` instances.

        The default implementation allows anyone with the delete permission.
        Overriding it ensures that staff users (who might have a delete
        permission via the admin UI) are still prevented from removing
        posts.
        """

        return request.user.is_superuser


@admin.register(FeatureFlag)
class FeatureFlagAdmin(admin.ModelAdmin):
    list_display = ("key", "is_active", "created_at")
    search_fields = ("key",)
    list_filter = ("is_active",)
    ordering = ("key",)
    readonly_fields = ("created_at", "updated_at")
