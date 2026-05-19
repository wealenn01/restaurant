"""
İşaretli PNG (1024×N) ile public/floor-plan.png (1024×768) farkından
siyah çerçeve piksellerini bulup bbox listeler — waiterTableRegions.js ile doğrulama için.
Çalıştır: python scripts/trace_table_frames_from_user_png.py path/to/marked.png
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FLOOR = ROOT / "public" / "floor-plan.png"


def main():
    marked = sys.argv[1] if len(sys.argv) > 1 else None
    if not marked:
        print("usage: python trace_table_frames_from_user_png.py <marked.png>")
        sys.exit(1)
    floor = np.array(Image.open(FLOOR).convert("RGB"))
    ann = np.array(Image.open(marked).convert("RGB"))
    ann768 = np.array(Image.fromarray(ann).resize((1024, 768), Image.LANCZOS))
    ann_g = ann768.mean(axis=2)
    fl_g = floor.mean(axis=2)
    mask = (ann_g < 35) & (fl_g - ann_g > 12)

    H, W = mask.shape
    vis = np.zeros_like(mask, dtype=bool)
    comps = []
    for y in range(H):
        for x in range(W):
            if not mask[y, x] or vis[y, x]:
                continue
            q = deque([(x, y)])
            vis[y, x] = True
            mnX = mxX = x
            mnY = mxY = y
            cnt = 0
            while q:
                cx, cy = q.popleft()
                cnt += 1
                mnX, mxX = min(mnX, cx), max(mxX, cx)
                mnY, mxY = min(mnY, cy), max(mxY, cy)
                for nx, ny in (
                    (cx + 1, cy),
                    (cx - 1, cy),
                    (cx, cy + 1),
                    (cx, cy - 1),
                ):
                    if (
                        0 <= nx < W
                        and 0 <= ny < H
                        and mask[ny, nx]
                        and not vis[ny, nx]
                    ):
                        vis[ny, nx] = True
                        q.append((nx, ny))
            if cnt >= 120:
                comps.append((cnt, mnX, mnY, mxX, mxY))

    comps.sort(reverse=True, key=lambda z: z[0])

    inset = 3
    for cnt, mnX, mnY, mxX, mxY in comps:
        tall_left = mnX <= 100 and mxX <= 210 and (mxY - mnY) > 120
        if tall_left and mxX > 93:
            sub_mx = 93
        else:
            sub_mx = mxX
        a, b, c, d = mnX, mnY, sub_mx, mxY
        if c <= a + 15:
            continue
        xi0, yi0, xi1, yi1 = a + inset, b + inset, c - inset, d - inset
        print(f"pixels={cnt}\tRECT\t{mnX},{mnY}-{mxX},{mxY}\tINSET\t{xi0},{yi0},{xi1},{yi1}")

    sys.exit(0)


if __name__ == "__main__":
    main()
