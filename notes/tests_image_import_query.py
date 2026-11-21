from django.test import SimpleTestCase

from .image_import import RemoteImageError, _validate_url
from unittest.mock import patch

BASE = "https://i.ytimg.com/vi/7mQwJhtotxM/hq720.jpg"


class YoutubeThumbnailQueryTests(SimpleTestCase):
    def check(self, url):
        with patch("notes.image_import.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("142.250.0.1", 443))]):
            return _validate_url(url)

    def test_base64_padding_and_encoded_values_are_accepted(self):
        for query in (
            "sqp=-oaymwEnCNAFEJQDSFryq4qpAxkIARUAAIhCGAHYAQHiAQoIGBACGAY4AUAB&rs=AOn4CLCIHtNfJPWMcOdyxYtvR83kxu0lRA",
            "sqp=-oaymwEiCNIBEHZIWvKriqkDFQgBFQAAAAAYASUAAMhCPQCAokN4AQ==&rs=AOn4CLCfZ7abc",
            "sqp=-oaymwEiCNIBEHZIWvKriqkDFQgBFQAAAAAYASUAAMhCPQCAokN4AQ%3D%3D&rs=AOn4CLCfZ7abc",
        ):
            self.assertEqual(self.check(f"{BASE}?{query}"), f"{BASE}?{query}")

    def test_still_rejects_extra_params_and_bad_chars(self):
        for query in ("sqp=a&rs=b&extra=c", "sqp=a&sqp=b", "sqp=a&rs=b%0d%0aX", "sqp=a&rs=<script>"):
            with self.assertRaises(RemoteImageError):
                self.check(f"{BASE}?{query}")
