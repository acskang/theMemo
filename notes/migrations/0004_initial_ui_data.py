"""Initial data for the new configuration models.

This migration is added after the merge migration that combines
``0002_auto_add_new_models`` and ``0002_note_is_public``.  The migration
depends on the merge migration to guarantee that the model tables are
present before we try to insert data.
"""

from django.db import migrations

def _initial_data(apps, schema_editor):
    UIString = apps.get_model("notes", "UIString")
    MenuItem = apps.get_model("notes", "MenuItem")
    AppSetting = apps.get_model("notes", "AppSetting")
    FeatureFlag = apps.get_model("notes", "FeatureFlag")

    # ---------- UIString ----------
    ui_strings = [
        {"key": "button.new_note", "value": "새 메모", "type": "button"},
        {"key": "button.save", "value": "저장", "type": "button"},
        {"key": "button.cancel", "value": "취소", "type": "button"},
        {"key": "button.confirm", "value": "확인", "type": "button"},
        {"key": "button.help", "value": "사용 안내", "type": "button"},
        {"key": "label.search", "value": "메모 검색", "type": "label"},
        {"key": "label.menu", "value": "메뉴", "type": "label"},
        {"key": "dialog.settings", "value": "작성 환경", "type": "dialog"},
        {"key": "dialog.confirm", "value": "확인", "type": "dialog"},
        {"key": "toast.save_success", "value": "저장되었습니다.", "type": "toast"},
        {"key": "toast.save_error", "value": "저장하지 못했어요.", "type": "toast"},
        {"key": "shortcut.save", "value": "Ctrl+S", "type": "shortcut"},
        {"key": "tooltip.copy", "value": "복사", "type": "tooltip"},
        {"key": "placeholder.title", "value": "제목 입력", "type": "placeholder"},
        {"key": "placeholder.content", "value": "내용을 입력하세요.", "type": "placeholder"},
    ]
    for s in ui_strings:
        UIString.objects.get_or_create(key=s["key"], defaults=s)

    # ---------- MenuItem ----------
    header_items = [
        {"key": "header.home", "label": "홈", "url": "/", "icon": "home", "order": 1, "group": "header"},
        {"key": "header.write", "label": "작성", "url": "/write/", "icon": "edit", "order": 2, "group": "header"},
        {"key": "header.blog", "label": "블로그", "url": "/", "icon": "rss", "order": 3, "group": "header"},
    ]
    for item in header_items:
        MenuItem.objects.get_or_create(key=item["key"], defaults=item)

    sidebar_items = [
        {"key": "sidebar.today", "label": "오늘의 기록", "url": "#", "icon": "calendar-days", "order": 1, "group": "sidebar"},
        {"key": "sidebar.all", "label": "모든 메모", "url": "#", "icon": "files", "order": 2, "group": "sidebar"},
        {"key": "sidebar.favorites", "label": "즐겨찾기", "url": "#", "icon": "star", "order": 3, "group": "sidebar"},
        {"key": "sidebar.trash", "label": "휴지통", "url": "#", "icon": "trash-2", "order": 4, "group": "sidebar"},
    ]
    for item in sidebar_items:
        MenuItem.objects.get_or_create(key=item["key"], defaults=item)

    # ---------- AppSetting ----------
    settings = [
        {"key": "site_title", "value": "theMemo", "label": "사이트 제목", "description": "웹사이트 메인 타이틀"},
        {"key": "site_description", "value": "생각과 일상을 기록하는 나만의 스마트메모", "label": "사이트 설명", "description": "서치 엔진용 메타 설명"},
        {"key": "favicon", "value": "/static/memo/assets/favicon.svg", "label": "파비콘", "description": "사이트 파비콘 파일"},
    ]
    for s in settings:
        AppSetting.objects.get_or_create(key=s["key"], defaults=s)

    # ---------- FeatureFlag ----------
    flags = [
        {"key": "blog_enabled", "description": "블로그 기능 활성화 여부"},
        {"key": "image_import_enabled", "description": "유튜브 썸네일 이미지 가져오기"},
    ]
    for f in flags:
        FeatureFlag.objects.get_or_create(key=f["key"], defaults=f)


class Migration(migrations.Migration):

    dependencies = [
        ('notes', '0003_merge_0002_auto_add_new_models_0002_note_is_public'),
    ]

    operations = [
        migrations.RunPython(_initial_data),
    ]