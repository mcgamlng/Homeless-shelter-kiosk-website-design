import { useEffect, useState } from "react";
import {
  Link,
  Route,
  Routes,
  Navigate,
  BrowserRouter,
  useLocation,
  useNavigate
} from "react-router-dom";
import { LockKeyhole, Menu, X } from "lucide-react";
import { api } from "./api.js";
import Kiosk from "./pages/Kiosk.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Admin from "./pages/Admin.jsx";
import About from "./pages/About.jsx";
import InstallApp from "./pages/InstallApp.jsx";
import { getKioskCssVariables, getKioskCustomization } from "../shared/kioskCustomization.js";

const navItems = [
  { label: "Kiosk", to: "/kiosk" },
  { label: "Dashboard", to: "/dashboard" },
  { label: "Admin", to: "/admin" },
  { label: "About", to: "/about" }
];

const protectedPaths = new Set(["/dashboard", "/admin", "/about"]);

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isKiosk = location.pathname === "/kiosk";
  const [staffMenuOpen, setStaffMenuOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState("");
  const [entryPin, setEntryPin] = useState("");
  const [entryMessage, setEntryMessage] = useState("");
  const [entryLoading, setEntryLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const customization = getKioskCustomization(settings || {});
  const kioskThemeStyle = isKiosk ? getKioskCssVariables(settings || {}) : undefined;

  useEffect(() => {
    setStaffMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    api
      .getSettings()
      .then((nextSettings) => {
        if (active) setSettings(nextSettings);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    function applyUpdatedSettings(event) {
      setSettings(event.detail);
    }

    window.addEventListener("lh:kiosk-settings-updated", applyUpdatedSettings);
    return () => {
      window.removeEventListener("lh:kiosk-settings-updated", applyUpdatedSettings);
    };
  }, []);

  function requestNavigation(path) {
    if (path === location.pathname) {
      setStaffMenuOpen(false);
      return;
    }

    if (path === "/kiosk") {
      navigate(path);
      return;
    }

    if (isKiosk && protectedPaths.has(path)) {
      setPendingPath(path);
      setEntryPin("");
      setEntryMessage("");
      return;
    }

    navigate(path);
  }

  async function unlockPendingRoute(event) {
    event.preventDefault();
    setEntryMessage("");
    setEntryLoading(true);
    try {
      const response = await api.adminLogin(entryPin);
      sessionStorage.setItem("lh-admin-token", response.token);
      const path = pendingPath;
      setPendingPath("");
      setEntryPin("");
      setStaffMenuOpen(false);
      navigate(path);
    } catch (err) {
      setEntryMessage(err.message || "That PIN did not work.");
    } finally {
      setEntryLoading(false);
    }
  }

  return (
    <div className="app" style={kioskThemeStyle}>
      <header className={`topbar ${isKiosk ? "is-kiosk-topbar" : ""}`}>
        <Link className="brand" to="/kiosk" aria-label="Listening House Guest Check-In System">
          <span className="brand-mark">
            <img src="/icons/lh-icon.svg" alt="" aria-hidden="true" />
          </span>
          <span>
            <strong>{customization.organization_name}</strong>
            <small>{customization.system_name}</small>
          </span>
        </Link>
        {isKiosk ? (
          <button
            className="staff-menu-toggle"
            type="button"
            onClick={() => setStaffMenuOpen((open) => !open)}
            aria-expanded={staffMenuOpen}
            aria-controls="staff-navigation"
          >
            {staffMenuOpen ? <X size={20} /> : <Menu size={20} />}
            <span className="staff-menu-label">Staff menu</span>
          </button>
        ) : null}
        <nav
          className={`topnav ${isKiosk ? "is-staff-panel" : ""} ${staffMenuOpen ? "is-open" : ""}`}
          id="staff-navigation"
          aria-label={isKiosk ? "Staff navigation" : "Main navigation"}
          aria-hidden={isKiosk && !staffMenuOpen}
        >
          {navItems.map((item) => (
            <button
              aria-current={location.pathname === item.to ? "page" : undefined}
              className={location.pathname === item.to ? "active" : ""}
              key={item.to}
              onClick={() => requestNavigation(item.to)}
              tabIndex={isKiosk && !staffMenuOpen ? -1 : 0}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<KioskLauncher />} />
          <Route path="/kiosk" element={<Kiosk settings={settings} />} />
          <Route path="/install" element={<InstallApp />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedEntry>
                <Dashboard />
              </ProtectedEntry>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedEntry>
                <Admin />
              </ProtectedEntry>
            }
          />
          <Route
            path="/about"
            element={
              <ProtectedEntry>
                <About />
              </ProtectedEntry>
            }
          />
          <Route path="*" element={<Navigate to="/kiosk" replace />} />
        </Routes>
      </main>
      {pendingPath ? (
        <div className="entry-modal-backdrop" role="presentation">
          <form className="entry-modal" onSubmit={unlockPendingRoute}>
            <div className="entry-modal-icon">
              <LockKeyhole size={28} />
            </div>
            <h2>Staff PIN required</h2>
            <p>Enter the current Admin PIN to leave the kiosk screen.</p>
            <label>
              Entry PIN
              <input
                autoFocus
                inputMode="numeric"
                maxLength={12}
                onChange={(event) =>
                  setEntryPin(event.target.value.replace(/\D/g, "").slice(0, 12))
                }
                type="password"
                value={entryPin}
              />
            </label>
            {entryMessage ? <p className="error-message">{entryMessage}</p> : null}
            <div className="entry-modal-actions">
              <button className="secondary-button" onClick={() => setPendingPath("")} type="button">
                Stay on kiosk
              </button>
              <button className="primary-button" disabled={entryLoading || !entryPin}>
                {entryLoading ? "Checking..." : "Unlock"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function KioskLauncher() {
  const [message, setMessage] = useState("");
  const [launching, setLaunching] = useState(false);

  async function openFullScreenKiosk() {
    setMessage("");
    setLaunching(true);
    try {
      const result = await api.openKioskOnThisPi();
      setMessage(result.message || "Opening the kiosk full-screen on this Raspberry Pi.");
    } catch (err) {
      setMessage(err.message || "Open this button on the Raspberry Pi screen itself.");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <section className="entry-page kiosk-launcher-page">
      <div className="entry-card kiosk-launcher-card">
        <img src="/icons/lh-icon.svg" alt="" className="launcher-logo" />
        <h1>Listening House Kiosk</h1>
        <p>Use this page to open the guest check-in kiosk again on the Raspberry Pi screen.</p>
        <button className="primary-button" type="button" onClick={openFullScreenKiosk}>
          {launching ? "Opening..." : "Open full-screen kiosk"}
        </button>
        <Link className="secondary-button launcher-link" to="/kiosk">
          Open kiosk in this browser
        </Link>
        {message ? <p className="network-status">{message}</p> : null}
      </div>
    </section>
  );
}

function ProtectedEntry({ children }) {
  const [pin, setPin] = useState("");
  const [state, setState] = useState("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = sessionStorage.getItem("lh-admin-token");
    if (!token) {
      setState("locked");
      return;
    }

    let active = true;
    api
      .getAdminSecurity(token)
      .then(() => {
        if (active) setState("unlocked");
      })
      .catch(() => {
        sessionStorage.removeItem("lh-admin-token");
        if (active) {
          setState("locked");
          setMessage("Enter the current Admin PIN to continue.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function unlockRoute(event) {
    event.preventDefault();
    setMessage("");
    setState("checking");
    try {
      const response = await api.adminLogin(pin);
      sessionStorage.setItem("lh-admin-token", response.token);
      setPin("");
      setState("unlocked");
    } catch (err) {
      setState("locked");
      setMessage(err.message || "That PIN did not work.");
    }
  }

  if (state === "checking") {
    return <div className="page-status">Checking staff access...</div>;
  }

  if (state === "locked") {
    return (
      <section className="entry-page">
        <form className="entry-card" onSubmit={unlockRoute}>
          <div className="entry-modal-icon">
            <LockKeyhole size={30} />
          </div>
          <h1>Staff PIN required</h1>
          <p>Enter the current Admin PIN to open this page.</p>
          <label>
            Entry PIN
            <input
              autoFocus
              inputMode="numeric"
              maxLength={12}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
              type="password"
              value={pin}
            />
          </label>
          {message ? <p className="error-message">{message}</p> : null}
          <button className="primary-button" disabled={!pin}>
            Unlock
          </button>
          <Link className="text-button" to="/kiosk">
            Return to kiosk
          </Link>
        </form>
      </section>
    );
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
