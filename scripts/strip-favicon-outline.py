#!/usr/bin/env python3
"""Remove near-white pixels that touch the outer transparent region (typical 1px icon outline)."""
from __future__ import annotations

import os
import sys
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "image.png")


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else PATH
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()

    outside = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for y in range(h):
        for x in range(w):
            if x not in (0, w - 1) and y not in (0, h - 1):
                continue
            if px[x, y][3] < 128:
                outside[y][x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not outside[ny][nx]:
                if px[nx, ny][3] < 128:
                    outside[ny][nx] = True
                    q.append((nx, ny))

    out = im.copy()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            if not (r > 238 and g > 238 and b > 238):
                continue
            touches_outside = False
            for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    if outside[ny][nx]:
                        touches_outside = True
                        break
                else:
                    touches_outside = True
            if touches_outside:
                opx[x, y] = (0, 0, 0, 0)

    out.save(path)
    print("Wrote", path)


if __name__ == "__main__":
    main()
