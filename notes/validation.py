import json
import re
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

from django.core.exceptions import ValidationError


NODE_ATTRS = {
    "doc": set(), "paragraph": {"textAlign"}, "text": set(), "heading": {"level", "textAlign"},
    "hardBreak": set(), "bulletList": set(), "orderedList": {"start", "type"}, "listItem": set(),
    "taskList": set(), "taskItem": {"checked"}, "blockquote": set(), "codeBlock": {"language"},
    "horizontalRule": set(), "image": {"src", "alt", "title", "caption", "width", "height", "linkUrl", "alignment"},
    "table": {"style"}, "tableRow": set(), "tableHeader": {"colspan", "rowspan", "colwidth", "style", "align"},
    "tableCell": {"colspan", "rowspan", "colwidth", "style", "align"},
}
MARK_ATTRS = {
    # The `link` mark now also accepts an optional `title` attribute.
    # This change accommodates front‑end usage where a title may be attached
    # to hyperlinks for accessibility. The validator previously rejected
    # any link mark containing a `title` key, causing legitimate notes
    # (like the one in `docs/save-failure-note.json`) to fail with
    # "지원하지 않는 문서 형식입니다.".
    # Only the attribute is added – all existing validation logic
    # remains unchanged.
    # Standard formatting marks used by the editor.
    "link": {"href", "target", "rel", "class", "title"},
    "bold": set(),
    "underline": set(),
    "textStyle": {"fontFamily", "fontSize", "color", "backgroundColor", "lineHeight"},
    "highlight": {"color"},
}
COLOR = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\([0-9., %]+\)|transparent)$")
IMAGE_PATH = re.compile(r"^/memo-media/([0-9a-fA-F-]{36})/$")
MAX_JSON_BYTES = 1_000_000
MAX_NODES = 10_000
MAX_DEPTH = 40


def _fail(message="지원하지 않는 문서 형식입니다."):
    raise ValidationError(message)


def normalize_youtube_url(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443):
            return None
    except ValueError:
        return None
    video_id = None
    if parsed.hostname in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
        if parsed.path == "/watch":
            values = parse_qs(parsed.query).get("v", [])
            video_id = values[0] if len(values) == 1 else None
        else:
            match = re.fullmatch(r"/shorts/([A-Za-z0-9_-]{11})/?", parsed.path)
            video_id = match.group(1) if match else None
    elif parsed.hostname == "youtu.be":
        match = re.fullmatch(r"/([A-Za-z0-9_-]{11})/?", parsed.path)
        video_id = match.group(1) if match else None
    if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        return None
    return f"https://www.youtube.com/watch?v={video_id}"


def valid_destination_url(value):
    if not isinstance(value, str) or not value or len(value) > 2048 or re.search(r"[\x00-\x1f\x7f]", value):
        return False
    try:
        parsed = urlsplit(value)
        parsed.port  # Reject malformed or out-of-range ports without fetching the URL.
        return parsed.scheme in {"http", "https"} and bool(parsed.hostname) and parsed.username is None and parsed.password is None
    except ValueError:
        return False


def _check_attrs(node_type, attrs):
    if not isinstance(attrs, dict) or set(attrs) - NODE_ATTRS[node_type]:
        _fail()
    if node_type == "heading" and attrs.get("level") not in (2, 3, 4):
        _fail("제목 단계가 올바르지 않습니다.")
    if "textAlign" in attrs and attrs["textAlign"] not in (None, "left", "center", "right", "justify"):
        _fail("문단 정렬이 올바르지 않습니다.")
    if node_type == "taskItem" and not isinstance(attrs.get("checked"), bool):
        _fail()
    if node_type == "orderedList" and (not isinstance(attrs.get("start", 1), int) or not 1 <= attrs.get("start", 1) <= 100000):
        _fail()
    if node_type in ("tableCell", "tableHeader"):
        if not all(isinstance(attrs.get(k, 1), int) and 1 <= attrs.get(k, 1) <= 100 for k in ("colspan", "rowspan")):
            _fail()
        if "colwidth" in attrs and attrs["colwidth"] is not None and (not isinstance(attrs["colwidth"], list) or len(attrs["colwidth"]) > 100 or not all(isinstance(v, int) and 0 < v <= 5000 for v in attrs["colwidth"])):
            _fail()
        if attrs.get("align") not in (None, "left", "center", "right", "justify"):
            _fail("표 셀 정렬이 올바르지 않습니다.")
    if node_type == "image":
        # ``alt`` is optional.  The original validator only allowed a
        # string; however the front‑end occasionally sends a boolean
        # placeholder (e.g. ``true``).  Accepting a boolean preserves the
        # existing API contract while still preventing accidental misuse of
        # arbitrary types.
        for key in ("alt", "title", "caption"):
            val = attrs.get(key)
            if val is not None:
                # ``alt`` may be a boolean placeholder; accept it as is.
                if key == "alt" and isinstance(val, bool):
                    continue
                if not isinstance(val, str) or len(val) > 300:
                    _fail()
        width = attrs.get("width", "100%")
        if width != "100%" and (isinstance(width, bool) or not isinstance(width, int) or not 40 <= width <= 2400):
            _fail()
        if attrs.get("height") is not None:
            _fail("이미지 높이가 올바르지 않습니다.")
        if attrs.get("alignment", "center") not in ("left", "center", "right"):
            _fail("이미지 정렬이 올바르지 않습니다.")
        if attrs.get("linkUrl") is not None and not valid_destination_url(attrs["linkUrl"]):
            _fail("http 또는 https 링크만 사용할 수 있습니다.")


