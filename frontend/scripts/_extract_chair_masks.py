"""
Extract polygons from shaded chair pixels (1024×768 floor-plan.png).
Bar tabureleri 5–6 hariç dolgu çıkarımı güvenilir; eksik olanlar uygun bir
üst komşuya dikey öteleme ile doldurulur.
Produces src/waiterChairPolygons.gen.js → export CHAIR_POLYGONS
"""

import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / "public/floor-plan.png"
OUT_JS = ROOT / "src" / "waiterChairPolygons.gen.js"


def approx_poly(cnt, eps_frac: float = 0.012):
    peri = cv2.arcLength(cnt, True)
    ap = cv2.approxPolyDP(cnt, max(2.0, peri * eps_frac), True)
    return ap.reshape(-1, 2)


def furniture_mask(lo: int, hi: int) -> np.ndarray:
    gray = cv2.imread(str(PNG), cv2.IMREAD_GRAYSCALE)
    mask = ((gray >= lo) & (gray <= hi)).astype("uint8") * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k, 1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, 2)
    return mask


def blob_rows(mask: np.ndarray, amin: float, amax: float):
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    rows = []
    for c in cnts:
        ar = cv2.contourArea(c)
        if not amin <= ar <= amax:
            continue
        M = cv2.moments(c)
        if M["m00"] == 0:
            continue
        cx = float(M["m10"] / M["m00"])
        cy = float(M["m01"] / M["m00"])
        rows.append({"cx": cx, "cy": cy, "area": ar, "cnt": c})
    return rows


def contour_to_pts(c, offset_xy=(0, 0)):
    pts = approx_poly(np.array(c)).astype(float)
    off = np.array(offset_xy)
    pts = pts + off
    return pts.astype(int)


def shift_polygon_flat(flat_xy, dy_px: float):
    out = list(flat_xy)
    for i in range(1, len(out), 2):
        out[i] = int(round(out[i] + dy_px))
    return out


def extract_bar_polys():
    gray = cv2.imread(str(PNG), cv2.IMREAD_GRAYSCALE)
    anchors_y = [284, 336, 388, 440, 494, 548]
    cx = 206
    seats = []
    for i, ay in enumerate(anchors_y):
        x0 = max(0, cx - 44)
        y0 = max(0, ay - 38)
        x1 = min(1024, cx + 44)
        y1 = min(768, ay + 44)
        crop = gray[y0:y1, x0:x1]
        mk = ((crop >= 115) & (crop <= 252)).astype("uint8") * 255
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        mk = cv2.morphologyEx(mk, cv2.MORPH_CLOSE, k, iterations=2)
        cnts, _ = cv2.findContours(mk, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        best_ar = -1.0
        for c in cnts:
            ar = cv2.contourArea(c)
            if ar < 120 or ar > 9000:
                continue
            M = cv2.moments(c)
            if M["m00"] == 0:
                continue
            lcy = float(M["m01"] / M["m00"]) + y0
            if abs(lcy - ay) > 55:
                continue
            if ar > best_ar:
                best_ar = ar
                best = c
        pid = f"bar-{i+1}"
        if best is None:
            seats.append({"id": pid, "points": []})
        else:
            pts = contour_to_pts(best, (x0, y0))
            seats.append({"id": pid, "points": pts.flatten().tolist()})
    for idx in range(6):
        if seats[idx]["points"]:
            continue
        j = idx - 1
        while j >= 0 and not seats[j]["points"]:
            j -= 1
        if j < 0:
            continue
        dy = anchors_y[idx] - anchors_y[j]
        seats[idx]["points"] = shift_polygon_flat(seats[j]["points"], dy)
    return [{"id": s["id"], "points": s["points"]} for s in seats]


def main():
    mk = furniture_mask(120, 252)
    all_blobs = blob_rows(mk, 280, 5500)

    top = sorted([b for b in all_blobs if 310 < b["cy"] < 350], key=lambda z: z["cx"])
    mid = sorted([b for b in all_blobs if 410 < b["cy"] < 452], key=lambda z: z["cx"])
    if len(top) < 6 or len(mid) < 6:
        dbg = ROOT / "src" / "_chair_extract_debug.json"
        dbg.write_text(json.dumps({"top_len": len(top), "mid_len": len(mid)}), encoding="utf-8")
        raise SystemExit("diamond blobs missing")

    lounges = sorted(
        [b for b in all_blobs if b["cy"] > 668 and b["area"] > 4200], key=lambda z: z["cx"]
    )[:4]

    rects = sorted(
        [b for b in all_blobs if 570 < b["cy"] < 710 and b["cx"] > 760], key=lambda z: (z["cy"], z["cx"])
    )[-4:]
    rects = sorted(rects, key=lambda z: (round(z["cy"] / 50) * 50, z["cx"]))

    row1_ids = ["m1-nw", "m1-ne", "m2-nw", "m2-ne", "m3-nw", "m3-ne"]
    row2_ids = ["m1-sw", "m1-se", "m2-sw", "m2-se", "m3-sw", "m3-se"]
    lou_ids = ["lounge-1", "lounge-2", "lounge-3", "lounge-4"]
    rect_ids = ["rect-L1", "rect-R1", "rect-L2", "rect-R2"]

    out = []

    out.extend(extract_bar_polys())

    for pid, b in zip(row1_ids, top[:6]):
        pts = contour_to_pts(b["cnt"])
        out.append({"id": pid, "points": pts.flatten().tolist()})
    for pid, b in zip(row2_ids, mid[:6]):
        pts = contour_to_pts(b["cnt"])
        out.append({"id": pid, "points": pts.flatten().tolist()})
    for pid, b in zip(lou_ids, lounges):
        pts = contour_to_pts(b["cnt"])
        out.append({"id": pid, "points": pts.flatten().tolist()})
    for pid, b in zip(rect_ids, rects):
        pts = contour_to_pts(b["cnt"])
        out.append({"id": pid, "points": pts.flatten().tolist()})

    if len(out) != 26:
        raise SystemExit(f"expected 26 ids, got {len(out)}")

    empty = [r["id"] for r in out if not r["points"]]
    if empty:
        raise SystemExit(f"empty polygons: {empty}")

    lines = [
        "// Auto-generated by scripts/_extract_chair_masks.py",
        "",
        '/** Dinamık oluşturuldu — floor-plan görselinden kontur çıkarımı @type {Readonly<Record<string, Readonly<number[]>>>} */',
        "",
        "export const CHAIR_POLYGONS = /** @type {const} */ ({",
    ]
    for row in sorted(out, key=lambda z: z["id"]):
        pts = ",".join(str(int(p)) for p in row["points"])
        lines.append(f"  '{row['id']}': Object.freeze([{pts}]),")
    lines.extend(["});", "", ""])

    OUT_JS.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", OUT_JS)


if __name__ == "__main__":
    main()
