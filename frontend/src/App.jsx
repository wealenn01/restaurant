import { useCallback, useEffect, useState } from "react";
import { WaiterFloor } from "./WaiterFloor";
import { AdminDashboard } from "./AdminDashboard";

/**
 * Dev: Vite /api proxy → 127.0.0.1:8000 (Failed to fetch / CORS önler).
 * Prod veya doğrudan backend: .env içinde VITE_API_URL=http://localhost:8000
 */
const API =
  (import.meta.env.VITE_API_URL && String(import.meta.env.VITE_API_URL).trim()) ||
  (import.meta.env.DEV ? "/api" : "http://localhost:8000");

/** DB veya login cevabı boşluk / büyük harf geldiyse staff'a düşmeyelim */
function normalizeRole(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "admin" ? "admin" : "staff";
}

function App() {
  const tokenOnLoad = Boolean(localStorage.getItem("access_token"));

  const [loggedIn, setLoggedIn] = useState(tokenOnLoad);
  /** Rol her zaman sunucu ile hizalanır; boş string = henüz bilinmiyor (token varken /me bekleniyor) */
  const [userRole, setUserRole] = useState("");
  const [authBusy, setAuthBusy] = useState(tokenOnLoad);

  /** Seçilen plan masası ({ index }); veritabanı masası sıra ile eşlenir */
  const [selectedWaiterTable, setSelectedWaiterTable] = useState(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [showRegister, setShowRegister] = useState(false);

  /** Tek kaynak: /auth/me — login cevabındaki role'a güvenmiyoruz (tip/boşluk/eski API) */
  const syncSessionWithServer = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setAuthBusy(false);
      setUserRole("");
      setLoggedIn(false);
      return false;
    }
    setAuthBusy(true);
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("me");
      const u = await res.json();
      const role = normalizeRole(u.role);
      localStorage.setItem("user_role", role);
      setUserRole(role);
      setLoggedIn(true);
      return true;
    } catch {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_role");
      setLoggedIn(false);
      setUserRole("");
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) setSelectedWaiterTable(null);
  }, [loggedIn]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setAuthBusy(false);
      setUserRole("");
      setLoggedIn(false);
      return;
    }
    syncSessionWithServer();
  }, [syncSessionWithServer]);

  /** Tarayıcı geri/ileri (bfcache) + sekme tekrar odaklanınca rolü tazele */
  useEffect(() => {
    const refetch = () => {
      const token = localStorage.getItem("access_token");
      if (!token) return;
      fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          if (!res.ok) throw new Error("me");
          return res.json();
        })
        .then((u) => {
          const role = normalizeRole(u.role);
          localStorage.setItem("user_role", role);
          setUserRole(role);
          setLoggedIn(true);
        })
        .catch(() => {});
    };

    const onPageShow = (e) => {
      if (e.persisted) refetch();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage("Giriş deneniyor...");

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          typeof errData.detail === "string"
            ? errData.detail
            : "Login başarısız"
        );
      }

      const data = await res.json();
      localStorage.setItem("access_token", data.access_token);
      setLoggedIn(true);
      setUserRole("");
      setAuthBusy(true);
      const ok = await syncSessionWithServer();
      if (ok) {
        setMessage("Giriş başarılı.");
      } else {
        setMessage("Oturum doğrulanamadı. Tekrar deneyin.");
      }
    } catch (err) {
      setMessage(`Hata: ${err.message}`);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("Kayıt yapılıyor...");

    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: regUsername,
          email: regEmail,
          password: regPassword,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let detail = "Kayıt başarısız";
        if (typeof errData.detail === "string") {
          detail = errData.detail;
        } else if (Array.isArray(errData.detail)) {
          detail = errData.detail
            .map((d) => d.msg || JSON.stringify(d))
            .join("; ");
        }
        throw new Error(detail);
      }

      const user = await res.json();
      setMessage(`Kayıt başarılı: ${user.username}`);

      const loginRes = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: regUsername,
          password: regPassword,
        }),
      });

      if (loginRes.ok) {
        const data = await loginRes.json();
        localStorage.setItem("access_token", data.access_token);
        setLoggedIn(true);
        setUserRole("");
        setAuthBusy(true);
        const ok = await syncSessionWithServer();
        if (ok) {
          setMessage(`Kayıt tamam; giriş yapıldı (${user.username}).`);
          setShowRegister(false);
        } else {
          setMessage("Kayıt oldu ama oturum doğrulanamadı. Tekrar giriş yapın.");
        }
      }
    } catch (err) {
      setMessage(`Hata: ${err.message}`);
    }
  };

  const linkBtn = {
    border: "none",
    background: "none",
    color: "#2563eb",
    cursor: "pointer",
    fontSize: 13,
    padding: 0,
    textDecoration: "underline",
  };

  const smallBtn = {
    ...linkBtn,
    fontSize: 12,
    textDecoration: "none",
    fontWeight: 600,
  };

  const passwordWrap = {
    position: "relative",
  };

  const passwordInput = {
    width: "100%",
    padding: "8px 38px 8px 8px",
    boxSizing: "border-box",
  };

  const passwordToggle = {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: 2,
    fontSize: 16,
    lineHeight: 1,
  };

  const handleLogout = async () => {
    const token = localStorage.getItem("access_token");
    if (token) {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_role");
    setLoggedIn(false);
    setUserRole("");
    setAuthBusy(false);
    setMessage("");
  };

  if (loggedIn && (authBusy || !userRole)) {
    return (
      <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "sans-serif", textAlign: "center" }}>
        <p>Oturum yükleniyor…</p>
      </div>
    );
  }

  if (loggedIn && userRole === "admin") {
    return <AdminDashboard api={API} onLogout={handleLogout} />;
  }

  if (loggedIn) {
    return (
      <WaiterFloor
        api={API}
        selectedTable={selectedWaiterTable}
        onSelectTable={setSelectedWaiterTable}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div style={{ maxWidth: 360, margin: "40px auto", fontFamily: "sans-serif" }}>
      {!showRegister ? (
        <>
          <h2>Giriş</h2>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 12 }}>
              <label>Kullanıcı adı</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Kullanıcı adı"
                autoComplete="username"
                style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label>Şifre</label>
              <div style={passwordWrap}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifre"
                  autoComplete="current-password"
                  style={passwordInput}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  style={passwordToggle}
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  title={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
                minHeight: 28,
              }}
            >
              <span style={{ fontSize: 13, color: "#555" }}>
                Hesabınız yok mu?
              </span>
              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setShowRegister(true);
                }}
                style={smallBtn}
              >
                Kayıt ol
              </button>
            </div>

            <button type="submit" style={{ width: "100%", padding: 10 }}>
              Giriş yap
            </button>
          </form>
        </>
      ) : (
        <>
          <h2>Kayıt</h2>
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: 12 }}>
              <label>Kullanıcı adı</label>
              <input
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="Kullanıcı adı"
                autoComplete="username"
                style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>E-posta</label>
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="E-posta"
                autoComplete="email"
                style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Şifre (en az 8 karakter)</label>
              <div style={passwordWrap}>
                <input
                  type={showRegPassword ? "text" : "password"}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Şifre"
                  autoComplete="new-password"
                  style={passwordInput}
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword((value) => !value)}
                  style={passwordToggle}
                  aria-label={showRegPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  title={showRegPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  {showRegPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setShowRegister(false);
                }}
                style={linkBtn}
              >
                ← Girişe dön
              </button>
            </div>
            <button type="submit" style={{ width: "100%", padding: 10 }}>
              Hesap oluştur
            </button>
          </form>
        </>
      )}

      <p style={{ marginTop: 20, fontSize: 14 }}>{message}</p>
    </div>
  );
}

export default App;
