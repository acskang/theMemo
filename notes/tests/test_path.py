import sys
import os

def test_sys_path(tmp_path):
    print("sys.path:", sys.path)
    try:
        import notes
        print("imported notes ok")
    except Exception as e:
        print("import error", e)
        raise