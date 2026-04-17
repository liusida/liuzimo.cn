#!/usr/bin/env python3
"""Move JPEGs listed in images/gallery-hidden.txt out of images/ into private-gallery/.

Those files are then gitignored and are not deployed to GitHub Pages, so direct URLs stop working.
After moving, run: .venv-gallery/bin/python scripts/build-gallery-json.py
"""
from __future__ import annotations

import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIDDEN_TXT = os.path.join(ROOT, "images", "gallery-hidden.txt")
IMAGES_DIR = os.path.join(ROOT, "images")
PRIVATE_DIR = os.path.join(ROOT, "private-gallery")


def load_hidden_list(path: str) -> list[str]:
    if not os.path.isfile(path):
        print("Missing", path, file=sys.stderr)
        sys.exit(1)
    out: list[str] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            t = line.strip()
            if not t or t.startswith("#"):
                continue
            out.append(t)
    return out


def main() -> None:
    names = load_hidden_list(HIDDEN_TXT)
    if not names:
        print("No filenames listed in gallery-hidden.txt (only comments/empty). Nothing to move.")
        return

    os.makedirs(PRIVATE_DIR, exist_ok=True)
    moved = 0
    skipped = 0
    for fn in names:
        src = os.path.join(IMAGES_DIR, fn)
        dst = os.path.join(PRIVATE_DIR, fn)
        if not os.path.isfile(src):
            if os.path.isfile(dst):
                print("Already in private-gallery (skipped):", fn)
                skipped += 1
            else:
                print("Not found in images/ (skipped):", fn)
                skipped += 1
            continue
        if os.path.exists(dst):
            print("Refusing to overwrite existing private-gallery file:", fn, file=sys.stderr)
            skipped += 1
            continue
        shutil.move(src, dst)
        print("Moved:", fn)
        moved += 1

    print("Done. Moved", moved, "file(s);", skipped, "skipped.")
    if moved:
        print("Regenerate manifest: .venv-gallery/bin/python scripts/build-gallery-json.py")


if __name__ == "__main__":
    main()
