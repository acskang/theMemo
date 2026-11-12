"""Add the new configuration and content models.

This migration mirrors the definitions added to ``notes/models.py``.
It creates five new tables: ``AppSetting``, ``MenuItem``, ``UIString``,
``BlogPost`` and ``FeatureFlag``.
"""

import uuid
from django.db import migrations, models
from django.conf import settings

class Migration(migrations.Migration):

    dependencies = [
        ('notes', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='AppSetting',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=100, unique=True)),
                ('value', models.JSONField()),
                ('label', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['key'],
            },
        ),
        migrations.CreateModel(
            name='MenuItem',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=100, unique=True)),
                ('label', models.CharField(max_length=200)),
                ('url', models.CharField(max_length=200)),
                ('icon', models.CharField(blank=True, max_length=50)),
                ('order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('group', models.CharField(choices=[('header', 'Header'), ('sidebar', 'Sidebar'), ('footer', 'Footer')], max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=models.CASCADE, related_name='children', to='notes.menuitem')),
            ],
            options={
                'ordering': ['group', 'order', 'key'],
                'unique_together': [('parent', 'key')],
            },
        ),
        migrations.CreateModel(
            name='UIString',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=200, unique=True)),
                ('value', models.TextField()),
                ('description', models.TextField(blank=True)),
                ('type', models.CharField(choices=[('button', 'Button'), ('label', 'Label'), ('tooltip', 'Tooltip'), ('dialog', 'Dialog'), ('shortcut', 'Shortcut'), ('toast', 'Toast'), ('message', 'Message'), ('placeholder', 'Placeholder'), ('title', 'Title')], max_length=20)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['key'],
            },
        ),
        migrations.CreateModel(
            name='BlogPost',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('title', models.CharField(max_length=200)),
                ('subtitle', models.CharField(blank=True, max_length=200)),
                ('excerpt', models.TextField(blank=True)),
                ('slug', models.SlugField(max_length=200, unique=True)),
                ('content', models.JSONField()),
                ('cover', models.CharField(blank=True, max_length=200, null=True)),
                ('is_public', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('order', models.IntegerField(default=0)),
                ('seo_title', models.CharField(blank=True, max_length=200)),
                ('seo_description', models.TextField(blank=True)),
                ('tags', models.JSONField(default=list)),
                ('owner', models.ForeignKey(on_delete=models.CASCADE, related_name='blog_posts', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', 'order'],
            },
        ),
        migrations.CreateModel(
            name='FeatureFlag',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=100, unique=True)),
                ('description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['key'],
            },
        ),
    ]