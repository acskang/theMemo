from django.contrib.auth import get_user_model
from django.test import TestCase

from .validation import validate_document


class PastedTextStyleTests(TestCase):
    def doc(self, attrs):
        return {"type": "doc", "content": [{"type": "paragraph", "content": [
            {"type": "text", "text": "x", "marks": [{"type": "textStyle", "attrs": attrs}]}]}]}

    def test_unsupported_pasted_styles_are_dropped_not_rejected(self):
        user = get_user_model().objects.create_user("u", password="p")
        doc = self.doc({"fontSize": "16px", "fontFamily": "Google Sans", "lineHeight": "1.6",
                        "color": "oklch(0.5 0 0)", "backgroundColor": "#fff"})
        validate_document(doc, user)
        attrs = doc["content"][0]["content"][0]["marks"][0]["attrs"]
        self.assertEqual(attrs, {"backgroundColor": "#fff"})

    def test_allowed_styles_are_kept(self):
        user = get_user_model().objects.create_user("u", password="p")
        doc = self.doc({"fontSize": "17px", "color": "rgb(31, 31, 31)"})
        validate_document(doc, user)
        self.assertEqual(doc["content"][0]["content"][0]["marks"][0]["attrs"], {"fontSize": "17px", "color": "rgb(31, 31, 31)"})
