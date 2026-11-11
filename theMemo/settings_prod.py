import os

from django.core.exceptions import ImproperlyConfigured

from .settings import *  # noqa: F403


def env_list(name, default):
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


secret_key = os.environ.get("DJANGO_SECRET_KEY")
if not secret_key:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set in production.")

SECRET_KEY = secret_key
DEBUG = False
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "memo.thesysm.com,127.0.0.1,localhost")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "https://memo.thesysm.com")

DATABASES["default"]["NAME"] = os.environ.get("THEMEMO_DB_PATH", str(BASE_DIR / "db.sqlite3"))
MEDIA_ROOT = os.environ.get("THEMEMO_MEDIA_ROOT", str(BASE_DIR / "private-media"))
STATIC_ROOT = os.environ.get("THEMEMO_STATIC_ROOT", str(BASE_DIR / "staticfiles"))
STATIC_URL = "/static/"

# Gunicorn is reachable only through the local Unix socket and Nginx sets this header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_HSTS_SECONDS = 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
X_FRAME_OPTIONS = "DENY"
