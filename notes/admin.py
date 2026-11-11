from django.contrib import admin

from .models import MemoImage, Note, Notebook


admin.site.register([Note, Notebook, MemoImage])
