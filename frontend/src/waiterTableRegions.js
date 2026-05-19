import { CHAIR_POLYGONS } from "./waiterChairPolygons.gen";
import autoSpec from "./waiterRegions.auto.json";

/** @param {readonly string[]} keys */
function bboxOfKeys(keys) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k of keys) {
    const flat = CHAIR_POLYGONS[k];
    if (!flat) continue;
    for (let i = 0; i < flat.length; i += 2) {
      minX = Math.min(minX, flat[i]);
      minY = Math.min(minY, flat[i + 1]);
      maxX = Math.max(maxX, flat[i]);
      maxY = Math.max(maxY, flat[i + 1]);
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

function rectCorners(b) {
  const { minX, minY, maxX, maxY } = b;
  return [minX, minY, maxX, minY, maxX, maxY, minX, maxY];
}

/**
 * Sağ alttaki iki masa: merkezden küçült + tüm y’leri dy kadar aşağı (ekran koordinatı).
 */
function shrinkShiftRectFlat(flat, factor, dy) {
  const xs = [flat[0], flat[2], flat[4], flat[6]];
  const ys = [flat[1], flat[3], flat[5], flat[7]];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const hw = ((maxX - minX) * factor) / 2;
  const hh = ((maxY - minY) * factor) / 2;
  return Object.freeze(
    rectCorners({
      minX: Math.round(cx - hw),
      maxX: Math.round(cx + hw),
      minY: Math.round(cy - hh + dy),
      maxY: Math.round(cy + hh + dy),
    })
  );
}

function loungeSideTableBetween(
  leftKey,
  rightKey,
  gapWidthFrac = 0.44,
  heightOverWidth = 1.05,
  padPx = 2
) {
  const L = bboxOfKeys([leftKey]);
  const R = bboxOfKeys([rightKey]);
  if (!L || !R) return [0, 0, 1, 0, 1, 1, 0, 1];
  const gapLeft = L.maxX;
  const gapRight = R.minX;
  const gw = (gapRight - gapLeft) * gapWidthFrac;
  const gx = (gapLeft + gapRight) / 2;
  const yTop = Math.max(L.minY, R.minY);
  const yBot = Math.min(L.maxY, R.maxY);
  const gy = (yTop + yBot) / 2;
  const gh = gw * heightOverWidth;
  return rectCorners({
    minX: gx - gw / 2 - padPx,
    maxX: gx + gw / 2 + padPx,
    minY: gy - gh / 2 - padPx,
    maxY: gy + gh / 2 + padPx,
  });
}

/** @param {readonly number[]} flat */
function freezeFlat(flat) {
  return Object.freeze(flat.map((n) => n));
}

/** @param {readonly number[]} flat */
function centroid(flat) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < flat.length; i += 2) {
    sx += flat[i];
    sy += flat[i + 1];
    n++;
  }
  return { x: sx / n, y: sy / n };
}

/**
 * 45° dönmüş kare masa — elmas poligon (önceki dengeli dolgu).
 */
function diamondTable(prefix, pullIn = 0.18, outwardScale = 1.32) {
  const cnw = centroid(CHAIR_POLYGONS[`${prefix}-nw`]);
  const cne = centroid(CHAIR_POLYGONS[`${prefix}-ne`]);
  const cse = centroid(CHAIR_POLYGONS[`${prefix}-se`]);
  const csw = centroid(CHAIR_POLYGONS[`${prefix}-sw`]);
  const center = {
    x: (cnw.x + cne.x + cse.x + csw.x) / 4,
    y: (cnw.y + cne.y + cse.y + csw.y) / 4,
  };
  const toward = (edgeMid) => ({
    x: edgeMid.x + (center.x - edgeMid.x) * pullIn,
    y: edgeMid.y + (center.y - edgeMid.y) * pullIn,
  });
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const vn = toward(mid(cnw, cne));
  const ve = toward(mid(cne, cse));
  const vs = toward(mid(cse, csw));
  const vw = toward(mid(csw, cnw));
  const raw = [vn.x, vn.y, ve.x, ve.y, vs.x, vs.y, vw.x, vw.y];
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    const x = raw[i];
    const y = raw[i + 1];
    out.push(
      center.x + (x - center.x) * outwardScale,
      center.y + (y - center.y) * outwardScale
    );
  }
  return Object.freeze(out);
}

/** OpenCV çıktısı — bar ve sağ-alt kutular; üst 3 elmas kodda */
const A = autoSpec.autoRegionsFlat;

export const WAITER_TABLE_REGIONS = Object.freeze([
  { label: "Sol bar / uzun masa (üst)", polygonFlat: freezeFlat(A[0]) },
  { label: "Sol bar / uzun masa (alt)", polygonFlat: freezeFlat(A[1]) },
  { label: "Üst sıra masa 1", polygonFlat: diamondTable("m1", 0.18, 1.32) },
  { label: "Üst sıra masa 2", polygonFlat: diamondTable("m2", 0.18, 1.32) },
  { label: "Üst sıra masa 3", polygonFlat: diamondTable("m3", 0.18, 1.32) },
  {
    label: "Alt lounge sehpası (sol çift)",
    polygonFlat: Object.freeze(
      loungeSideTableBetween("lounge-1", "lounge-2", 0.44, 1.05, 2)
    ),
  },
  {
    label: "Alt lounge sehpası (sağ çift)",
    polygonFlat: Object.freeze(
      loungeSideTableBetween("lounge-3", "lounge-4", 0.44, 1.05, 2)
    ),
  },
  {
    label: "Sağ alt küçük masa (üst)",
    polygonFlat: shrinkShiftRectFlat(A[5], 0.88, 14),
  },
  {
    label: "Sağ alt küçük masa (alt)",
    polygonFlat: shrinkShiftRectFlat(A[6], 0.88, 12),
  },
]);

export function polygonPointsAttr(flat) {
  const parts = [];
  for (let i = 0; i < flat.length; i += 2) {
    parts.push(`${flat[i]},${flat[i + 1]}`);
  }
  return parts.join(" ");
}
