from django.contrib.auth import get_user_model
from django.test import TestCase

from .validation import validate_document


class PastedTextStyleTests(TestCase):
    def doc(self, attrs):
        return {"type": "doc", "content": [{"type": "paragraph", "content": [
            {"type": "text", "text": "x", "marks": [{"type": "textStyle", "attrs": attrs}]}]}]}

    def test_unsupported_pasted_styles_are_dropped_not_rejected(self):
        user = get_user_model().objects.create_user("u", password="p")
        doc = self.doc({"fontSize": "200px", "fontFamily": "Google Sans", "lineHeight": "1.6",
                        "color": "oklch(0.5 0 0)", "backgroundColor": "#fff"})
        validate_document(doc, user)
        attrs = doc["content"][0]["content"][0]["marks"][0]["attrs"]
        self.assertEqual(attrs, {"backgroundColor": "#fff"})

    def test_allowed_styles_are_kept(self):
        user = get_user_model().objects.create_user("u", password="p")
        doc = self.doc({"fontSize": "15px", "color": "rgb(31, 31, 31)"})
        validate_document(doc, user)
        self.assertEqual(doc["content"][0]["content"][0]["marks"][0]["attrs"], {"fontSize": "15px", "color": "rgb(31, 31, 31)"})

    def test_custom_font_size_range(self):
        user = get_user_model().objects.create_user("u", password="p")
        for size, kept in (("8px", True), ("96px", True), ("7px", False), ("97px", False), ("12.5px", False), ("1em", False)):
            doc = self.doc({"fontSize": size})
            validate_document(doc, user)
            self.assertEqual("fontSize" in doc["content"][0]["content"][0]["marks"][0]["attrs"], kept, size)
