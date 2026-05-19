"""
İşaret PNG’sindeki kare/dikdörtgen çerçeveleri bulur: plan farkı maske + bağlı bileşen
+ kontur yaklaştırması. Sonuçları src/waiterRegions.auto.json yazar.

Örnek:
  python scripts/regen_table_regions_from_marked_png.py path/to/isaretli.png
Varsayılan çıktı: src/waiterRegions.auto.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FLOOR = ROOT / "public" / "floor-plan.png"
DEFAULT_OUT = ROOT / "src" / "waiterRegions.auto.json"
INSET_PX = 3
# Sol bar alt kutusunda oklar sağa uzarsa genişlik bu x’e kırpılır
BAR_CLIP_MAX_X = 93


def marker_mask(floor: np.ndarray, ann768: np.ndarray) -> np.ndarray:
    ag = ann768.mean(axis=2)
    fg = floor.mean(axis=2)
    return ((ag < 38) & (fg - ag > 10)).astype(np.uint8) * 255


def largest_contour(binary: np.ndarray):
    cnts, _ = cv2.findContours(
        binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if not cnts:
        return None
    return max(cnts, key=cv2.contourArea)


def contour_inset_rect(c) -> tuple[int, int, int, int] | None:
    """Kontur bbox’u; kalem kalınlığı için INSET_PX içeri."""
    x, y, w, h = cv2.boundingRect(c)
    x0, y0 = x + INSET_PX, y + INSET_PX
    x1, y1 = x + w - INSET_PX, y + h - INSET_PX
    if x1 <= x0 + 4 or y1 <= y0 + 4:
        return None
    return x0, y0, x1, y1


def rect_to_flat(xyxy: tuple[int, int, int, int]) -> list[float]:
    x0, y0, x1, y1 = xyxy
    return [x0, y0, x1, y0, x1, y1, x0, y1]


def classify_and_order(
    items: list[dict],
) -> tuple[list[list[float]], list[str]]:
    """
    items: { 'xyxy','cx','cy','w','h','asp','verts','area' }
    Dönüş sırası waiterTableRegions ile aynı: bar×2, üst×3, lounge yok → atlanır, sağ-alt×2
    Lounge bu scriptte üretilmez (JS sabitleri).
    """
    bars = []
    top_sq = []
    br_sq = []
    noise = []

    for it in items:
        cx, cy = it["cx"], it["cy"]
        w, h = it["w"], it["h"]
        asp = it["asp"]
        # ok / üst gürültü
        if it["area"] < 650:
            noise.append(it)
            continue
        if cx < 130 and (h > w * 1.4 or w < h * 0.55) and cy < 580:
            bars.append(it)
            continue
        if cy < 395 and cx > 220 and asp > 0.48 and it["area"] > 2500:
            top_sq.append(it)
            continue
        if cy > 455 and cx > 800 and asp > 0.45 and it["area"] > 800:
            br_sq.append(it)
            continue
        if cy < 160 and cx < 220:
            noise.append(it)
            continue
        noise.append(it)

    bars = sorted(bars, key=lambda z: z["cy"])[:2]
    top_sq = sorted(top_sq, key=lambda z: z["cx"])[:3]
    br_sq = sorted(br_sq, key=lambda z: z["cy"])[:2]

    labels: list[str] = []
    flats: list[list[float]] = []

    for i, b in enumerate(bars):
        labels.append(f"Bar ({'üst' if i == 0 else 'alt'})")
        flats.append(rect_to_flat(b["xyxy"]))
    for i, b in enumerate(top_sq):
        labels.append(f"Üst kare {i + 1}")
        flats.append(rect_to_flat(b["xyxy"]))
    for i, b in enumerate(br_sq):
        labels.append(f"Sağ alt kare {i + 1}")
        flats.append(rect_to_flat(b["xyxy"]))

    return flats, labels


def main():
    marked = sys.argv[1] if len(sys.argv) > 1 else None
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    if not marked:
        print(
            "Kullanım: python scripts/regen_table_regions_from_marked_png.py "
            "<isaretli.png> [çıktı.json]",
            file=sys.stderr,
        )
        sys.exit(1)

    floor = np.array(Image.open(FLOOR).convert("RGB"))
    ann = np.array(Image.open(marked).convert("RGB"))
    if ann.shape[0] != 768:
        ann = np.array(Image.fromarray(ann).resize((1024, 768), Image.LANCZOS))
    elif ann.shape[1] != 1024:
        ann = np.array(Image.fromarray(ann).resize((1024, 768), Image.LANCZOS))

    mk = marker_mask(floor, ann)

    num, labels, stats, cents = cv2.connectedComponentsWithStats(
        mk, connectivity=8
    )

    items: list[dict] = []

    for i in range(1, num):
        _x, _y, _w, _h, area = stats[i]
        if area < 450:
            continue
        full = np.zeros_like(mk, dtype=np.uint8)
        full[labels == i] = 255
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        full = cv2.morphologyEx(full, cv2.MORPH_CLOSE, k, iterations=3)

        c = largest_contour(full)
        if c is None:
            continue
        x, y, bw, bh = cv2.boundingRect(c)

        gx0 = x + INSET_PX
        gy0 = y + INSET_PX
        gx1 = x + bw - 1 - INSET_PX
        gy1 = y + bh - 1 - INSET_PX

        if gx1 <= gx0 + 4 or gy1 <= gy0 + 4:
            continue

        # Sol bar: sağ oklarla süzülmemiş bileşeni x olarak kırp
        if gx0 <= 118 and gx1 > BAR_CLIP_MAX_X and bh > bw * 1.25:
            gx1 = BAR_CLIP_MAX_X

        xyxy = (gx0, gy0, gx1, gy1)
        tcx = (xyxy[0] + xyxy[2]) / 2
        tcy = (xyxy[1] + xyxy[3]) / 2
        tw = xyxy[2] - xyxy[0]
        th = xyxy[3] - xyxy[1]

        peri = cv2.arcLength(c, True)
        apx = cv2.approxPolyDP(c, 0.035 * peri, True)

        items.append(
            {
                "xyxy": xyxy,
                "cx": tcx,
                "cy": tcy,
                "w": tw,
                "h": th,
                "asp": min(tw, th) / max(tw, th),
                "verts": len(apx),
                "area": float(tw * th),
            }
        )

    flats, lab = classify_and_order(items)

    if len(flats) < 7:
        print(
            "Uyarı: beklenen 7 otomatik bölge (bar2+üst3+sağ2), "
            f"bulunan {len(flats)}. İşaret/plan hizası veya eşiği kontrol et.",
            file=sys.stderr,
        )

    payload = {
        "source": str(Path(marked).resolve()),
        "insetPx": INSET_PX,
        "barClipMaxX": BAR_CLIP_MAX_X,
        "labels": lab,
        "autoRegionsFlat": flats,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Yazıldı: {out_path} ({len(flats)} bölge)")
    for i, (l, f) in enumerate(zip(lab, flats)):
        print(f"  [{i}] {l} -> {f}")


if __name__ == "__main__":
    main()
