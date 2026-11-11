# debug_marks.py  사용법: python debug_marks.py save-real-payload.json
import json, sys
from notes.validation import MARK_ATTRS

def walk(node, path="root"):
    for i, m in enumerate(node.get("marks") or []):
        t = m.get("type")
        attrs = set((m.get("attrs") or {}).keys())
        allowed = MARK_ATTRS.get(t)
        if allowed is None:
            print(f"[mark 타입 미등록] {path}.marks[{i}] type={t}")
        elif attrs - allowed:
            print(f"[attr 미허용] {path}.marks[{i}] type={t} extra={attrs - allowed}")
    for i, c in enumerate(node.get("content") or []):
        walk(c, f"{path}.content[{i}]")

data = json.load(open(sys.argv[1]))
walk(data.get("content", data))  # payload 구조에 맞게 조정