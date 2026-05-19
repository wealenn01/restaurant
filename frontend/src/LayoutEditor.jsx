import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./LayoutEditor.css";

function authHeaders() {
  const token = localStorage.getItem("access_token");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function parseError(res) {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((e) => e.msg || JSON.stringify(e)).join("; ");
    }
    return res.statusText || "İstek başarısız";
  } catch {
    return res.statusText || "İstek başarısız";
  }
}

const CANVAS_W = 1024;
const CANVAS_H = 768;
const GRID = 48;
const RESIZE_STEP = GRID / 4;
const ROTATION_STEP = 15;
const DEFAULT_SIZES = {
  table: { width: GRID * 0.9, height: GRID * 0.9 },
  chair: { width: GRID * 0.45, height: GRID * 0.45 },
  wall: { width: GRID * 3, height: GRID * 0.2 },
};

function snap(value, step = GRID) {
  return Math.round(value / step) * step;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function angleFromCenter(point, item) {
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  return Math.atan2(point.y - centerY, point.x - centerX) * (180 / Math.PI);
}

export function LayoutEditor({ api }) {
  const [floors, setFloors] = useState([]);
  const [floorId, setFloorId] = useState(null);
  const [newFloorName, setNewFloorName] = useState("");
  const [editingFloorName, setEditingFloorName] = useState("");
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [rotateDrag, setRotateDrag] = useState(null);
  const [resizeDrag, setResizeDrag] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [clipboardItem, setClipboardItem] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const canvasRef = useRef(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );
  const selectedFloor = useMemo(
    () => floors.find((floor) => floor.id === floorId) || null,
    [floors, floorId]
  );
  const duplicateTableIds = useMemo(() => {
    const byNumber = new Map();
    items.forEach((item) => {
      const number = item.type === "table" ? Number(item.table?.number) : 0;
      if (!number) return;
      const ids = byNumber.get(number) || [];
      ids.push(item.id);
      byNumber.set(number, ids);
    });

    const ids = new Set();
    byNumber.forEach((sameNumberIds) => {
      if (sameNumberIds.length > 1) {
        sameNumberIds.forEach((id) => ids.add(id));
      }
    });
    return ids;
  }, [items]);

  const loadItems = useCallback(
    async (id) => {
      if (!id) return;
      const res = await fetch(`${api}/layout/floors/${id}/items`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseError(res));
      setItems(await res.json());
      setSelectedId(null);
    },
    [api]
  );

  const loadFloors = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`${api}/layout/floors`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await parseError(res));
      const list = await res.json();
      setFloors(list);
      const firstId = list[0]?.id ?? null;
      setFloorId((current) => current || firstId);
      setEditingFloorName((current) => current || list[0]?.name || "");
      if (firstId) await loadItems(firstId);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [api, loadItems]);

  useEffect(() => {
    loadFloors();
  }, [loadFloors]);

  useEffect(() => {
    setDetailOpen(false);
  }, [selectedId]);

  const changeFloor = async (id) => {
    setFloorId(id);
    setEditingFloorName(floors.find((floor) => floor.id === id)?.name || "");
    setErr("");
    try {
      await loadItems(id);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const createFloor = async (e) => {
    e.preventDefault();
    const name = newFloorName.trim();
    if (!name) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const res = await fetch(`${api}/layout/floors`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const created = await res.json();
      setFloors((prev) => [...prev, created].sort((a, b) => a.position - b.position || a.id - b.id));
      setNewFloorName("");
      setFloorId(created.id);
      setEditingFloorName(created.name);
      setItems([]);
      setSelectedId(null);
      setOk("Kat eklendi.");
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  };

  const renameFloor = async () => {
    if (!selectedFloor) return;
    const name = editingFloorName.trim();
    if (!name || name === selectedFloor.name) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const res = await fetch(`${api}/layout/floors/${selectedFloor.id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const updated = await res.json();
      setFloors((prev) => prev.map((floor) => (floor.id === updated.id ? updated : floor)));
      setEditingFloorName(updated.name);
      setOk("Kat adı güncellendi.");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteFloor = async () => {
    if (!selectedFloor) return;
    const first = window.confirm(
      `"${selectedFloor.name}" katı silinecek. Silineceğinden emin misiniz?`
    );
    if (!first) return;
    const second = window.confirm(
      "Bu işlem kattaki tüm masa/sandalye/duvar yerleşimini siler. Gerçekten silinsin mi?"
    );
    if (!second) return;

    setBusy(true);
    setErr("");
    setOk("");
    try {
      const res = await fetch(`${api}/layout/floors/${selectedFloor.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const remaining = floors.filter((floor) => floor.id !== selectedFloor.id);
      setFloors(remaining);
      const next = remaining[0] || null;
      setFloorId(next?.id ?? null);
      setEditingFloorName(next?.name || "");
      setItems([]);
      setSelectedId(null);
      if (next) await loadItems(next.id);
      setOk("Kat silindi.");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const createItem = async (type) => {
    if (!floorId) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const isTable = type === "table";
      const isWall = type === "wall";
      const defaults = DEFAULT_SIZES[type] || DEFAULT_SIZES.chair;
      const body = {
        floor_id: floorId,
        type,
        x: isTable ? GRID * 2 : isWall ? GRID * 5 : GRID * 3,
        y: isTable ? GRID * 2 : isWall ? GRID * 4 : GRID * 3,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        label: isTable ? null : isWall ? "Duvar" : "Sandalye",
      };
      const res = await fetch(`${api}/layout/items`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const created = await res.json();
      setItems((prev) => [...prev, created]);
      setSelectedId(created.id);
      setOk(isTable ? "Masa eklendi." : isWall ? "Duvar eklendi." : "Sandalye eklendi.");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const patchItem = async (id, patch) => {
    const res = await fetch(`${api}/layout/items/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const updated = await res.json();
    setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
  };

  const updateSelected = async (patch) => {
    if (!selectedItem) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await patchItem(selectedItem.id, patch);
      setOk("Düzen kaydedildi.");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = useCallback(async () => {
    if (!selectedItem) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const res = await fetch(`${api}/layout/items/${selectedItem.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseError(res));
      setItems((prev) => prev.filter((item) => item.id !== selectedItem.id));
      setSelectedId(null);
      setOk("Obje silindi.");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [api, selectedItem]);

  const copySelected = useCallback(() => {
    if (!selectedItem) return;
    setClipboardItem({
      type: selectedItem.type,
      x: selectedItem.x,
      y: selectedItem.y,
      width: selectedItem.width,
      height: selectedItem.height,
      rotation: selectedItem.rotation || 0,
      label: selectedItem.label,
    });
    setOk("Obje kopyalandı.");
    setErr("");
  }, [selectedItem]);

  const pasteCopied = useCallback(async () => {
    if (!clipboardItem || !floorId) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const isTable = clipboardItem.type === "table";
      const body = {
        floor_id: floorId,
        type: clipboardItem.type,
        x: clamp(snap(clipboardItem.x + GRID), 0, CANVAS_W - clipboardItem.width),
        y: clamp(snap(clipboardItem.y + GRID), 0, CANVAS_H - clipboardItem.height),
        width: clipboardItem.width,
        height: clipboardItem.height,
        rotation: clipboardItem.rotation || 0,
        label: isTable ? null : clipboardItem.label,
      };
      const res = await fetch(`${api}/layout/items`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const created = await res.json();
      setItems((prev) => [...prev, created]);
      setSelectedId(created.id);
      setClipboardItem({ ...body });
      setOk("Obje yapıştırıldı.");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [api, clipboardItem, floorId]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (typing) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteCopied();
      }
      if (e.key === "Delete") {
        e.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelected, deleteSelected, pasteCopied]);

  const canvasPoint = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const onPointerDown = (e, item) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = canvasPoint(e);
    setSelectedId(item.id);
    setDrag({
      id: item.id,
      dx: point.x - item.x,
      dy: point.y - item.y,
    });
  };

  const onRotatePointerDown = (e, item) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = canvasPoint(e);
    setSelectedId(item.id);
    setRotateDrag({
      id: item.id,
      startAngle: angleFromCenter(point, item),
      startRotation: item.rotation || 0,
    });
  };

  const onResizePointerDown = (e, item, side) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = canvasPoint(e);
    setSelectedId(item.id);
    setResizeDrag({
      id: item.id,
      side,
      startPointerX: point.x,
      startPointerY: point.y,
      startX: item.x,
      startY: item.y,
      startCenterX: item.x + item.width / 2,
      startCenterY: item.y + item.height / 2,
      startWidth: item.width,
      startHeight: item.height,
      startRotation: item.rotation || 0,
    });
  };

  const onPointerMove = (e) => {
    if (rotateDrag) {
      const point = canvasPoint(e);
      const item = items.find((x) => x.id === rotateDrag.id);
      if (!item) return;
      const angle = angleFromCenter(point, item);
      const delta = angle - rotateDrag.startAngle;
      const normalized = (snap(rotateDrag.startRotation + delta, ROTATION_STEP) + 360) % 360;
      setItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, rotation: normalized } : x))
      );
      return;
    }

    if (resizeDrag) {
      const point = canvasPoint(e);
      const item = items.find((x) => x.id === resizeDrag.id);
      if (!item) return;
      const minSize = RESIZE_STEP;
      const deltaX = point.x - resizeDrag.startPointerX;
      const deltaY = point.y - resizeDrag.startPointerY;
      const angle = (resizeDrag.startRotation * Math.PI) / 180;
      const axisX = { x: Math.cos(angle), y: Math.sin(angle) };
      const axisY = { x: -Math.sin(angle), y: Math.cos(angle) };
      const localDeltaX = deltaX * axisX.x + deltaY * axisX.y;
      const localDeltaY = deltaX * axisY.x + deltaY * axisY.y;
      const snappedLocalDeltaX = snap(localDeltaX, RESIZE_STEP);
      const snappedLocalDeltaY = snap(localDeltaY, RESIZE_STEP);
      let nextCenterX = resizeDrag.startCenterX;
      let nextCenterY = resizeDrag.startCenterY;
      let nextWidth = resizeDrag.startWidth;
      let nextHeight = resizeDrag.startHeight;

      if (resizeDrag.side === "left") {
        nextWidth = clamp(resizeDrag.startWidth - snappedLocalDeltaX, minSize, CANVAS_W);
        const centerShift = (resizeDrag.startWidth - nextWidth) / 2;
        nextCenterX = resizeDrag.startCenterX + axisX.x * centerShift;
        nextCenterY = resizeDrag.startCenterY + axisX.y * centerShift;
      }

      if (resizeDrag.side === "right") {
        nextWidth = clamp(resizeDrag.startWidth + snappedLocalDeltaX, minSize, CANVAS_W);
        const centerShift = (nextWidth - resizeDrag.startWidth) / 2;
        nextCenterX = resizeDrag.startCenterX + axisX.x * centerShift;
        nextCenterY = resizeDrag.startCenterY + axisX.y * centerShift;
      }

      if (resizeDrag.side === "top") {
        nextHeight = clamp(resizeDrag.startHeight - snappedLocalDeltaY, minSize, CANVAS_H);
        const centerShift = (resizeDrag.startHeight - nextHeight) / 2;
        nextCenterX = resizeDrag.startCenterX + axisY.x * centerShift;
        nextCenterY = resizeDrag.startCenterY + axisY.y * centerShift;
      }

      if (resizeDrag.side === "bottom") {
        nextHeight = clamp(resizeDrag.startHeight + snappedLocalDeltaY, minSize, CANVAS_H);
        const centerShift = (nextHeight - resizeDrag.startHeight) / 2;
        nextCenterX = resizeDrag.startCenterX + axisY.x * centerShift;
        nextCenterY = resizeDrag.startCenterY + axisY.y * centerShift;
      }

      const nextX = clamp(nextCenterX - nextWidth / 2, 0, CANVAS_W - nextWidth);
      const nextY = clamp(nextCenterY - nextHeight / 2, 0, CANVAS_H - nextHeight);

      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? { ...x, x: nextX, y: nextY, width: nextWidth, height: nextHeight }
            : x
        )
      );
      return;
    }

    if (!drag) return;
    const point = canvasPoint(e);
    const dragged = items.find((item) => item.id === drag.id);
    if (!dragged) return;
    const rawX = point.x - drag.dx;
    const rawY = point.y - drag.dy;
    const nextX = clamp(dragged.type === "chair" ? rawX : snap(rawX), 0, CANVAS_W - dragged.width);
    const nextY = clamp(dragged.type === "chair" ? rawY : snap(rawY), 0, CANVAS_H - dragged.height);
    setItems((prev) =>
      prev.map((item) => (item.id === drag.id ? { ...item, x: nextX, y: nextY } : item))
    );
  };

  const onPointerUp = async () => {
    if (resizeDrag) {
      const resized = items.find((item) => item.id === resizeDrag.id);
      setResizeDrag(null);
      if (!resized) return;
      try {
        await patchItem(resized.id, {
          x: resized.x,
          y: resized.y,
          width: resized.width,
          height: resized.height,
        });
      } catch (e) {
        setErr(e.message || String(e));
      }
      return;
    }

    if (rotateDrag) {
      const rotated = items.find((item) => item.id === rotateDrag.id);
      setRotateDrag(null);
      if (!rotated) return;
      try {
        await patchItem(rotated.id, { rotation: rotated.rotation || 0 });
      } catch (e) {
        setErr(e.message || String(e));
      }
      return;
    }

    if (!drag) return;
    const dragged = items.find((item) => item.id === drag.id);
    setDrag(null);
    if (!dragged) return;
    try {
      await patchItem(dragged.id, { x: dragged.x, y: dragged.y });
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <section className="layout-editor">
      <div className="layout-editor__top">
        <div>
          <h2>Restaurant düzenle</h2>
          <p>Boş plana masa ve sandalye objelerini ekleyip sürükleyerek yerleştirin.</p>
        </div>
        <div className="layout-floor-tools">
          <select
            value={floorId ?? ""}
            onChange={(e) => changeFloor(Number(e.target.value))}
            disabled={busy || floors.length === 0}
          >
            <option value="" disabled>
              Kat seç
            </option>
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name}
              </option>
            ))}
          </select>
          <form onSubmit={createFloor} className="layout-floor-tools__add">
            <input
              value={newFloorName}
              onChange={(e) => setNewFloorName(e.target.value)}
              placeholder="Yeni kat adı"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !newFloorName.trim()}>
              Kat ekle
            </button>
          </form>
        </div>
      </div>

      <div className="layout-editor__messages" aria-live="polite">
        {err ? <div className="layout-editor__msg layout-editor__msg--err">{err}</div> : null}
        {!err && ok ? <div className="layout-editor__msg layout-editor__msg--ok">{ok}</div> : null}
      </div>

      <div className="layout-editor__body">
        <div className="layout-canvas-viewport">
          <div
            ref={canvasRef}
            className="layout-canvas"
            style={{ width: `${zoom * 100}%` }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  "layout-object" +
                  ` layout-object--${item.type}` +
                  (duplicateTableIds.has(item.id) ? " layout-object--number-conflict" : "") +
                  (selectedId === item.id ? " layout-object--selected" : "")
                }
                style={{
                  left: `${(item.x / CANVAS_W) * 100}%`,
                  top: `${(item.y / CANVAS_H) * 100}%`,
                  width: `${(item.width / CANVAS_W) * 100}%`,
                  height: `${(item.height / CANVAS_H) * 100}%`,
                  transform: `rotate(${item.rotation || 0}deg)`,
                }}
                onPointerDown={(e) => onPointerDown(e, item)}
                onClick={() => setSelectedId(item.id)}
              >
                {item.type === "table" ? item.table?.number ?? item.label : item.type === "wall" ? "" : ""}
                {selectedId === item.id ? (
                  <>
                    <span
                      className="layout-rotate-handle"
                      onPointerDown={(e) => onRotatePointerDown(e, item)}
                      title="Basılı tutup döndür"
                    />
                    {["top", "right", "bottom", "left"].map((side) => (
                      <span
                        key={side}
                        className={`layout-resize-handle layout-resize-handle--${side}`}
                        onPointerDown={(e) => onResizePointerDown(e, item, side)}
                        title="Basılı tutup büyüt/küçült"
                      />
                    ))}
                  </>
                ) : null}
              </button>
            ))}
          </div>
          <div className="layout-zoom-controls" aria-label="Harita yakınlaştırma">
            <span className="layout-zoom-icon" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
            >
              -
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
            >
              +
            </button>
          </div>
        </div>

        <aside className="layout-palette">
          <div className="layout-floor-rename">
            <h3>Kat adı</h3>
            {!selectedFloor ? (
              <p>Önce kat ekleyin veya seçin.</p>
            ) : (
              <>
                <input
                  value={editingFloorName}
                  onChange={(e) => setEditingFloorName(e.target.value)}
                  onBlur={renameFloor}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={renameFloor}
                  disabled={busy || !editingFloorName.trim() || editingFloorName === selectedFloor.name}
                >
                  İsmi kaydet
                </button>
                <button
                  type="button"
                  className="layout-palette__danger"
                  onClick={deleteFloor}
                  disabled={busy}
                >
                  Katı sil
                </button>
              </>
            )}
          </div>

          <h3>Objeler</h3>
          <button type="button" onClick={() => createItem("table")} disabled={busy || !floorId}>
            Masa ekle
          </button>
          <button type="button" onClick={() => createItem("chair")} disabled={busy || !floorId}>
            Sandalye ekle
          </button>
          <button type="button" onClick={() => createItem("wall")} disabled={busy || !floorId}>
            Duvar ekle
          </button>
          <p className="layout-shortcuts">
            Kısayollar: Ctrl+C kopyala, Ctrl+V yapıştır, Delete sil.
          </p>

          <div className="layout-palette__detail">
            <h3>Seçili obje</h3>
            {!selectedItem ? (
              <p>Bir masa veya sandalye seçin.</p>
            ) : (
              <>
                <div className="layout-detail-summary">
                  <span>{selectedItem.type === "table" ? "Masa" : selectedItem.type === "wall" ? "Duvar" : "Sandalye"}</span>
                  <small>
                    X {Math.round(selectedItem.x)} · Y {Math.round(selectedItem.y)}
                  </small>
                </div>
                <button type="button" onClick={() => setDetailOpen((value) => !value)}>
                  {detailOpen ? "Düzenlemeyi kapat" : "Düzenle"}
                </button>
                {detailOpen ? (
                  <>
                    {selectedItem.type === "table" ? (
                      <>
                        <label>
                          Masa numarası
                          <input
                            type="number"
                            min="1"
                            value={selectedItem.table?.number ?? ""}
                            onChange={(e) => {
                              const nextNumber = Number(e.target.value) || "";
                              setItems((prev) =>
                                prev.map((item) =>
                                  item.id === selectedItem.id
                                    ? {
                                        ...item,
                                        label: nextNumber ? `Masa ${nextNumber}` : item.label,
                                        table: item.table
                                          ? { ...item.table, number: nextNumber }
                                          : item.table,
                                      }
                                    : item
                                )
                              );
                              setErr("");
                              setOk("");
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const nextNumber = Number(selectedItem.table?.number);
                            if (!nextNumber) {
                              setErr("Masa numarası boş olamaz.");
                              setOk("");
                              return;
                            }
                            if (duplicateTableIds.has(selectedItem.id)) {
                              setErr("Bu masa numarası başka bir masada kullanılıyor.");
                              setOk("");
                              return;
                            }
                            updateSelected({
                              table_number: nextNumber,
                              label: `Masa ${nextNumber}`,
                            });
                          }}
                          disabled={busy}
                        >
                          Masa numarasını kaydet
                        </button>
                      </>
                    ) : null}
                    <label>
                      Etiket
                      <input
                        value={selectedItem.label || ""}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((item) =>
                              item.id === selectedItem.id ? { ...item, label: e.target.value } : item
                            )
                          )
                        }
                        onBlur={(e) => updateSelected({ label: e.target.value })}
                      />
                    </label>
                    <label>
                      X koordinatı
                      <input
                        type="number"
                        value={Math.round(selectedItem.x)}
                        onChange={(e) =>
                          updateSelected({
                            x: clamp(Number(e.target.value) || 0, 0, CANVAS_W - selectedItem.width),
                          })
                        }
                      />
                    </label>
                    <label>
                      Y koordinatı
                      <input
                        type="number"
                        value={Math.round(selectedItem.y)}
                        onChange={(e) =>
                          updateSelected({
                            y: clamp(Number(e.target.value) || 0, 0, CANVAS_H - selectedItem.height),
                          })
                        }
                      />
                    </label>
                    <label>
                      Genişlik
                      <input
                        type="number"
                        value={Math.round(selectedItem.width)}
                        onChange={(e) =>
                          updateSelected({
                            width: clamp(Number(e.target.value) || RESIZE_STEP, RESIZE_STEP, CANVAS_W - selectedItem.x),
                          })
                        }
                      />
                    </label>
                    <label>
                      Yükseklik
                      <input
                        type="number"
                        value={Math.round(selectedItem.height)}
                        onChange={(e) =>
                          updateSelected({
                            height: clamp(Number(e.target.value) || RESIZE_STEP, RESIZE_STEP, CANVAS_H - selectedItem.y),
                          })
                        }
                      />
                    </label>
                    <label>
                      Döndür
                      <input
                        type="number"
                        value={Math.round(selectedItem.rotation || 0)}
                        onChange={(e) => updateSelected({ rotation: Number(e.target.value) || 0 })}
                      />
                    </label>
                  </>
                ) : null}
                <button type="button" className="layout-palette__danger" onClick={deleteSelected}>
                  Sil
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
