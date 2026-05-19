import { CHAIR_POLYGONS } from "./waiterChairPolygons.gen.js";

const LABEL = {
  "bar-1": "Bar 1",
  "bar-2": "Bar 2",
  "bar-3": "Bar 3",
  "bar-4": "Bar 4",
  "bar-5": "Bar 5",
  "bar-6": "Bar 6",
  "m1-nw": "Orta masa 1 kuzeybatı",
  "m1-ne": "Orta masa 1 kuzeydoğu",
  "m1-se": "Orta masa 1 güneydoğu",
  "m1-sw": "Orta masa 1 güneybatı",
  "m2-nw": "Orta masa 2 kuzeybatı",
  "m2-ne": "Orta masa 2 kuzeydoğu",
  "m2-se": "Orta masa 2 güneydoğu",
  "m2-sw": "Orta masa 2 güneybatı",
  "m3-nw": "Orta masa 3 kuzeybatı",
  "m3-ne": "Orta masa 3 kuzeydoğu",
  "m3-se": "Orta masa 3 güneydoğu",
  "m3-sw": "Orta masa 3 güneybatı",
  "lounge-1": "Köşe 1",
  "lounge-2": "Köşe 2",
  "lounge-3": "Köşe 3",
  "lounge-4": "Köşe 4",
  "rect-L1": "Büyük masa sol üst",
  "rect-L2": "Büyük masa sol alt",
  "rect-R1": "Büyük masa sağ üst",
  "rect-R2": "Büyük masa sağ alt",
};

const IDS_IN_ORDER = [
  "bar-1",
  "bar-2",
  "bar-3",
  "bar-4",
  "bar-5",
  "bar-6",
  "m1-nw",
  "m1-ne",
  "m1-se",
  "m1-sw",
  "m2-nw",
  "m2-ne",
  "m2-se",
  "m2-sw",
  "m3-nw",
  "m3-ne",
  "m3-se",
  "m3-sw",
  "lounge-1",
  "lounge-2",
  "lounge-3",
  "lounge-4",
  "rect-L1",
  "rect-L2",
  "rect-R1",
  "rect-R2",
];

export function polygonPointsAttr(flat) {
  const parts = [];
  for (let i = 0; i < flat.length; i += 2) {
    parts.push(`${flat[i]},${flat[i + 1]}`);
  }
  return parts.join(" ");
}

/** @typedef {{ id: string; label: string; polygonFlat: readonly number[] }} SeatDef */

/** @type {readonly SeatDef[]} */
export const WAITER_SEATS = IDS_IN_ORDER.map((id) => {
  const poly = CHAIR_POLYGONS[id];
  if (!poly) throw new Error(`CHAIR_POLYGONS missing "${id}" — run scripts/_extract_chair_masks.py`);
  return {
    id,
    label: LABEL[id],
    polygonFlat: poly,
  };
});