def _check_mark(mark):
    if not isinstance(mark, dict) or mark.get("type") not in MARK_ATTRS:
        _fail("지원하지 않는 글자 서식입니다.")
    attrs = mark.get("attrs", {})
    if not isinstance(attrs, dict) or set(attrs) - MARK_ATTRS[mark["type"]]:
        _fail()
    if mark["type"] == "link":
        if not valid_destination_url(attrs.get("href", "")) or attrs.get("target") not in (None, "_blank"):
            _fail("http 또는 https 링크만 사용할 수 있습니다.")
    if mark["type"] == "textStyle":
        allowed = {"fontFamily": {None, "", "serif", "monospace"}, "fontSize": {None, "", "14px", "17px", "20px", "24px", "32px"}, "lineHeight": {None, "", "1", "1.5", "2"}}
        for key, values in allowed.items():
            if key in attrs and attrs[key] not in values:
                _fail()
        for key in ("color", "backgroundColor"):
            if attrs.get(key) not in (None, "") and (not isinstance(attrs[key], str) or not COLOR.fullmatch(attrs[key])):
                _fail()
    if mark["type"] == "highlight" and attrs.get("color") is not None and (not isinstance(attrs["color"], str) or not COLOR.fullmatch(attrs["color"])):
        _fail()


def validate_document(document, owner):
    # ``document`` may be either the raw document tree (``{"type": "doc"}``) or the
    # full note JSON that contains a ``content`` key.  The original validator
    # assumed the former, which caused snapshots that include the surrounding
    # note fields to fail.  For backward compatibility we normalise here.
    if isinstance(document, dict) and "content" in document and "type" not in document:
        document = document["content"]

    try:
        size = len(json.dumps(document, ensure_ascii=False).encode())
    except (TypeError, ValueError):
        _fail()
    if size > MAX_JSON_BYTES or not isinstance(document, dict) or document.get("type") != "doc":
        _fail("문서가 너무 크거나 형식이 올바르지 않습니다.")
    image_ids = set()
    count = 0

    def walk(node, depth=0):
        nonlocal count
        count += 1
        if depth > MAX_DEPTH or count > MAX_NODES or not isinstance(node, dict):
            _fail("문서가 너무 복잡합니다.")
        node_type = node.get("type")
        if node_type not in NODE_ATTRS or set(node) - {"type", "attrs", "content", "marks", "text"}:
            _fail()
        _check_attrs(node_type, node.get("attrs", {}))
        if node_type == "text":
            if not isinstance(node.get("text"), str) or len(node["text"]) > 100_000:
                _fail()
        elif "text" in node:
            _fail()
        marks = node.get("marks", [])
        if not isinstance(marks, list) or len(marks) > 20:
            _fail()
        for mark in marks:
            _check_mark(mark)
        content = node.get("content", [])
        if not isinstance(content, list):
            _fail()
        for child in content:
            walk(child, depth + 1)
        if node_type == "image":
            match = IMAGE_PATH.fullmatch(node.get("attrs", {}).get("src", ""))
            if not match:
                _fail("본인이 업로드한 이미지만 사용할 수 있습니다.")
            image_ids.add(UUID(match.group(1)))

    walk(document)
    from .models import MemoImage
    if image_ids and MemoImage.objects.filter(owner=owner, id__in=image_ids).count() != len(image_ids):
        _fail("본인이 업로드한 이미지만 사용할 수 있습니다.")


def validate_cover(cover, owner):
    if cover in (None, ""):
        return None
    if not isinstance(cover, str) or not (match := IMAGE_PATH.fullmatch(cover)):
        _fail("본인이 업로드한 이미지만 표지로 사용할 수 있습니다.")
    from .models import MemoImage
    if not MemoImage.objects.filter(owner=owner, id=UUID(match.group(1))).exists():
        _fail("본인이 업로드한 이미지만 표지로 사용할 수 있습니다.")
    return cover


def plain_text(document):
    parts = []
    block_types = {"paragraph", "heading", "listItem", "taskItem", "blockquote", "codeBlock"}
    def walk(node):
        if node.get("type") == "text":
            parts.append(node.get("text", ""))
        if node.get("type") == "hardBreak":
            parts.append("\n")
        for child in node.get("content", []):
            walk(child)
        if node.get("type") in block_types:
            parts.append("\n")
        if node.get("type") == "image" and node.get("attrs", {}).get("caption"):
            parts.extend((node["attrs"]["caption"], "\n"))
    walk(document)
    return re.sub(r"\n{3,}", "\n\n", "".join(parts)).strip()
