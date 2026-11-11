import ipaddress
import re
import socket
from io import BytesIO
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from PIL import Image, UnidentifiedImageError


MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
ALLOWED_HOST = "i.ytimg.com"
YOUTUBE_PATH = re.compile(r"^/vi/[A-Za-z0-9_-]{11}/[A-Za-z0-9_-]+\.(?:jpg|webp)$")
YOUTUBE_QUERY_VALUE = re.compile(r"^[A-Za-z0-9_-]{1,256}$")


class RemoteImageError(ValueError):
    pass


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _validate_url(url):
    try:
        parsed = urlsplit(url)
    except (TypeError, ValueError) as exc:
        raise RemoteImageError("이미지 주소가 올바르지 않습니다.") from exc
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST or parsed.port not in (None, 443):
        raise RemoteImageError("허용되지 않은 이미지 주소입니다.")
    if parsed.username or parsed.password or parsed.fragment or not YOUTUBE_PATH.fullmatch(parsed.path):
        raise RemoteImageError("허용되지 않은 YouTube 썸네일 주소입니다.")
    if parsed.query:
        try:
            pairs = parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True, max_num_fields=2)
        except ValueError as exc:
            raise RemoteImageError("허용되지 않은 YouTube 썸네일 query입니다.") from exc
        query = dict(pairs)
        if len(pairs) != 2 or set(query) != {"sqp", "rs"} or any(not YOUTUBE_QUERY_VALUE.fullmatch(value) for value in query.values()):
            raise RemoteImageError("허용되지 않은 YouTube 썸네일 query입니다.")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as exc:
        raise RemoteImageError("이미지 서버 주소를 확인하지 못했습니다.") from exc
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise RemoteImageError("안전하지 않은 이미지 서버 주소입니다.")
    return parsed.geturl()


def _open_once(url, timeout):
    request = Request(url, headers={"Accept": "image/jpeg,image/webp", "User-Agent": "theMemo-thumbnail-import/1.0"})
    try:
        return build_opener(_NoRedirect).open(request, timeout=timeout)
    except HTTPError as exc:
        if 300 <= exc.code < 400:
            return exc
        raise


def normalize_remote_image(data):
    if len(data) > MAX_IMAGE_BYTES:
        raise RemoteImageError("이미지는 5MB 이하여야 합니다.")
    try:
        image = Image.open(BytesIO(data))
        image.verify()
        image = Image.open(BytesIO(data))
        width, height = image.size
        image_format = image.format
        if width * height > MAX_IMAGE_PIXELS:
            raise RemoteImageError("지원하지 않는 이미지 크기입니다.")
        image.load()
    except RemoteImageError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise RemoteImageError("가져온 파일이 유효한 이미지가 아닙니다.") from exc

    formats = {"JPEG": ("image/jpeg", ".jpg"), "PNG": ("image/png", ".png"), "WEBP": ("image/webp", ".webp")}
    if image_format in formats:
        content_type, suffix = formats[image_format]
        return data, content_type, suffix
    if image_format != "AVIF":
        raise RemoteImageError("지원하지 않는 이미지 형식입니다.")

    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    output = BytesIO()
    try:
        if has_alpha:
            image.convert("RGBA").save(output, format="PNG", optimize=True)
            content_type, suffix, expected_format = "image/png", ".png", "PNG"
        else:
            image.convert("RGB").save(output, format="JPEG", quality=90, optimize=True)
            content_type, suffix, expected_format = "image/jpeg", ".jpg", "JPEG"
        normalized = output.getvalue()
        if len(normalized) > MAX_IMAGE_BYTES:
            raise RemoteImageError("변환된 이미지는 5MB 이하여야 합니다.")
        check = Image.open(BytesIO(normalized))
        check.verify()
        check = Image.open(BytesIO(normalized))
        if check.format != expected_format or check.width * check.height > MAX_IMAGE_PIXELS:
            raise RemoteImageError("변환된 이미지 형식 또는 크기가 올바르지 않습니다.")
        check.load()
    except RemoteImageError:
        raise
    except (OSError, Image.DecompressionBombError) as exc:
        raise RemoteImageError("AVIF 이미지를 안전한 형식으로 변환하지 못했습니다.") from exc
    return normalized, content_type, suffix


def fetch_youtube_thumbnail(url, timeout=5):
    current = url
    for _ in range(4):
        current = _validate_url(current)
        try:
            response = _open_once(current, timeout)
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise RemoteImageError("YouTube 썸네일을 가져오지 못했습니다.") from exc
        with response:
            status = getattr(response, "status", getattr(response, "code", 200))
            if 300 <= status < 400:
                location = response.headers.get("Location")
                if not location:
                    raise RemoteImageError("이미지 redirect 주소가 없습니다.")
                current = urljoin(current, location)
                continue
            if status != 200:
                raise RemoteImageError("YouTube 썸네일 응답이 올바르지 않습니다.")
            length = response.headers.get("Content-Length")
            if length and int(length) > MAX_IMAGE_BYTES:
                raise RemoteImageError("이미지는 5MB 이하여야 합니다.")
            chunks, total = [], 0
            while True:
                chunk = response.read(min(64 * 1024, MAX_IMAGE_BYTES + 1 - total))
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
                if total > MAX_IMAGE_BYTES:
                    raise RemoteImageError("이미지는 5MB 이하여야 합니다.")
            return normalize_remote_image(b"".join(chunks))
    raise RemoteImageError("이미지 redirect가 너무 많습니다.")
