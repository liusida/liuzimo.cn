#!/usr/bin/env python3
"""Regenerate images/gallery.json from EXIF DateTimeOriginal in each JPEG. Requires: pip install piexif."""
import json
import os
import sys

try:
    import piexif
except ImportError:
    print("Install piexif:  python3 -m venv .venv-gallery && .venv-gallery/bin/pip install piexif", file=sys.stderr)
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, "images")
OUT = os.path.join(IMAGES, "gallery.json")


def main() -> None:
    rows = []
    for fn in sorted(os.listdir(IMAGES)):
        if fn == "gallery.json":
            continue
        if not fn.lower().endswith((".jpg", ".jpeg")):
            continue
        path = os.path.join(IMAGES, fn)
        try:
            d = piexif.load(path)
        except Exception:
            rows.append({"file": fn, "datetimeExif": None})
            continue
        ex = d.get("Exif", {})
        dt = ex.get(piexif.ExifIFD.DateTimeOriginal)
        if dt and isinstance(dt, bytes):
            dt = dt.decode()
        rows.append({"file": fn, "datetimeExif": dt})

    def sort_key(r: dict) -> tuple:
        return (r.get("datetimeExif") or "", r["file"])

    rows.sort(key=sort_key)
    data = {
        "version": 1,
        "timezoneNoteEn": "Times are from the camera EXIF (local clock; no timezone stored).",
        "timezoneNoteZh": "时间为照片 EXIF 中的相机本地时间（文件未含时区信息）。",
        "items": rows,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("Wrote", OUT, len(rows), "items")


if __name__ == "__main__":
    main()
