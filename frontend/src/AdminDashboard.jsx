import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutEditor } from "./LayoutEditor";
import "./AdminDashboard.css";

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

function formatHours(value) {
  const n = Number(value || 0);
  return `${n.toFixed(1).replace(/\.0$/, "")} saat`;
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function buildStaffSheetRows(staff) {
  const timeline = staff?.timeline || [];
  const base = timeline[0]?.date ? new Date(`${timeline[0].date}T00:00:00`) : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const byDate = new Map(timeline.map((d) => [d.date, d]));

  return Array.from({ length: days }, (_, idx) => {
    const day = idx + 1;
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const row = byDate.get(date);
    const sessions = row?.sessions || [];

    return {
      day: String(day).padStart(2, "0"),
      date,
      started: sessions.length ? sessions.map((s) => s.start_time).join(", ") : "",
      ended: sessions.length ? sessions.map((s) => s.end_time).join(", ") : "",
      hours: row?.hours ?? 0,
    };
  });
}

export function AdminDashboard({ api, onLogout }) {
  const [tab, setTab] = useState("staff");
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [selectedStaffDay, setSelectedStaffDay] = useState(null);
  const [selectedStaffDetail, setSelectedStaffDetail] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editingUserForm, setEditingUserForm] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  /** Menü sekmesinde açık kategori (accordion); null = hepsi kapalı */
  const [menuOpenCategoryId, setMenuOpenCategoryId] = useState(null);

  const flashOk = (msg) => {
    setOk(msg);
    setErr("");
    setTimeout(() => setOk(""), 2800);
  };

  const loadStaff = useCallback(async () => {
    const res = await fetch(`${api}/admin/staff-activity`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await parseError(res));
    setUsers(await res.json());
  }, [api]);

  const loadCurrentUser = useCallback(async () => {
    const res = await fetch(`${api}/auth/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await parseError(res));
    const user = await res.json();
    setCurrentUserId(user.id);
  }, [api]);

  const loadCategories = useCallback(async () => {
    const res = await fetch(`${api}/categories/`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await parseError(res));
    setCategories(await res.json());
  }, [api]);

  const loadMenuItems = useCallback(async () => {
    const res = await fetch(`${api}/menu/items`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await parseError(res));
    setItems(await res.json());
  }, [api]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      if (tab === "staff") {
        await Promise.all([loadStaff(), loadCurrentUser()]);
      }
      if (tab === "layout") {
        await loadCurrentUser();
      }
      if (tab === "categories") await loadCategories();
      if (tab === "menu") {
        await loadCategories();
        await loadMenuItems();
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [tab, loadStaff, loadCurrentUser, loadCategories, loadMenuItems]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab !== "staff") return;
    const id = window.setInterval(() => {
      loadStaff().catch(() => {});
    }, 15000);
    return () => window.clearInterval(id);
  }, [tab, loadStaff]);

  useEffect(() => {
    if (tab !== "menu") setMenuOpenCategoryId(null);
  }, [tab]);

  const selectedStaffRows = useMemo(
    () => buildStaffSheetRows(selectedStaffDetail),
    [selectedStaffDetail]
  );

  const setUserRole = async (userId, role) => {
    setErr("");
    try {
      const res = await fetch(`${api}/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      flashOk("Rol güncellendi.");
      await loadStaff();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const setUserActive = async (userId, is_active) => {
    setErr("");
    try {
      const res = await fetch(`${api}/admin/users/${userId}/active`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ is_active }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      flashOk(is_active ? "Hesap aktifleştirildi." : "Hesap pasifleştirildi.");
      await loadStaff();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const openUserEditor = (user) => {
    setEditingUser(user);
    setEditingUserForm({
      username: user.username || "",
      email: user.email || "",
      password: "",
    });
    setErr("");
    setOk("");
  };

  const saveUserInfo = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    const payload = {
      username: editingUserForm.username.trim(),
      email: editingUserForm.email.trim(),
    };
    if (editingUserForm.password.trim()) {
      payload.password = editingUserForm.password.trim();
    }
    setErr("");
    try {
      const res = await fetch(`${api}/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const updated = await res.json();
      setEditingUser(updated);
      setEditingUserForm({
        username: updated.username || "",
        email: updated.email || "",
        password: "",
      });
      flashOk("Kullanıcı bilgileri güncellendi.");
      await loadStaff();
    } catch (e2) {
      setErr(e2.message || String(e2));
    }
  };

  const deleteUser = async () => {
    if (!editingUser) return;
    if (editingUser.id === currentUserId) {
      setErr("Kendi hesabınızı silemezsiniz.");
      setOk("");
      return;
    }
    const first = window.confirm(`${editingUser.username} hesabı silinecek. Emin misiniz?`);
    if (!first) return;
    const second = window.confirm("Bu işlem geri alınamaz. Hesap kalıcı olarak silinsin mi?");
    if (!second) return;

    setErr("");
    try {
      const res = await fetch(`${api}/admin/users/${editingUser.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseError(res));
      setEditingUser(null);
      setEditingUserForm({ username: "", email: "", password: "" });
      flashOk("Hesap silindi.");
      await loadStaff();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  const createCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setErr("");
    try {
      const res = await fetch(`${api}/categories/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: newCatName.trim(),
          description: newCatDesc.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      setNewCatName("");
      setNewCatDesc("");
      flashOk("Kategori eklendi.");
      await loadCategories();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm("Bu kategoriyi silmek istiyor musunuz? (Ürün varsa silinmez.)")) return;
    setErr("");
    try {
      const res = await fetch(`${api}/categories/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseError(res));
      flashOk("Kategori silindi.");
      await loadCategories();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const [newItem, setNewItem] = useState({
    category_id: "",
    name: "",
    description: "",
    price: "",
    is_active: true,
  });

  const createMenuItem = async (e) => {
    e.preventDefault();
    const cid = Number(newItem.category_id);
    if (!cid || !newItem.name.trim()) {
      setErr("Kategori ve ürün adı zorunlu.");
      return;
    }
    const price = Number(newItem.price);
    if (Number.isNaN(price) || price < 0) {
      setErr("Geçerli bir fiyat girin.");
      return;
    }
    setErr("");
    try {
      const res = await fetch(`${api}/menu/items`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          category_id: cid,
          name: newItem.name.trim(),
          description: newItem.description.trim() || null,
          is_active: newItem.is_active,
          price,
        }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      setNewItem({
        category_id: "",
        name: "",
        description: "",
        price: "",
        is_active: true,
      });
      flashOk("Ürün eklendi.");
      await loadMenuItems();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const updateMenuItem = async (id, patch) => {
    setErr("");
    try {
      const res = await fetch(`${api}/menu/items/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await parseError(res));
      flashOk("Ürün güncellendi.");
      await loadMenuItems();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const deleteMenuItem = async (id) => {
    if (!window.confirm("Bu ürünü silmek istiyor musunuz?")) return;
    setErr("");
    try {
      const res = await fetch(`${api}/menu/items/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await parseError(res));
      flashOk("Ürün silindi.");
      await loadMenuItems();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Yönetim menüsü">
        <div className="admin-sidebar-brand">
          <h1>Yönetim paneli</h1>
          <button type="button" className="admin-logout-btn" onClick={onLogout}>
            Çıkış
          </button>
        </div>
        <nav className="admin-nav">
          <button
            type="button"
            className={`admin-nav-btn${tab === "staff" ? " admin-nav-btn--active" : ""}`}
            onClick={() => setTab("staff")}
          >
            Personel
          </button>
          <button
            type="button"
            className={`admin-nav-btn${tab === "menu" ? " admin-nav-btn--active" : ""}`}
            onClick={() => setTab("menu")}
          >
            Menü
          </button>
          <button
            type="button"
            className={`admin-nav-btn${tab === "categories" ? " admin-nav-btn--active" : ""}`}
            onClick={() => setTab("categories")}
          >
            Kategori
          </button>
          <button
            type="button"
            className={`admin-nav-btn${tab === "layout" ? " admin-nav-btn--active" : ""}`}
            onClick={() => setTab("layout")}
          >
            Restaurant düzenle
          </button>
        </nav>
      </aside>

      <div className="admin-main-wrap">
        <div className="admin-panel-card">
          <div className="admin-panel-clip">
            <div key={tab} className="admin-panel-slide">
              {err ? (
                <div className="admin-msg admin-msg--err" role="alert">
                  {err}
                </div>
              ) : null}
              {ok ? <div className="admin-msg admin-msg--ok">{ok}</div> : null}
              {loading ? <p className="admin-loading">Yükleniyor…</p> : null}

              {tab === "staff" ? (
          <section className="admin-card">
            <h2>Çalışanlar</h2>
            <p className="admin-muted">
              Staff kullanıcı login yapana kadar pasif görünür. Logout yapınca tarih
              çizelgesine düşer; süreler sadece saat cinsinden gösterilir.
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Kullanıcı</th>
                    <th>E-posta</th>
                    <th>Rol</th>
                    <th>Durum</th>
                    <th>Aktif süre</th>
                    <th>Bugün</th>
                    <th>Yakından incele</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelfAdmin = u.id === currentUserId && u.role === "admin";

                    return (
                      <tr key={u.id}>
                        <td>{u.username}</td>
                        <td>{u.email}</td>
                        <td>
                          <span className={u.role === "admin" ? "badge badge--admin" : "badge badge--staff"}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span className={u.is_online ? "badge badge--on" : "badge badge--off"}>
                            {u.is_online ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td>{u.is_online ? formatHours(u.active_hours) : "-"}</td>
                        <td>{formatHours(u.today_hours)}</td>
                        <td>
                          <button
                            type="button"
                            className="staff-timeline-btn"
                            onClick={() => {
                              setSelectedStaffDetail(u);
                              setSelectedStaffDay(null);
                            }}
                          >
                            Yakından incele
                          </button>
                        </td>
                        <td>
                          <div className="admin-actions">
                            <button
                              type="button"
                              className="admin-btn"
                              disabled={isSelfAdmin}
                              title={isSelfAdmin ? "Kendi admin rolünüzü staff yapamazsınız." : undefined}
                              onClick={() => setUserRole(u.id, u.role === "admin" ? "staff" : "admin")}
                            >
                              {u.role === "admin" ? "Staff yap" : "Admin yap"}
                            </button>
                            <button
                              type="button"
                              className="admin-btn"
                              onClick={() => setUserActive(u.id, !u.is_active)}
                            >
                              {u.is_active ? "Hesabı kapat" : "Hesabı aç"}
                            </button>
                            <button
                              type="button"
                              className="admin-btn"
                              onClick={() => openUserEditor(u)}
                            >
                              Bilgileri düzenle
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {editingUser ? (
              <section className="admin-user-edit-card" aria-label="Kullanıcı bilgileri düzenleme">
                <div className="admin-user-edit-card__head">
                  <div>
                    <h3>{editingUser.username} bilgileri</h3>
                    <p>Şifre görüntülenmez; unutulduysa buradan yeni şifre verilir.</p>
                  </div>
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => {
                      setEditingUser(null);
                      setEditingUserForm({ username: "", email: "", password: "" });
                    }}
                  >
                    Kapat
                  </button>
                </div>
                <form className="admin-user-edit-form" onSubmit={saveUserInfo}>
                  <label>
                    Kullanıcı adı
                    <input
                      value={editingUserForm.username}
                      onChange={(e) =>
                        setEditingUserForm((prev) => ({ ...prev, username: e.target.value }))
                      }
                      minLength={3}
                    />
                  </label>
                  <label>
                    E-posta
                    <input
                      type="email"
                      value={editingUserForm.email}
                      onChange={(e) =>
                        setEditingUserForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Yeni şifre
                    <input
                      type="password"
                      value={editingUserForm.password}
                      onChange={(e) =>
                        setEditingUserForm((prev) => ({ ...prev, password: e.target.value }))
                      }
                      placeholder="Değişmeyecekse boş bırak"
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </label>
                  <button type="submit" className="admin-btn admin-btn--primary">
                    Bilgileri kaydet
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--danger"
                    onClick={deleteUser}
                    disabled={editingUser.id === currentUserId}
                    title={editingUser.id === currentUserId ? "Kendi hesabınızı silemezsiniz." : undefined}
                  >
                    Hesabı sil
                  </button>
                </form>
              </section>
            ) : null}
            {selectedStaffDetail ? (
              <section className="staff-detail-sheet" aria-label="Garson çalışma çizelgesi">
                <div className="staff-detail-sheet__head">
                  <div>
                    <h3>{selectedStaffDetail.username} çalışma çizelgesi</h3>
                    <p>
                      Başlangıç, bitiş ve toplam çalışma süresi gün gün gösterilir.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => {
                      setSelectedStaffDetail(null);
                      setSelectedStaffDay(null);
                    }}
                  >
                    Kapat
                  </button>
                </div>

                {selectedStaffDay ? (
                  <div className="staff-info-card">
                    <strong>Garson bilgisi</strong>
                    <span>
                      {selectedStaffDay.username} · {formatDate(selectedStaffDay.date)} çalışması:{" "}
                      {formatHours(selectedStaffDay.hours)}
                    </span>
                  </div>
                ) : (
                  <p className="admin-muted">
                    Gün satırına basınca garson bilgisi burada görünür.
                  </p>
                )}

                <div className="staff-sheet-table-wrap">
                  <table className="staff-sheet-table">
                    <thead>
                      <tr>
                        <th>Gün</th>
                        <th>Başladı</th>
                        <th>Bitti</th>
                        <th>Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStaffRows.map((row) => (
                        <tr
                          key={row.date}
                          className={row.hours > 0 ? "staff-sheet-row--worked" : ""}
                          onClick={() =>
                            setSelectedStaffDay({
                              userId: selectedStaffDetail.id,
                              username: selectedStaffDetail.username,
                              date: row.date,
                              hours: row.hours,
                            })
                          }
                        >
                          <td>{row.day}</td>
                          <td>{row.started || "-"}</td>
                          <td>{row.ended || "-"}</td>
                          <td>{row.hours > 0 ? formatHours(row.hours) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </section>
              ) : null}

              {tab === "layout" ? <LayoutEditor api={api} /> : null}

              {tab === "categories" ? (
          <section className="admin-card">
            <h2>Yeni kategori</h2>
            <form onSubmit={createCategory} className="admin-form-grid">
              <label>
                Ad
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Örn: İçecekler"
                />
              </label>
              <label>
                Açıklama (isteğe bağlı)
                <input
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Kısa açıklama"
                />
              </label>
              <div>
                <button type="submit" className="admin-btn admin-btn--primary">
                  Kategori ekle
                </button>
              </div>
            </form>
          </section>
              ) : null}

              {tab === "categories" ? (
          <section className="admin-card">
            <h2>Mevcut kategoriler</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Ad</th>
                    <th>Sıra</th>
                    <th>Menüde</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.position}</td>
                      <td>{c.is_active ? "Evet" : "Hayır"}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger"
                          onClick={() => deleteCategory(c.id)}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
              ) : null}

              {tab === "menu" ? (
          <section className="admin-card">
            <h2>Yeni ürün</h2>
            <form onSubmit={createMenuItem} className="admin-form-grid">
              <label>
                Kategori
                <select
                  value={newItem.category_id}
                  onChange={(e) => setNewItem((s) => ({ ...s, category_id: e.target.value }))}
                >
                  <option value="">Seçin…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ürün adı
                <input
                  value={newItem.name}
                  onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Örn: Ayran"
                />
              </label>
              <label>
                Fiyat
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newItem.price}
                  onChange={(e) => setNewItem((s) => ({ ...s, price: e.target.value }))}
                  placeholder="0"
                />
              </label>
              <label>
                Açıklama
                <input
                  value={newItem.description}
                  onChange={(e) => setNewItem((s) => ({ ...s, description: e.target.value }))}
                  placeholder="İsteğe bağlı"
                />
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={newItem.is_active}
                  onChange={(e) => setNewItem((s) => ({ ...s, is_active: e.target.checked }))}
                />
                Menüde satışta
              </label>
              <div>
                <button type="submit" className="admin-btn admin-btn--primary">
                  Ürün ekle
                </button>
              </div>
            </form>
          </section>
              ) : null}

              {tab === "menu" ? (
          <section className="admin-card">
            <h2>Ürün listesi</h2>
            <p className="admin-muted">
              Kategoriye tıklayarak ürünleri açıp kapatabilirsiniz. Fiyat ve menüde görünürlük
              buradan yönetilir.
            </p>
            <div className="menu-cat-list">
              {categories.length === 0 ? (
                <p className="admin-muted">Önce &quot;Kategori&quot; sekmesinden kategori ekleyin.</p>
              ) : (
                categories.map((cat) => {
                  const catItems = items.filter((it) => it.category_id === cat.id);
                  const open = menuOpenCategoryId === cat.id;
                  return (
                    <div
                      key={cat.id}
                      className={`menu-cat-block${open ? " menu-cat-block--open" : ""}`}
                    >
                      <button
                        type="button"
                        className="menu-cat-toggle"
                        aria-expanded={open}
                        onClick={() =>
                          setMenuOpenCategoryId((id) => (id === cat.id ? null : cat.id))
                        }
                      >
                        <span className="menu-cat-chevron" aria-hidden />
                        <span className="menu-cat-name">{cat.name}</span>
                        <span className="menu-cat-count">{catItems.length} ürün</span>
                      </button>
                      <div className="menu-cat-panel">
                        <div className="menu-cat-panel-inner">
                          {catItems.length === 0 ? (
                            <p className="admin-muted menu-cat-empty">Bu kategoride ürün yok.</p>
                          ) : (
                            <div className="admin-table-wrap">
                              <table className="admin-table">
                                <thead>
                                  <tr>
                                    <th>Ürün</th>
                                    <th>Fiyat</th>
                                    <th>Satışta</th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {catItems.map((it) => (
                                    <MenuItemRow
                                      key={it.id}
                                      item={it}
                                      showCategory={false}
                                      onSave={(patch) => updateMenuItem(it.id, patch)}
                                      onDelete={() => deleteMenuItem(it.id)}
                                    />
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuItemRow({ item, categoryName = "", showCategory = true, onSave, onDelete }) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState(String(item.price));
  const [is_active, setIs_active] = useState(item.is_active);

  useEffect(() => {
    setName(item.name);
    setDescription(item.description ?? "");
    setPrice(String(item.price));
    setIs_active(item.is_active);
  }, [item]);

  const dirty =
    name !== item.name ||
    (description || "") !== (item.description ?? "") ||
    Number(price) !== item.price ||
    is_active !== item.is_active;

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      {showCategory ? <td>{categoryName}</td> : null}
      <td>
        <input
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={{ maxWidth: 100 }}
        />
      </td>
      <td>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={is_active} onChange={(e) => setIs_active(e.target.checked)} />
        </label>
      </td>
      <td>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={!dirty}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim() || null,
                price: Number(price),
                is_active,
              })
            }
          >
            Kaydet
          </button>
          <button type="button" className="admin-btn admin-btn--danger" onClick={onDelete}>
            Sil
          </button>
        </div>
      </td>
    </tr>
  );
}
