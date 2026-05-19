import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WAITER_TABLE_REGIONS,
  polygonPointsAttr as tablePolygonPointsAttr,
} from "./waiterTableRegions";
import "./WaiterFloor.css";

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

const ORDER_TIMER_STORAGE_KEY = "waiter_order_timers_v1";
const DELIVERED_ORDER_STORAGE_KEY = "waiter_delivered_orders_v1";
const ORDER_GRACE_MS = 5 * 60 * 1000;
const ORDER_DUE_MS = 7 * 60 * 1000;
const ORDER_BLINK_MS = 10 * 1000;

function loadStoredOrderTimers() {
  try {
    return JSON.parse(localStorage.getItem(ORDER_TIMER_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadStoredDeliveredOrders() {
  try {
    return JSON.parse(localStorage.getItem(DELIVERED_ORDER_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getOrderTimerInfo(timer, now) {
  if (!timer) return null;

  const remainingMs = timer.dueAt - now;
  const graceMs = timer.graceUntil - now;

  if (remainingMs > 60 * 1000) {
    return {
      stage: graceMs > 0 ? "grace" : "countdown",
      label: `Kalan ${formatDuration(remainingMs)}`,
    };
  }

  if (remainingMs > 0) {
    return {
      stage: "danger",
      label: `Son ${formatDuration(remainingMs)}`,
    };
  }

  return {
    stage: now < timer.blinkUntil ? "blink" : "expired",
    label: "Süre doldu",
  };
}

/** @typedef {{ index: number } | null} SelectedTable */

export function WaiterFloor({ api, selectedTable, onSelectTable, onLogout }) {
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingErr, setPendingErr] = useState("");
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingDeletingId, setPendingDeletingId] = useState(
    /** @type {number | null} */ (null)
  );
  /** Sağ panel: sipariş satırları + menü | sadece tutar özeti */
  const [catalogTab, setCatalogTab] = useState(/** @type {"siparis" | "tutar"} */ ("siparis"));

  const catalogOpen = pendingOpen || Boolean(selectedTable);

  const [tables, setTables] = useState([]);
  const [layoutFloors, setLayoutFloors] = useState([]);
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [layoutItems, setLayoutItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [bootstrapErr, setBootstrapErr] = useState("");

  const [panelErr, setPanelErr] = useState("");
  const [panelOk, setPanelOk] = useState("");
  const [panelBusy, setPanelBusy] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [orderLines, setOrderLines] = useState([]);
  const [savedOrderLines, setSavedOrderLines] = useState([]);
  /** Açık siparişli masa id seti */
  const [busyTableIds, setBusyTableIds] = useState(() => new Set());
  const [busyOrderByTableId, setBusyOrderByTableId] = useState({});
  const [orderTimers, setOrderTimers] = useState(loadStoredOrderTimers);
  const [deliveredOrders, setDeliveredOrders] = useState(loadStoredDeliveredOrders);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem(ORDER_TIMER_STORAGE_KEY, JSON.stringify(orderTimers));
  }, [orderTimers]);

  useEffect(() => {
    localStorage.setItem(DELIVERED_ORDER_STORAGE_KEY, JSON.stringify(deliveredOrders));
  }, [deliveredOrders]);

  const ensureOrderTimer = useCallback((orderId) => {
    const key = String(orderId);
    setOrderTimers((prev) => {
      if (prev[key]) return prev;
      const startedAt = Date.now();
      return {
        ...prev,
        [key]: {
          startedAt,
          graceUntil: startedAt + ORDER_GRACE_MS,
          dueAt: startedAt + ORDER_DUE_MS,
          blinkUntil: startedAt + ORDER_DUE_MS + ORDER_BLINK_MS,
        },
      };
    });
  }, []);

  const clearOrderTimer = useCallback((orderId) => {
    const key = String(orderId);
    setOrderTimers((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const markDelivered = useCallback((orderId) => {
    const key = String(orderId);
    setDeliveredOrders((prev) => ({ ...prev, [key]: true }));
  }, []);

  const clearDelivered = useCallback((orderId) => {
    const key = String(orderId);
    setDeliveredOrders((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => a.number - b.number),
    [tables]
  );

  const tableNumberById = useMemo(() => {
    const m = {};
    sortedTables.forEach((t) => {
      if (t?.id != null) m[t.id] = t.number;
    });
    return m;
  }, [sortedTables]);

  const menuByCategory = useMemo(() => {
    const map = {};
    menuItems.forEach((m) => {
      if (m.is_active === false) return;
      if (m.category_id == null) return;
      if (!map[m.category_id]) map[m.category_id] = [];
      map[m.category_id].push(m);
    });
    return map;
  }, [menuItems]);

  /** Hem admin kategorileri hem menüde geçip API'de olmayan kategori id'leri */
  const pickerCategories = useMemo(() => {
    const seen = new Set(categories.map((c) => c.id));
    const extra = [];
    Object.keys(menuByCategory).forEach((idStr) => {
      const id = Number(idStr);
      if (!seen.has(id)) {
        seen.add(id);
        extra.push({
          id,
          name: `Kategori #${id}`,
          position: 9999,
          is_active: true,
        });
      }
    });
    return [...categories, ...extra].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id
    );
  }, [categories, menuByCategory]);

  const flatActiveMenus = useMemo(() => {
    return menuItems
      .filter((m) => m.is_active !== false && m.category_id != null)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [menuItems]);

  const dynamicLayoutTables = useMemo(
    () => layoutItems.filter((item) => item.type === "table" && item.table_id),
    [layoutItems]
  );

  const dynamicLayoutDecor = useMemo(
    () => layoutItems.filter((item) => item.type !== "table"),
    [layoutItems]
  );

  const usingDynamicLayout = layoutItems.length > 0;

  const groupedPickerHasRows = pickerCategories.some(
    (cat) => (menuByCategory[cat.id] || []).length > 0
  );

  const menuNameMap = useMemo(() => {
    const m = {};
    menuItems.forEach((item) => {
      m[item.id] = item.name;
    });
    return m;
  }, [menuItems]);

  const hasOrderDraftChanges = useMemo(() => {
    const simplify = (lines) =>
      lines
        .map((l) => ({
          id: l.id,
          menu_item_id: l.menu_item_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    return JSON.stringify(simplify(orderLines)) !== JSON.stringify(simplify(savedOrderLines));
  }, [orderLines, savedOrderLines]);

  /** Veritabanında masa olmasa bile tüm plan alanları çizilir (görünürlük için) */
  const visibleTableRegions = useMemo(
    () =>
      WAITER_TABLE_REGIONS.map((reg, idx) => ({
        ...reg,
        index: idx,
        dbTable: sortedTables[idx] ?? null,
      })),
    [sortedTables]
  );

  const loadLayoutItems = useCallback(
    async (floorId) => {
      if (!floorId) {
        setLayoutItems([]);
        return;
      }
      const res = await fetch(`${api}/layout/floors/${floorId}/items`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseError(res));
      setLayoutItems(await res.json());
    },
    [api]
  );

  /** Turuncu «meşgul» yalnızca menüden en az 1 satır eklenmiş açık siparişte */
  const refreshOccupiedTables = useCallback(async () => {
    if (!sortedTables.length) return;
    try {
      const res = await fetch(`${api}/orders/?status=open`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const orders = await res.json();
      const withLines = new Set();
      const orderByTable = {};
      await Promise.all(
        orders.map(async (o) => {
          try {
            const lr = await fetch(`${api}/order_items/?order_id=${o.id}`, {
              headers: authHeaders(),
            });
            if (!lr.ok) return;
            const lines = await lr.json();
            if (Array.isArray(lines) && lines.length > 0) {
              withLines.add(o.table_id);
              if (!orderByTable[o.table_id] || o.id > orderByTable[o.table_id].id) {
                orderByTable[o.table_id] = o;
              }
            }
          } catch {
            /* yoksay */
          }
        })
      );
      setBusyTableIds(withLines);
      setBusyOrderByTableId(orderByTable);
    } catch {
      /* yoksay */
    }
  }, [api, sortedTables.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootstrapErr("");
      try {
        const [tr, cat, mu, fl] = await Promise.all([
          fetch(`${api}/tables/`, { headers: authHeaders() }),
          fetch(`${api}/categories/`, { headers: authHeaders() }),
          fetch(`${api}/menu/items`, { headers: authHeaders() }),
          fetch(`${api}/layout/floors`, { headers: authHeaders() }),
        ]);
        if (!tr.ok) throw new Error(await parseError(tr));
        if (!cat.ok) throw new Error(await parseError(cat));
        if (!mu.ok) throw new Error(await parseError(mu));
        if (!fl.ok) throw new Error(await parseError(fl));
        if (cancelled) return;
        const floorList = await fl.json();
        setTables(await tr.json());
        setCategories(await cat.json());
        setMenuItems(await mu.json());
        setLayoutFloors(floorList);
        const initialFloorId = floorList[0]?.id ?? null;
        setSelectedFloorId((current) => current || initialFloorId);
        if (initialFloorId) await loadLayoutItems(initialFloorId);
      } catch (e) {
        if (!cancelled) setBootstrapErr(e.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, loadLayoutItems]);

  useEffect(() => {
    refreshOccupiedTables();
  }, [refreshOccupiedTables]);

  const changeWaiterFloor = async (floorId) => {
    setSelectedFloorId(floorId);
    onSelectTable(null);
    try {
      await loadLayoutItems(floorId);
    } catch (e) {
      setBootstrapErr(e.message || String(e));
    }
  };

  useEffect(() => {
    if (selectedTable) setCatalogTab("siparis");
  }, [selectedTable]);

  useEffect(() => {
    if (!pendingOpen) return;
    const ac = new AbortController();
    const { signal } = ac;
    (async () => {
      setPendingErr("");
      setPendingBusy(true);
      try {
        const res = await fetch(`${api}/orders/?status=open`, {
          headers: authHeaders(),
          signal,
        });
        if (!res.ok) throw new Error(await parseError(res));
        const list = await res.json();
        if (!signal.aborted) setPendingOrders(list);
      } catch (e) {
        if (signal.aborted || e.name === "AbortError") return;
        setPendingOrders([]);
        setPendingErr(e.message || String(e));
      } finally {
        if (!signal.aborted) setPendingBusy(false);
      }
    })();
    return () => ac.abort();
  }, [pendingOpen, api]);

  const loadOrderLines = useCallback(
    async (orderId) => {
      const res = await fetch(`${api}/order_items/?order_id=${orderId}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const lines = await res.json();
      setOrderLines(lines);
      setSavedOrderLines(lines);
      return lines;
    },
    [api]
  );

  useEffect(() => {
    const idx = selectedTable?.index;
    const tableIdFromSelection = selectedTable?.tableId;
    if (
      !tables.length ||
      (tableIdFromSelection == null && (idx === undefined || idx === null))
    ) {
      setCurrentOrderId(null);
      setOrderLines([]);
      setSavedOrderLines([]);
      setPanelErr("");
      setPanelOk("");
      setPanelBusy(false);
      return;
    }

    const dbTable =
      tableIdFromSelection != null
        ? sortedTables.find((t) => t.id === tableIdFromSelection)
        : sortedTables[idx];
    if (!dbTable?.id) {
      setPanelErr("Bu masa alanı için veritabanında karşılık yok.");
      setPanelOk("");
      setCurrentOrderId(null);
      setOrderLines([]);
      setSavedOrderLines([]);
      return;
    }

    const tableId = dbTable.id;
    const ac = new AbortController();
    const { signal } = ac;

    (async () => {
      setPanelErr("");
      setPanelOk("");
      setPanelBusy(true);
      try {
        const listRes = await fetch(
          `${api}/orders/?table_id=${tableId}&status=open`,
          { headers: authHeaders(), signal }
        );
        if (!listRes.ok) throw new Error(await parseError(listRes));
        const existing = await listRes.json();

        let orderId;
        if (existing.length === 0) {
          const createRes = await fetch(`${api}/orders/`, {
            method: "POST",
            headers: authHeaders(),
            signal,
            body: JSON.stringify({
              table_id: tableId,
              status: "open",
            }),
          });
          if (!createRes.ok) throw new Error(await parseError(createRes));
          const created = await createRes.json();
          orderId = created.id;
        } else {
          orderId = existing.reduce((best, o) => (o.id > best.id ? o : best), existing[0]).id;
        }

        const linesRes = await fetch(`${api}/order_items/?order_id=${orderId}`, {
          headers: authHeaders(),
          signal,
        });
        if (!linesRes.ok) throw new Error(await parseError(linesRes));
        const lines = await linesRes.json();

        setCurrentOrderId(orderId);
        setOrderLines(lines);
        setSavedOrderLines(lines);
        refreshOccupiedTables();
      } catch (e) {
        if (signal.aborted || e.name === "AbortError") return;
        setCurrentOrderId(null);
        setOrderLines([]);
        setSavedOrderLines([]);
        setPanelErr(e.message || String(e));
        setPanelOk("");
      } finally {
        if (!signal.aborted) setPanelBusy(false);
      }
    })();

    return () => ac.abort();
    // sortedTables tables ile aynı renderda türediği için tables yeterli
  }, [selectedTable, api, tables, sortedTables, refreshOccupiedTables]);

  const addMenuItemToOrder = (menuItem) => {
    if (!currentOrderId) return;
    setPanelErr("");
    clearDelivered(currentOrderId);
    setOrderLines((prev) => {
      const same = prev.find((l) => l.menu_item_id === menuItem.id);
      if (same) {
        return prev.map((line) =>
          line.id === same.id ? { ...line, quantity: Number(line.quantity) + 1 } : line
        );
      }

      return [
        ...prev,
        {
          id: `draft-${menuItem.id}`,
          order_id: currentOrderId,
          menu_item_id: menuItem.id,
          quantity: 1,
          unit_price: Number(menuItem.price),
        },
      ];
    });
  };

  const removeLine = (lineId) => {
    if (!currentOrderId) return;
    setPanelErr("");
    clearDelivered(currentOrderId);
    setOrderLines((prev) => prev.filter((line) => line.id !== lineId));
  };

  const saveOrderDraft = async () => {
    if (!currentOrderId || !hasOrderDraftChanges) return;
    setPanelBusy(true);
    setPanelErr("");
    try {
      const draftIds = new Set(
        orderLines
          .filter((line) => typeof line.id === "number")
          .map((line) => line.id)
      );
      const savedById = new Map(savedOrderLines.map((line) => [line.id, line]));

      for (const savedLine of savedOrderLines) {
        if (!draftIds.has(savedLine.id)) {
          const res = await fetch(`${api}/order_items/${savedLine.id}`, {
            method: "DELETE",
            headers: authHeaders(),
          });
          if (!res.ok) throw new Error(await parseError(res));
        }
      }

      for (const line of orderLines) {
        const isSaved = typeof line.id === "number";
        if (isSaved) {
          const original = savedById.get(line.id);
          if (
            !original ||
            Number(original.quantity) !== Number(line.quantity) ||
            Number(original.unit_price) !== Number(line.unit_price)
          ) {
            const res = await fetch(`${api}/order_items/${line.id}`, {
              method: "PUT",
              headers: authHeaders(),
              body: JSON.stringify({
                quantity: Number(line.quantity),
                unit_price: Number(line.unit_price),
              }),
            });
            if (!res.ok) throw new Error(await parseError(res));
          }
        } else {
          const res = await fetch(`${api}/order_items/`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              order_id: currentOrderId,
              menu_item_id: line.menu_item_id,
              quantity: Number(line.quantity),
              unit_price: Number(line.unit_price),
            }),
          });
          if (!res.ok) throw new Error(await parseError(res));
        }
      }

      const lines = await loadOrderLines(currentOrderId);
      if (lines.length > 0) ensureOrderTimer(currentOrderId);
      else clearOrderTimer(currentOrderId);
      await refreshOccupiedTables();
    } catch (e) {
      setPanelErr(e.message || String(e));
    } finally {
      setPanelBusy(false);
    }
  };

  const lineTotal = orderLines.reduce(
    (acc, l) => acc + Number(l.quantity) * Number(l.unit_price),
    0
  );

  const headerSubtitle = (() => {
    if (!selectedTable) return "—";
    if (selectedTable.tableId != null) {
      const layoutItem = layoutItems.find((item) => item.id === selectedTable.layoutItemId);
      const table = sortedTables.find((t) => t.id === selectedTable.tableId);
      if (!table) return "Seçili masa";
      return `Masa ${table.number} — ${layoutItem?.label || "Dinamik plan"}`;
    }
    const reg = WAITER_TABLE_REGIONS[selectedTable.index];
    const t = sortedTables[selectedTable.index];
    if (!reg) return "—";
    if (!t?.id) return `${reg.label} (veritabanında bu sıra için masa yok)`;
    return `Masa ${t.number} — ${reg.label}`;
  })();

  const catalogTitle = pendingOpen ? "Bekleyen siparişler" : "Masa siparişi";
  const currentTimerInfo = getOrderTimerInfo(
    currentOrderId != null ? orderTimers[String(currentOrderId)] : null,
    now
  );
  const currentOrderDelivered =
    currentOrderId != null && Boolean(deliveredOrders[String(currentOrderId)]);
  const catalogSub = pendingOpen
    ? "Masa seçmeden tüm açık siparişler"
    : selectedTable && orderLines.length > 0
      ? `${headerSubtitle} · ${
          hasOrderDraftChanges ? "Kaydedilmedi" : currentTimerInfo?.label ?? "Ödeme bekleniyor"
        }`
      : headerSubtitle;

  const openTableByOrder = (order) => {
    const layoutItem = dynamicLayoutTables.find((item) => item.table_id === order.table_id);
    if (layoutItem) {
      setPendingOpen(false);
      onSelectTable({ layoutItemId: layoutItem.id, tableId: layoutItem.table_id });
      return;
    }
    const idx = sortedTables.findIndex((t) => t.id === order.table_id);
    if (idx < 0) return;
    setPendingOpen(false);
    onSelectTable({ index: idx });
  };

  const deletePendingOrder = async (orderId) => {
    if (!window.confirm(`Sipariş #${orderId} silinsin mi?`)) return;
    setPendingDeletingId(orderId);
    setPendingErr("");
    try {
      const res = await fetch(`${api}/orders/${orderId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseError(res));
      clearOrderTimer(orderId);
      clearDelivered(orderId);
      setPendingOrders((prev) => prev.filter((x) => x.id !== orderId));
      if (currentOrderId === orderId) {
        setCurrentOrderId(null);
        setOrderLines([]);
        setSavedOrderLines([]);
        setPanelErr("");
        setPanelOk("");
      }
      await refreshOccupiedTables();
    } catch (e) {
      setPendingErr(e.message || String(e));
    } finally {
      setPendingDeletingId(null);
    }
  };

  const markOrderDelivered = (orderId) => {
    if (!orderId) return;
    clearOrderTimer(orderId);
    markDelivered(orderId);
    setPanelErr("");
    setPanelOk("Yemek getirildi; sayaç kapandı.");
    setPendingErr("");
  };

  const closeOrderAfterPayment = async (method) => {
    if (!currentOrderId || lineTotal <= 0) return;
    if (hasOrderDraftChanges) {
      setPanelErr("Ödeme almadan önce siparişi kaydedin.");
      return;
    }
    if (!currentOrderDelivered) {
      setPanelErr("Ödeme almadan önce yemek için Getirildi butonuna basın.");
      return;
    }

    const label = method === "card" ? "Kart" : "Nakit";
    if (!window.confirm(`${label} ödeme alındı mı? Sipariş ödeme bekleyenlerden kapatılacak.`)) {
      return;
    }

    setPanelBusy(true);
    setPanelErr("");
    setPanelOk("");
    try {
      const payRes = await fetch(`${api}/payments/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          order_id: currentOrderId,
          amount: Number(lineTotal.toFixed(2)),
          method,
          status: "paid",
        }),
      });
      if (!payRes.ok) throw new Error(await parseError(payRes));

      const orderRes = await fetch(`${api}/orders/${currentOrderId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ status: "paid" }),
      });
      if (!orderRes.ok) throw new Error(await parseError(orderRes));

      clearOrderTimer(currentOrderId);
      clearDelivered(currentOrderId);
      setPanelOk(`${label} ödeme kaydedildi.`);
      setCurrentOrderId(null);
      setOrderLines([]);
      setSavedOrderLines([]);
      onSelectTable(null);
      await refreshOccupiedTables();
    } catch (e) {
      setPanelErr(e.message || String(e));
    } finally {
      setPanelBusy(false);
    }
  };

  return (
    <div className="waiter-app-shell">
      <div className="waiter-root">
        <header className="waiter-toolbar">
          <h1>Salon — garson görünümü</h1>
          <div className="waiter-toolbar-actions">
            {layoutFloors.length > 0 ? (
              <select
                className="waiter-floor-select"
                value={selectedFloorId ?? ""}
                onChange={(e) => changeWaiterFloor(Number(e.target.value))}
              >
                {layoutFloors.map((floor) => (
                  <option key={floor.id} value={floor.id}>
                    {floor.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button type="button" className="toolbar-btn" onClick={onLogout}>
              Çıkış
            </button>
          </div>
        </header>

        {bootstrapErr ? (
          <div className="waiter-banner waiter-banner--err">{bootstrapErr}</div>
        ) : null}

        {!bootstrapErr && !usingDynamicLayout && sortedTables.length < WAITER_TABLE_REGIONS.length ? (
          <div className="waiter-banner waiter-banner--info">
            Planda {WAITER_TABLE_REGIONS.length} masa alanı var. Veritabanında sıralı{" "}
            <strong>number</strong> ile en az {WAITER_TABLE_REGIONS.length} masa tanımla
            (şu an {sortedTables.length}). Eksik eşlemeler siparişe kapalı görünür.
          </div>
        ) : null}

        <div className="waiter-body">
          <aside className="waiter-side-rail" aria-label="Hızlı işlemler">
            <button
              type="button"
              className={
                "waiter-rail-btn" + (pendingOpen ? " waiter-rail-btn--active" : "")
              }
              onClick={() => {
                setPendingOpen((v) => {
                  const next = !v;
                  if (next) onSelectTable(null);
                  return next;
                });
              }}
            >
              Bekleyen siparişler
            </button>
          </aside>
          <div className="waiter-floor-stage" aria-label="Salon yerleşimi">
            <div className={"waiter-floor-frame" + (usingDynamicLayout ? " waiter-floor-frame--dynamic" : "")}>
              {usingDynamicLayout ? (
                <>
                  {dynamicLayoutDecor.map((item) => (
                    <div
                      key={item.id}
                      className={
                        "waiter-layout-decor" +
                        (item.type === "wall" ? " waiter-layout-decor--wall" : " waiter-layout-decor--chair")
                      }
                      style={{
                        left: `${(item.x / 1024) * 100}%`,
                        top: `${(item.y / 768) * 100}%`,
                        width: `${(item.width / 1024) * 100}%`,
                        height: `${(item.height / 768) * 100}%`,
                        transform: `rotate(${item.rotation || 0}deg)`,
                      }}
                      aria-hidden="true"
                    />
                  ))}
                  {dynamicLayoutTables.map((item) => {
                    const table = item.table;
                    const selected = selectedTable?.layoutItemId === item.id;
                    const busy = item.table_id != null && busyTableIds.has(item.table_id);
                    const busyOrder =
                      item.table_id != null ? busyOrderByTableId[item.table_id] : null;
                    const timerInfo = getOrderTimerInfo(
                      busyOrder ? orderTimers[String(busyOrder.id)] : null,
                      now
                    );
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          "waiter-layout-table" +
                          (selected ? " waiter-layout-table--selected" : "") +
                          (busy ? " waiter-layout-table--busy" : "") +
                          (timerInfo ? ` waiter-layout-table--timer-${timerInfo.stage}` : "")
                        }
                        style={{
                          left: `${(item.x / 1024) * 100}%`,
                          top: `${(item.y / 768) * 100}%`,
                          width: `${(item.width / 1024) * 100}%`,
                          height: `${(item.height / 768) * 100}%`,
                          transform: `rotate(${item.rotation || 0}deg)`,
                        }}
                        aria-label={`Masa ${table?.number ?? item.table_id}`}
                        onClick={() => {
                          setPendingOpen(false);
                          onSelectTable({ layoutItemId: item.id, tableId: item.table_id });
                        }}
                      >
                        {table?.number ?? item.label}
                      </button>
                    );
                  })}
                </>
              ) : (
                <>
                  <img
                    className="waiter-floor-img"
                    src="/floor-plan.png"
                    alt="Restoran salonu üstten görünüm"
                    width={1024}
                    height={768}
                    draggable={false}
                  />
                  <svg
                    className="waiter-tables-svg"
                    viewBox="0 0 1024 768"
                    preserveAspectRatio="xMidYMid meet"
                    aria-hidden={false}
                  >
                    <title>Masa alanları</title>
                    {visibleTableRegions.map(({ index, label, polygonFlat, dbTable }) => {
                      const selected = selectedTable?.index === index;
                      const busy =
                        dbTable?.id != null && busyTableIds.has(dbTable.id);
                      const busyOrder =
                        dbTable?.id != null ? busyOrderByTableId[dbTable.id] : null;
                      const timerInfo = getOrderTimerInfo(
                        busyOrder ? orderTimers[String(busyOrder.id)] : null,
                        now
                      );
                      const unmapped = !dbTable?.id;
                      const aria =
                        dbTable?.number != null
                          ? `Masa ${dbTable.number}, ${label}${
                              timerInfo ? `, ${timerInfo.label}` : ""
                            }`
                          : label;
                      return (
                        <polygon
                          key={index}
                          className={
                            "table-hit-poly" +
                            (unmapped ? " table-hit-poly--unmapped" : "") +
                            (selected ? " table-hit-poly--selected" : "") +
                            (busy ? " table-hit-poly--busy" : "") +
                            (timerInfo ? ` table-hit-poly--timer-${timerInfo.stage}` : "")
                          }
                          points={tablePolygonPointsAttr(polygonFlat)}
                          tabIndex={0}
                          role="button"
                          aria-label={aria}
                          onClick={() => {
                            setPendingOpen(false);
                            onSelectTable({ index });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setPendingOpen(false);
                              onSelectTable({ index });
                            }
                          }}
                        />
                      );
                    })}
                  </svg>
                </>
              )}
            </div>
          </div>
        </div>

        <aside
          className={
            "order-catalog" + (catalogOpen ? " order-catalog--open" : "")
          }
          aria-hidden={!catalogOpen}
        >
          <header className="order-catalog__head">
            <h2>{catalogTitle}</h2>
            <p className="order-catalog__sub">{catalogSub}</p>
          </header>
          <div className="order-catalog__scroll">
            {pendingOpen ? (
              <>
                {pendingErr ? (
                  <div className="waiter-catalog-msg waiter-catalog-msg--err">
                    {pendingErr}
                  </div>
                ) : null}
                {pendingBusy ? (
                  <p className="waiter-muted" style={{ padding: "16px 18px" }}>
                    Yükleniyor…
                  </p>
                ) : pendingOrders.length === 0 ? (
                  <p className="waiter-muted" style={{ padding: "16px 18px" }}>
                    Açık sipariş yok.
                  </p>
                ) : (
                  <ul className="waiter-pending-list">
                    {pendingOrders.map((o) => {
                      const pendingTimer = getOrderTimerInfo(orderTimers[String(o.id)], now);
                      const pendingDelivered = Boolean(deliveredOrders[String(o.id)]);

                      return (
                        <li key={o.id} className="waiter-pending-row">
                          <div className="waiter-pending-row__meta">
                            Sipariş #{o.id}
                            <span>
                              Masa{" "}
                              {tableNumberById[o.table_id] != null
                                ? tableNumberById[o.table_id]
                                : `id:${o.table_id}`}
                            </span>
                            {pendingTimer ? (
                              <span className={`waiter-pending-timer waiter-pending-timer--${pendingTimer.stage}`}>
                                {pendingTimer.label}
                              </span>
                            ) : null}
                          </div>
                          <div className="waiter-pending-row__actions">
                            <button
                              type="button"
                              className="waiter-pending-done"
                              onClick={() => markOrderDelivered(o.id)}
                              disabled={pendingDelivered || pendingDeletingId != null || pendingBusy}
                              title={
                                pendingDelivered
                                  ? "Yemek getirildi."
                                  : "Yemek getirildi, ödemeyi aç."
                              }
                            >
                              {pendingDelivered ? "Getirildi" : "Getirildi"}
                            </button>
                            <button
                              type="button"
                              className="waiter-pending-open"
                              onClick={() => openTableByOrder(o)}
                              disabled={pendingDeletingId != null}
                            >
                              Aç
                            </button>
                            <button
                              type="button"
                              className="waiter-pending-del"
                              onClick={() => deletePendingOrder(o.id)}
                              disabled={
                                pendingDeletingId != null || pendingBusy
                              }
                            >
                              {pendingDeletingId === o.id ? "…" : "Sil"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <>
                {panelErr ? (
                  <div className="waiter-catalog-msg waiter-catalog-msg--err">{panelErr}</div>
                ) : null}
                {panelOk ? (
                  <div className="waiter-catalog-msg waiter-catalog-msg--ok">{panelOk}</div>
                ) : null}

                {selectedTable ? (
                  <div className="order-catalog-tabs" role="tablist" aria-label="Sekmeler">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={catalogTab === "siparis"}
                      className={
                        catalogTab === "siparis" ? "order-catalog-tabs__btn--active" : ""
                      }
                      onClick={() => setCatalogTab("siparis")}
                    >
                      Sipariş
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={catalogTab === "tutar"}
                      className={
                        catalogTab === "tutar" ? "order-catalog-tabs__btn--active" : ""
                      }
                      onClick={() => setCatalogTab("tutar")}
                    >
                      Tutar
                    </button>
                  </div>
                ) : null}

                {selectedTable && catalogTab === "tutar" ? (
                  <div className="waiter-tutar-panel">
                    <p className="waiter-tutar-panel__hint">Bu masanın açık sipariş özeti</p>
                    <p className="waiter-tutar-panel__amount">{lineTotal.toFixed(2)} ₺</p>
                    {orderLines.length > 0 ? (
                      <ul className="waiter-tutar-lines">
                        {orderLines.map((ln) => {
                          const name = menuNameMap[ln.menu_item_id] ?? `#${ln.menu_item_id}`;
                          const row = Number(ln.quantity) * Number(ln.unit_price);
                          return (
                            <li key={ln.id}>
                              <span>
                                {name} × {ln.quantity}
                              </span>
                              <span>{row.toFixed(2)} ₺</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="waiter-muted">Henüz satır yok.</p>
                    )}
                    <div className="waiter-payment-actions">
                      <div className="waiter-payment-note">
                        Ödeme için önce Sipariş sekmesinde Kaydet, sonra Getirildi gerekli.
                        Nakit ödemeyi staff alır; kart ödemede buradan kayıt kapatılır.
                      </div>
                      <button
                        type="button"
                        className="waiter-pay-btn waiter-pay-btn--cash"
                        onClick={() => closeOrderAfterPayment("cash")}
                        disabled={
                          panelBusy ||
                          hasOrderDraftChanges ||
                          !currentOrderDelivered ||
                          !currentOrderId ||
                          orderLines.length === 0
                        }
                      >
                        Nakit alındı
                      </button>
                      <button
                        type="button"
                        className="waiter-pay-btn waiter-pay-btn--card"
                        onClick={() => closeOrderAfterPayment("card")}
                        disabled={
                          panelBusy ||
                          hasOrderDraftChanges ||
                          !currentOrderDelivered ||
                          !currentOrderId ||
                          orderLines.length === 0
                        }
                      >
                        Kartla öde
                      </button>
                    </div>
                    {hasOrderDraftChanges ? (
                      <p className="waiter-hint waiter-hint-small">
                        Ödeme almadan önce Sipariş sekmesinden değişiklikleri kaydedin.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {selectedTable && catalogTab === "siparis" ? (
                  <>
                    <section className="waiter-section">
                      <h3 className="waiter-section__title">
                        Sipariş
                        {panelBusy ? <span className="waiter-dot-pulse">…</span> : null}
                        {hasOrderDraftChanges ? (
                          <span className="waiter-timer-pill waiter-timer-pill--draft">
                            Kaydedilmedi
                          </span>
                        ) : currentTimerInfo ? (
                          <span className={`waiter-timer-pill waiter-timer-pill--${currentTimerInfo.stage}`}>
                            {currentTimerInfo.label}
                          </span>
                        ) : null}
                      </h3>
                      {panelBusy && !orderLines.length && !panelErr ? (
                        <p className="waiter-muted">Yükleniyor…</p>
                      ) : orderLines.length === 0 ? (
                        <p className="waiter-muted">
                          Aktif ürünlerden seçim yapın (&quot;Ekle&quot;). Menü API&apos;den
                          gelmezse yönetimden kategori/ürün ekleyin.
                        </p>
                      ) : (
                        <>
                          <table className="waiter-order-lines">
                            <thead>
                              <tr>
                                <th>Ürün</th>
                                <th>Adet</th>
                                <th>Tutar</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderLines.map((ln) => {
                                const name =
                                  menuNameMap[ln.menu_item_id] ?? `#${ln.menu_item_id}`;
                                const row = Number(ln.quantity) * Number(ln.unit_price);
                                return (
                                  <tr key={ln.id}>
                                    <td>{name}</td>
                                    <td>{ln.quantity}</td>
                                    <td>{row.toFixed(2)} ₺</td>
                                    <td className="waiter-lines-actions">
                                      <button
                                        type="button"
                                        className="waiter-line-remove"
                                        onClick={() => removeLine(ln.id)}
                                        disabled={panelBusy}
                                      >
                                        Sil
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <p className="waiter-hint waiter-hint-small">
                            Toplam tutar için &quot;Tutar&quot; sekmesine geçin.
                          </p>
                        </>
                      )}
                    </section>

                    <section className="waiter-section waiter-section-picker">
                      <h3 className="waiter-section__title">Ürün seç</h3>
                      {!flatActiveMenus.length ? (
                        <p className="waiter-muted">
                          Aktif menü ürünü yok. Yönetim panelinden ekleyin (&quot;Menüde
                          satışta&quot; açık olmalı).
                        </p>
                      ) : null}

                      {groupedPickerHasRows
                        ? pickerCategories.map((cat) => {
                            const items = menuByCategory[cat.id] || [];
                            if (!items.length) return null;
                            return (
                              <details key={cat.id} className="waiter-cat-acc" open>
                                <summary className="waiter-cat-acc__sum">{cat.name}</summary>
                                <ul className="waiter-menu-list">
                                  {items.map((item) => (
                                    <li key={item.id} className="waiter-menu-list__item">
                                      <div className="waiter-menu-line">
                                        <span className="waiter-menu-line__name">
                                          {item.name}
                                        </span>
                                        <span className="waiter-menu-line__price">
                                          {Number(item.price).toFixed(2)} ₺
                                        </span>
                                        <button
                                          type="button"
                                          className="waiter-add-btn"
                                          disabled={panelBusy || !currentOrderId}
                                          onClick={() => addMenuItemToOrder(item)}
                                        >
                                          Ekle
                                        </button>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            );
                          })
                        : null}

                      {!groupedPickerHasRows && flatActiveMenus.length ? (
                        <details className="waiter-cat-acc" open>
                          <summary className="waiter-cat-acc__sum">Tüm ürünler</summary>
                          <ul className="waiter-menu-list">
                            {flatActiveMenus.map((item) => (
                              <li key={item.id} className="waiter-menu-list__item">
                                <div className="waiter-menu-line">
                                  <span className="waiter-menu-line__name">{item.name}</span>
                                  <span className="waiter-menu-line__price">
                                    {Number(item.price).toFixed(2)} ₺
                                  </span>
                                  <button
                                    type="button"
                                    className="waiter-add-btn"
                                    disabled={panelBusy || !currentOrderId}
                                    onClick={() => addMenuItemToOrder(item)}
                                  >
                                    Ekle
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}

                      <div className="waiter-save-strip">
                        <span className="waiter-save-strip__note">
                          Ödeme için önce Kaydet, sonra Getirildi.
                        </span>
                        <div className="waiter-save-strip__actions">
                          <button
                            type="button"
                            className="waiter-delivered-btn"
                            onClick={() => markOrderDelivered(currentOrderId)}
                            disabled={
                              panelBusy ||
                              hasOrderDraftChanges ||
                              !currentOrderId ||
                              orderLines.length === 0 ||
                              currentOrderDelivered
                            }
                            title={
                              hasOrderDraftChanges
                                ? "Önce değişiklikleri kaydedin."
                                : currentOrderDelivered
                                  ? "Yemek getirildi."
                                  : "Yemek getirildi, ödemeyi aç."
                            }
                          >
                            {currentOrderDelivered ? "Getirildi" : "Getirildi"}
                          </button>
                          <button
                            type="button"
                            className="waiter-save-btn"
                            onClick={saveOrderDraft}
                            disabled={panelBusy || !hasOrderDraftChanges}
                          >
                            {panelBusy ? "Kaydediliyor…" : "Kaydet"}
                          </button>
                        </div>
                      </div>
                    </section>
                  </>
                ) : null}
              </>
            )}
          </div>
          <footer className="order-catalog__foot">
            <button
              type="button"
              className="catalog-close-inline"
              onClick={() => {
                setPendingOpen(false);
                onSelectTable(null);
              }}
              disabled={panelBusy}
            >
              Kapat
            </button>
          </footer>
        </aside>
      </div>
    </div>
  );
}
