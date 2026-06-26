import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  KeyRound,
  Lock,
  LogOut,
  Palette,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { api } from "../api.js";
import {
  DEFAULT_KIOSK_CUSTOMIZATION,
  getKioskCssVariables,
  getKioskCustomization
} from "../../shared/kioskCustomization.js";
import { ACTIVITY_ICON_OPTIONS, ActivityIcon } from "../icons.jsx";

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cleanPinInput(event) {
  const cleanValue = cleanPinValue(event.currentTarget.value);
  event.currentTarget.value = cleanValue;
  return cleanValue;
}

function cleanPinValue(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 12);
}

const customizationGuideCards = [
  {
    art: "name",
    title: "1. Name the shelter",
    text: "Start with the words guests and staff see at the top."
  },
  {
    art: "words",
    title: "2. Write the screens",
    text: "Use plain, welcoming wording for each guest step."
  },
  {
    art: "colors",
    title: "3. Pick the colors",
    text: "Choose colors that match the shelter or program."
  },
  {
    art: "preview",
    title: "4. Check preview, then save",
    text: "The preview shows the feeling before it goes live."
  }
];

const kioskTextSections = [
  {
    id: "customize-name",
    art: "name",
    title: "Shelter name",
    helper:
      "These words appear in the top bar and help the kiosk feel like it belongs to the site.",
    fields: [
      { key: "organization_name", label: "Shelter / organization name" },
      { key: "system_name", label: "Small system name" }
    ]
  },
  {
    id: "customize-welcome",
    art: "words",
    title: "Welcome screen",
    helper: "This is the first screen guests see before they begin checking in.",
    fields: [
      { key: "kiosk_welcome_title", label: "Welcome title" },
      { key: "kiosk_welcome_subtitle", label: "Welcome helper text", multiline: true }
    ]
  },
  {
    id: "customize-identity",
    art: "choices",
    title: "Name and service screens",
    helper: "These guide guests through name entry, language choice, and service selection.",
    fields: [
      { key: "kiosk_name_entry_title", label: "Name entry title" },
      { key: "kiosk_name_entry_help", label: "Name entry helper text", multiline: true },
      { key: "kiosk_check_in_button", label: "Sign in / sign up button" },
      { key: "kiosk_language_title", label: "Language screen title" },
      { key: "kiosk_activity_title", label: "Activity screen title" },
      { key: "kiosk_activity_subtitle", label: "Activity helper text" }
    ]
  },
  {
    id: "customize-finish",
    art: "preview",
    title: "Finish screen",
    helper: "This tells guests what happens after their name and services are checked in.",
    fields: [
      { key: "kiosk_confirmation_message", label: "Confirmation message" },
      { key: "kiosk_finish_button", label: "Finish button text" }
    ]
  }
];

const kioskColorFields = [
  { key: "kiosk_background_color", label: "Kiosk outside background" },
  { key: "kiosk_screen_color", label: "Main kiosk screen" },
  { key: "kiosk_primary_color", label: "Main button / purple shape" },
  { key: "kiosk_accent_color", label: "Logo and dark accent" },
  { key: "kiosk_card_color", label: "Activity and keypad cards" },
  { key: "kiosk_selected_color", label: "Selected state" },
  { key: "kiosk_text_color", label: "Large screen text" },
  { key: "kiosk_button_text_color", label: "Button text" }
];

const kioskPreviewPages = [
  { id: "welcome", label: "Welcome" },
  { id: "identity", label: "Name" },
  { id: "language", label: "Language" },
  { id: "activities", label: "Activities" },
  { id: "confirmation", label: "Confirmation" }
];

function cloneDefaultCustomization() {
  return { ...DEFAULT_KIOSK_CUSTOMIZATION };
}

function createNewActivityDraft() {
  return {
    name: "",
    duration_minutes: 20,
    time_limit_enabled: true,
    availability_window_enabled: false,
    availability_start: "08:00",
    availability_end: "16:00",
    monthly_window_enabled: false,
    monthly_start_day: 1,
    monthly_end_day: 31,
    yearly_window_enabled: false,
    yearly_start: "01-01",
    yearly_end: "12-31",
    daily_limit_enabled: false,
    daily_limit: 10,
    alarm_enabled: false,
    alarm_minutes_before: 5,
    icon: "heart-hand",
    active: true
  };
}

const monthOptions = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
].map((label, index) => ({
  label,
  value: String(index + 1).padStart(2, "0")
}));

function splitMonthDay(value, fallback = "01-01") {
  const match = String(value || fallback).match(/^(\d{2})-(\d{2})$/);
  return match ? { month: match[1], day: Number(match[2]) } : splitMonthDay(fallback);
}

function daysInMonth(month) {
  return new Date(2000, Number(month), 0).getDate();
}

export default function Admin() {
  const currentPinRef = useRef(null);
  const newPinRef = useRef(null);
  const confirmPinRef = useRef(null);
  const analyticsRequestRef = useRef(0);
  const [pin, setPin] = useState("");
  const [token, setToken] = useState(sessionStorage.getItem("lh-admin-token") || "");
  const [adminVerified, setAdminVerified] = useState(false);
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");
  const [analyticsPeriod, setAnalyticsPeriod] = useState("day");
  const [analyticsDate, setAnalyticsDate] = useState(todayKey());
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  const [lastExportUrl, setLastExportUrl] = useState("");
  const [lastExportFilename, setLastExportFilename] = useState("");
  const [pinDraft, setPinDraft] = useState({ currentPin: "", newPin: "", confirmPin: "" });
  const [savingPin, setSavingPin] = useState(false);
  const [newActivity, setNewActivity] = useState(createNewActivityDraft);
  const [customizationDraft, setCustomizationDraft] = useState(cloneDefaultCustomization);
  const kioskPreviewStyle = useMemo(
    () => getKioskCssVariables({ customization: customizationDraft }),
    [customizationDraft]
  );

  const signedIn = Boolean(token && adminVerified);

  function currentAdminToken() {
    return sessionStorage.getItem("lh-admin-token") || token;
  }

  useEffect(() => {
    if (!token) return;
    api
      .getDashboard(token)
      .then(setData)
      .catch((err) => setMessage(err.message));
  }, [token]);

  useEffect(() => {
    if (!token) {
      setAdminVerified(false);
      return;
    }
    loadSecurity(token);
  }, [token]);

  useEffect(() => {
    if (!signedIn) return;
    loadAnalytics(token);
  }, [signedIn, token, analyticsPeriod, analyticsDate]);

  useEffect(() => {
    if (data?.settings) {
      setCustomizationDraft(getKioskCustomization(data.settings));
    }
  }, [data?.settings]);

  const mostRequested = useMemo(() => data?.totals.mostRequestedActivities || [], [data]);

  async function login(event) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await api.adminLogin(pin);
      sessionStorage.setItem("lh-admin-token", response.token);
      setAdminVerified(false);
      setToken(response.token);
      setPin("");
      setMessage("Admin access unlocked.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function refresh() {
    setData(await api.getDashboard(currentAdminToken()));
  }

  async function loadSecurity(authToken = token) {
    try {
      await api.getAdminSecurity(authToken);
      setAdminVerified(true);
    } catch (err) {
      handleAdminError(err, authToken);
    }
  }

  function handleAdminError(err, failedToken = currentAdminToken()) {
    if (err.status === 401) {
      const currentToken = sessionStorage.getItem("lh-admin-token") || "";
      if (failedToken && !currentToken) {
        return;
      }
      if (failedToken && currentToken && failedToken !== currentToken) {
        return;
      }
      sessionStorage.removeItem("lh-admin-token");
      setToken("");
      setAdminVerified(false);
      setAnalytics(null);
      setMessage("Please enter the Admin PIN again.");
      return;
    }
    setMessage(err.message);
  }

  async function saveNewAdminPin(event) {
    event.preventDefault();
    setMessage("");
    const form =
      event.currentTarget?.form || event.currentTarget?.closest?.("form") || event.currentTarget;
    const currentPinValue = String(
      currentPinRef.current?.value ||
        form?.querySelector?.("[name='current_pin']")?.value ||
        document.querySelector?.("[name='current_pin']")?.value ||
        pinDraft.currentPin ||
        ""
    )
      .replace(/\D/g, "")
      .slice(0, 12);
    const newPinValue = String(
      newPinRef.current?.value ||
        form?.querySelector?.("[name='new_pin']")?.value ||
        document.querySelector?.("[name='new_pin']")?.value ||
        pinDraft.newPin ||
        ""
    )
      .replace(/\D/g, "")
      .slice(0, 12);
    const confirmPinValue = String(
      confirmPinRef.current?.value ||
        form?.querySelector?.("[name='confirm_pin']")?.value ||
        document.querySelector?.("[name='confirm_pin']")?.value ||
        pinDraft.confirmPin ||
        ""
    )
      .replace(/\D/g, "")
      .slice(0, 12);

    if (!currentPinValue || !newPinValue || !confirmPinValue) {
      setMessage("Enter the current PIN, new PIN, and confirmation.");
      return;
    }

    if (newPinValue !== confirmPinValue) {
      setMessage("New PIN and confirmation do not match.");
      return;
    }
    setSavingPin(true);
    const authToken = currentAdminToken();
    try {
      const freshSession = await api.adminLogin(currentPinValue);
      await api.changeAdminPin(freshSession.token, {
        currentPin: currentPinValue,
        newPin: newPinValue
      });
      completeAdminPinChange();
    } catch (err) {
      if (err.status === 401) {
        setMessage("Current PIN did not work.");
      } else {
        handleAdminError(err, authToken);
      }
    } finally {
      setSavingPin(false);
    }
  }

  function completeAdminPinChange() {
    [currentPinRef, newPinRef, confirmPinRef].forEach((inputRef) => {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    });
    sessionStorage.removeItem("lh-admin-token");
    setToken("");
    setAdminVerified(false);
    setAnalytics(null);
    setPinDraft({ currentPin: "", newPin: "", confirmPin: "" });
    setPin("");
    setMessage("Admin PIN changed. Please sign in with the new PIN.");
  }

  function signOutAdmin() {
    sessionStorage.removeItem("lh-admin-token");
    setToken("");
    setAdminVerified(false);
    setAnalytics(null);
    setPin("");
    setPinDraft({ currentPin: "", newPin: "", confirmPin: "" });
    setMessage("Signed out of admin controls.");
  }

  async function loadAnalytics(authToken = token) {
    const requestId = analyticsRequestRef.current + 1;
    analyticsRequestRef.current = requestId;
    setAnalyticsLoading(true);
    try {
      const nextAnalytics = await api.getAnalytics(authToken, analyticsPeriod, analyticsDate);
      if (requestId === analyticsRequestRef.current) {
        setAnalytics(nextAnalytics);
      }
    } catch (err) {
      if (requestId === analyticsRequestRef.current) {
        handleAdminError(err, authToken);
      }
    } finally {
      if (requestId === analyticsRequestRef.current) {
        setAnalyticsLoading(false);
      }
    }
  }

  async function exportAnalytics() {
    setMessage("");
    const authToken = currentAdminToken();
    if (!authToken) {
      setMessage("Please enter the Admin PIN again.");
      return;
    }
    setExporting(true);
    try {
      const download = await api.createAnalyticsExportLink(
        authToken,
        analyticsPeriod,
        analyticsDate
      );
      setLastExportUrl(download.url);
      setLastExportFilename(download.filename || "Listening House analytics spreadsheet");
      window.location.assign(download.url);
      setMessage("Excel download started. If it does not appear, press Download Excel now.");
    } catch (err) {
      handleAdminError(err, authToken);
    } finally {
      setExporting(false);
    }
  }

  async function saveActivity(activity) {
    setMessage("");
    try {
      await api.updateActivity(token, activity.id, activity);
      await refresh();
      setMessage("Activity saved.");
    } catch (err) {
      handleAdminError(err);
    }
  }

  async function deleteActivity(activity) {
    const name = activity.name || "this activity";
    if (!window.confirm(`Delete ${name}? Existing check-in history will stay saved.`)) return;
    setMessage("");
    try {
      await api.deleteActivity(token, activity.id);
      await refresh();
      setMessage(`${name} deleted.`);
    } catch (err) {
      handleAdminError(err);
    }
  }

  async function addActivity(event) {
    event.preventDefault();
    setMessage("");
    setAddingActivity(true);
    const authToken = currentAdminToken();
    try {
      const activity = await api.createActivity(authToken, newActivity);
      setNewActivity(createNewActivityDraft());
      await refresh();
      setMessage(`${activity.name} added and ready to configure.`);
    } catch (err) {
      handleAdminError(err, authToken);
    } finally {
      setAddingActivity(false);
    }
  }

  async function saveBuffer(value) {
    setMessage("");
    try {
      await api.updateSetting(token, "buffer_minutes", value);
      await refresh();
      setMessage("Buffer time saved.");
    } catch (err) {
      handleAdminError(err);
    }
  }

  async function saveWorkdaySetting(key, value) {
    setMessage("");
    try {
      await api.updateSetting(token, key, value);
      await refresh();
      setMessage("Workday time saved.");
    } catch (err) {
      handleAdminError(err);
    }
  }

  function updateCustomizationDraft(key, value) {
    setCustomizationDraft((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function saveKioskCustomization(event) {
    event.preventDefault();
    setMessage("");
    const authToken = currentAdminToken();
    try {
      const nextSettings = await api.updateSettings(authToken, customizationDraft);
      setData((current) => (current ? { ...current, settings: nextSettings } : current));
      window.dispatchEvent(new CustomEvent("lh:kiosk-settings-updated", { detail: nextSettings }));
      setMessage("Kiosk customization saved.");
    } catch (err) {
      handleAdminError(err, authToken);
    }
  }

  function resetCustomizationDraft() {
    setCustomizationDraft(cloneDefaultCustomization());
    setMessage("Default kiosk customization loaded. Press Save customization to keep it.");
  }

  async function resetDay(seedDemo) {
    const copy = seedDemo
      ? "Reset daily data and load three demo guest names?"
      : "Start a new day and clear all active guest check-ins from the dashboard?";
    if (!window.confirm(copy)) return;
    setMessage("");
    try {
      const nextData = await api.resetDay(token, seedDemo);
      setData(nextData);
      setMessage(
        seedDemo ? "Demo data loaded." : "New day started. Active guest check-ins cleared."
      );
    } catch (err) {
      handleAdminError(err);
    }
  }

  async function clearActive() {
    if (!window.confirm("Clear all active guest check-ins from the dashboard?")) return;
    setMessage("");
    try {
      const nextData = await api.clearActive(token);
      setData(nextData);
      setMessage("Active guest check-ins cleared.");
    } catch (err) {
      handleAdminError(err);
    }
  }

  if (!data) {
    return <div className="page-status">Loading admin settings...</div>;
  }

  return (
    <section className="admin-page">
      <div className="page-heading compact">
        <div>
          <h1>Admin / Settings</h1>
          <p>Manage activities, schedule spacing, and daily reset controls.</p>
        </div>
        <div className="admin-heading-actions">
          <span className={`admin-state ${signedIn ? "is-on" : ""}`}>
            {signedIn ? <ShieldCheck size={18} /> : <Lock size={18} />}
            {signedIn ? "Admin unlocked" : "PIN required"}
          </span>
          {signedIn ? (
            <button
              className="secondary-button compact-button admin-sign-out"
              type="button"
              onClick={signOutAdmin}
            >
              <LogOut size={18} />
              Sign out
            </button>
          ) : null}
        </div>
      </div>

      {!signedIn ? (
        <div className="admin-auth-grid">
          <form className="admin-login card-panel" onSubmit={login}>
            <h2>Admin PIN</h2>
            <p>Reset and settings controls are protected for this local prototype.</p>
            <label>
              PIN
              <input
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <button className="primary-button">Unlock settings</button>
          </form>
        </div>
      ) : null}

      {message ? <p className="notice-message">{message}</p> : null}

      <div className="admin-layout">
        <div className="card-panel">
          <h2>Daily totals</h2>
          <div className="totals-list">
            <span>Guests checked in</span>
            <strong>{data.totals.guestsCheckedIn}</strong>
            <span>Completed activities</span>
            <strong>{data.totals.completedActivities}</strong>
            <span>Skipped activities</span>
            <strong>{data.totals.skippedActivities}</strong>
            <span>Current active guests</span>
            <strong>{data.totals.activeGuests.join(", ") || "None"}</strong>
          </div>
          <h3>Most requested</h3>
          <div className="request-list">
            {mostRequested.length === 0 ? <span>No activity requests yet.</span> : null}
            {mostRequested.map((item) => (
              <span key={item.name}>
                {item.name} <strong>{item.count}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="card-panel">
          <h2>Schedule settings</h2>
          <div className="settings-grid">
            <label>
              Workday start time
              <input
                type="time"
                defaultValue={data.settings.workday_start || "08:00"}
                disabled={!signedIn}
                onBlur={(event) => saveWorkdaySetting("workday_start", event.target.value)}
              />
            </label>
            <label>
              Workday end time
              <input
                type="time"
                defaultValue={data.settings.workday_end || "16:00"}
                disabled={!signedIn}
                onBlur={(event) => saveWorkdaySetting("workday_end", event.target.value)}
              />
            </label>
            <label>
              Buffer time between a guest&apos;s activities
              <input
                type="number"
                min="0"
                max="30"
                defaultValue={data.settings.buffer_minutes}
                disabled={!signedIn}
                onBlur={(event) => saveBuffer(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="admin-actions">
            <button
              className="secondary-button"
              disabled={!signedIn}
              onClick={() => resetDay(true)}
            >
              <RotateCcw size={18} />
              Reset demo data
            </button>
            <button className="danger-button" disabled={!signedIn} onClick={() => resetDay(false)}>
              Reset daily schedule
            </button>
            <button className="secondary-button" disabled={!signedIn} onClick={clearActive}>
              Clear active guests
            </button>
          </div>
        </div>
      </div>

      <form className="card-panel kiosk-customization-panel" onSubmit={saveKioskCustomization}>
        <div className="analytics-heading">
          <div>
            <h2>
              <Palette size={24} />
              Customization of Kiosk
            </h2>
            <p>
              Rename the kiosk and adjust the main colors so this system can fit another shelter or
              community site.
            </p>
          </div>
          <div className="customization-actions">
            <button
              className="secondary-button compact-button"
              type="button"
              disabled={!signedIn}
              onClick={resetCustomizationDraft}
            >
              Reset defaults
            </button>
            <button className="primary-button compact-button" disabled={!signedIn} type="submit">
              <Save size={18} />
              Save customization
            </button>
          </div>
        </div>

        <div className="customization-guide" aria-label="How to customize the kiosk">
          {customizationGuideCards.map((card) => (
            <div className="customization-guide-card" key={card.title}>
              <CustomizationIllustration type={card.art} />
              <strong>{card.title}</strong>
              <span>{card.text}</span>
            </div>
          ))}
        </div>

        <div className="customization-layout">
          <div className="customization-fields">
            {kioskTextSections.map((section) => (
              <section className="customization-step-section" id={section.id} key={section.id}>
                <div className="customization-section-heading">
                  <CustomizationIllustration type={section.art} />
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.helper}</p>
                  </div>
                </div>
                <div className="customization-text-grid">
                  {section.fields.map((field) => (
                    <label key={field.key} className={field.multiline ? "is-wide" : ""}>
                      {field.label}
                      {field.multiline ? (
                        <textarea
                          value={customizationDraft[field.key]}
                          disabled={!signedIn}
                          maxLength={260}
                          rows={3}
                          onChange={(event) =>
                            updateCustomizationDraft(field.key, event.target.value)
                          }
                        />
                      ) : (
                        <input
                          value={customizationDraft[field.key]}
                          disabled={!signedIn}
                          maxLength={120}
                          onChange={(event) =>
                            updateCustomizationDraft(field.key, event.target.value)
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="customization-side">
            <section className="customization-step-section">
              <div className="customization-section-heading">
                <CustomizationIllustration type="colors" />
                <div>
                  <h3>Kiosk colors</h3>
                  <p>
                    Use these to match another shelter&apos;s colors or keep the Listening House
                    style.
                  </p>
                </div>
              </div>
              <div className="customization-color-grid">
                {kioskColorFields.map((field) => (
                  <label key={field.key} className="color-setting-row">
                    <span>{field.label}</span>
                    <input
                      type="color"
                      value={customizationDraft[field.key]}
                      disabled={!signedIn}
                      onChange={(event) => updateCustomizationDraft(field.key, event.target.value)}
                    />
                    <input
                      type="text"
                      value={customizationDraft[field.key]}
                      disabled={!signedIn}
                      maxLength={7}
                      onChange={(event) => updateCustomizationDraft(field.key, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </section>

            <KioskCustomizationPreview
              customizationDraft={customizationDraft}
              kioskPreviewStyle={kioskPreviewStyle}
            />
          </div>
        </div>
      </form>

      <div className="card-panel admin-security-panel">
        <div className="analytics-heading">
          <div>
            <h2>
              <KeyRound size={24} />
              Admin PIN
            </h2>
            <p>Update the local admin PIN after signing in.</p>
          </div>
        </div>
        <div className="admin-security-grid">
          <form className="security-form" onSubmit={saveNewAdminPin}>
            <h3>Change PIN</h3>
            <label>
              Current PIN
              <input
                ref={currentPinRef}
                type="password"
                name="current_pin"
                disabled={!signedIn}
                maxLength={12}
                onInput={(event) => {
                  const cleanValue = cleanPinInput(event);
                  setPinDraft((current) => ({
                    ...current,
                    currentPin: cleanValue
                  }));
                }}
                inputMode="numeric"
              />
            </label>
            <label>
              New PIN
              <input
                ref={newPinRef}
                type="password"
                name="new_pin"
                disabled={!signedIn}
                maxLength={12}
                onInput={(event) => {
                  const cleanValue = cleanPinInput(event);
                  setPinDraft((current) => ({
                    ...current,
                    newPin: cleanValue
                  }));
                }}
                inputMode="numeric"
              />
            </label>
            <label>
              Confirm new PIN
              <input
                ref={confirmPinRef}
                type="password"
                name="confirm_pin"
                disabled={!signedIn}
                maxLength={12}
                onInput={(event) => {
                  const cleanValue = cleanPinInput(event);
                  setPinDraft((current) => ({
                    ...current,
                    confirmPin: cleanValue
                  }));
                }}
                inputMode="numeric"
              />
            </label>
            <button
              className="primary-button"
              type="button"
              disabled={!signedIn || savingPin}
              onClick={saveNewAdminPin}
            >
              {savingPin ? "Saving..." : "Save new PIN"}
            </button>
          </form>
        </div>
      </div>

      <div className="card-panel analytics-panel">
        <div className="analytics-heading">
          <div>
            <h2>
              <BarChart3 size={24} />
              Data & Analytics
            </h2>
            <p>
              Track which supports are used most often and export a spreadsheet for a day, week,
              month, or year.
            </p>
          </div>
          <button
            className="primary-button compact-button"
            disabled={!signedIn || exporting}
            onClick={exportAnalytics}
          >
            <Download size={18} />
            {exporting ? "Creating..." : "Export Excel"}
          </button>
        </div>

        <div className="analytics-controls">
          <div className="period-tabs" role="tablist" aria-label="Analytics period">
            {["day", "week", "month", "year"].map((period) => (
              <button
                key={period}
                className={analyticsPeriod === period ? "is-active" : ""}
                disabled={!signedIn}
                onClick={() => setAnalyticsPeriod(period)}
                type="button"
              >
                {period}
              </button>
            ))}
          </div>
          <label>
            Report date
            <input
              type="date"
              value={analyticsDate}
              disabled={!signedIn}
              onInput={(event) => setAnalyticsDate(event.currentTarget.value)}
            />
          </label>
        </div>
        {lastExportUrl ? (
          <div className="download-fallback-panel">
            <button
              className="download-fallback-link"
              type="button"
              onClick={() => window.location.assign(lastExportUrl)}
            >
              Download Excel now
            </button>
            <span>{lastExportFilename}</span>
          </div>
        ) : null}

        {!signedIn ? (
          <p className="analytics-empty">Unlock admin access to view and export analytics.</p>
        ) : analyticsLoading ? (
          <p className="analytics-empty">Loading analytics...</p>
        ) : analytics ? (
          <>
            <div className="analytics-range">{analytics.label}</div>
            <div className="analytics-summary">
              <AnalyticsStat label="Guests checked in" value={analytics.summary.guestsCheckedIn} />
              <AnalyticsStat label="Different people" value={analytics.summary.uniqueKnownGuests} />
              <AnalyticsStat label="Activity requests" value={analytics.summary.activityRequests} />
              <AnalyticsStat label="Completed" value={analytics.summary.completedActivities} />
              <AnalyticsStat label="Skipped" value={analytics.summary.skippedActivities} />
              <AnalyticsStat
                label="Most used"
                value={analytics.summary.mostRequestedActivity}
                wide
              />
            </div>

            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Requests</th>
                    <th>Guests</th>
                    <th>Waiting</th>
                    <th>In Progress</th>
                    <th>Completed</th>
                    <th>Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.activityTotals.length === 0 ? (
                    <tr>
                      <td colSpan="7">No activity data for this report period yet.</td>
                    </tr>
                  ) : null}
                  {analytics.activityTotals.map((item) => (
                    <tr key={item.activity}>
                      <td>{item.activity}</td>
                      <td>{item.requests}</td>
                      <td>{item.uniqueGuests}</td>
                      <td>{item.waiting}</td>
                      <td>{item.inProgress}</td>
                      <td>{item.completed}</td>
                      <td>{item.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="analytics-subheading">People in this report</h3>
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Guest name</th>
                    <th>Check-ins</th>
                    <th>Days visited</th>
                    <th>Visit dates</th>
                    <th>Activities requested</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.people.length === 0 ? (
                    <tr>
                      <td colSpan="5">No guest check-ins for this report period.</td>
                    </tr>
                  ) : null}
                  {analytics.people.map((person) => (
                    <tr key={person.guestId}>
                      <td>{person.guestName}</td>
                      <td>{person.checkIns}</td>
                      <td>{person.daysVisited}</td>
                      <td>{person.visitDates}</td>
                      <td>{person.activities || "No activities recorded"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>

      <div className="card-panel activity-admin">
        <h2>Activities</h2>
        <p>
          Add a service, then independently choose calendar time, a daily quantity limit, a
          countdown alarm, available hours, monthly dates, yearly dates, or any combination.
        </p>
        <form
          className="add-activity activity-config-card is-new"
          data-testid="add-activity-form"
          onSubmit={addActivity}
        >
          <div className="activity-config-heading">
            <div>
              <strong>Add a new activity</strong>
              <p>Create it here first. It will appear in the activity list immediately.</p>
            </div>
          </div>
          <div className="activity-config-grid">
            <label>
              Activity name
              <input
                placeholder="New activity name"
                value={newActivity.name}
                disabled={!signedIn}
                onChange={(event) =>
                  setNewActivity((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              Icon
              <ActivityIconPicker
                value={newActivity.icon}
                disabled={!signedIn}
                onChange={(icon) =>
                  setNewActivity((current) => ({
                    ...current,
                    icon
                  }))
                }
              />
            </label>
          </div>
          <ActivityOptionFields
            draft={newActivity}
            disabled={!signedIn}
            onChange={setNewActivity}
          />
          <button
            className="primary-button add-activity-submit"
            type="submit"
            disabled={!signedIn || addingActivity || !newActivity.name.trim()}
          >
            <Plus size={18} />
            {addingActivity ? "Adding activity..." : "Add activity"}
          </button>
        </form>
        <div className="activity-admin-list">
          {data.activities.map((activity) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              disabled={!signedIn}
              onSave={saveActivity}
              onDelete={deleteActivity}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ActivityRow({ activity, disabled, onSave, onDelete }) {
  const [draft, setDraft] = useState(activity);

  useEffect(() => setDraft(activity), [activity]);

  return (
    <div className="activity-config-card">
      <div className="activity-config-heading">
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={Boolean(draft.active)}
            disabled={disabled}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          Active
        </label>
        <div className="activity-config-actions">
          <button
            className="icon-button"
            type="button"
            disabled={disabled}
            onClick={() => onSave(draft)}
            title="Save activity"
          >
            <Save size={18} />
          </button>
          <button
            className="icon-button delete-activity-button"
            type="button"
            disabled={disabled}
            onClick={() => onDelete(activity)}
            title={`Delete ${activity.name}`}
            aria-label={`Delete ${activity.name}`}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <div className="activity-config-grid">
        <label>
          Activity name
          <input
            value={draft.name}
            disabled={disabled}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label>
          Icon
          <ActivityIconPicker
            value={draft.icon || "heart-hand"}
            disabled={disabled}
            onChange={(icon) => setDraft((current) => ({ ...current, icon }))}
          />
        </label>
      </div>
      <ActivityOptionFields draft={draft} disabled={disabled} onChange={setDraft} />
      <div className="activity-usage-note">
        Used today: <strong>{activity.daily_used || 0}</strong>
        {activity.daily_limit_enabled ? ` of ${activity.daily_limit}` : ""}
      </div>
    </div>
  );
}

function ActivityIconPicker({ value, disabled, onChange }) {
  const selected =
    ACTIVITY_ICON_OPTIONS.find((option) => option.name === value) ||
    ACTIVITY_ICON_OPTIONS.find((option) => option.name === "heart-hand");

  return (
    <details className="activity-icon-picker">
      <summary aria-label={`Choose icon. Current icon: ${selected.label}`}>
        <ActivityIcon name={selected.name} />
        <span>{selected.label}</span>
      </summary>
      <div className="activity-icon-options" role="group" aria-label="Activity icon choices">
        {ACTIVITY_ICON_OPTIONS.map((option) => (
          <button
            type="button"
            className={option.name === value ? "is-selected" : ""}
            disabled={disabled}
            key={option.name}
            onClick={(event) => {
              onChange(option.name);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
            title={option.label}
            aria-label={`Use ${option.label} icon`}
          >
            <ActivityIcon name={option.name} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function ActivityOptionFields({ draft, disabled, onChange }) {
  const yearlyStart = splitMonthDay(draft.yearly_start, "01-01");
  const yearlyEnd = splitMonthDay(draft.yearly_end, "12-31");

  function update(key, value) {
    onChange((current) => ({ ...current, [key]: value }));
  }

  function updateYearlyDate(key, currentValue, part, value) {
    const current = splitMonthDay(currentValue, key === "yearly_start" ? "01-01" : "12-31");
    const month = part === "month" ? value : current.month;
    const maxDay = daysInMonth(month);
    const day = Math.min(maxDay, Math.max(1, part === "day" ? Number(value) : current.day));
    update(key, `${month}-${String(day).padStart(2, "0")}`);
  }

  return (
    <div className="activity-option-grid">
      <section>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={Boolean(draft.time_limit_enabled)}
            disabled={disabled}
            onChange={(event) => update("time_limit_enabled", event.target.checked)}
          />
          Use calendar time
        </label>
        {draft.time_limit_enabled ? (
          <label>
            Minutes per guest
            <input
              type="number"
              min="1"
              max="480"
              value={draft.duration_minutes}
              disabled={disabled}
              onChange={(event) => update("duration_minutes", Number(event.target.value))}
            />
          </label>
        ) : (
          <p>Requests appear in the untimed service queue.</p>
        )}
      </section>

      <section>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={Boolean(draft.daily_limit_enabled)}
            disabled={disabled}
            onChange={(event) => update("daily_limit_enabled", event.target.checked)}
          />
          Limit quantity per day
        </label>
        {draft.daily_limit_enabled ? (
          <label>
            Maximum guests per day
            <input
              type="number"
              min="1"
              max="1000"
              value={draft.daily_limit || 1}
              disabled={disabled}
              onChange={(event) => update("daily_limit", Number(event.target.value))}
            />
          </label>
        ) : (
          <p>No daily quantity limit.</p>
        )}
      </section>

      <section className={!draft.time_limit_enabled ? "is-disabled" : ""}>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={Boolean(draft.alarm_enabled)}
            disabled={disabled || !draft.time_limit_enabled}
            onChange={(event) => update("alarm_enabled", event.target.checked)}
          />
          Staff timer alert
        </label>
        {draft.time_limit_enabled && draft.alarm_enabled ? (
          <label>
            Alert this many minutes before the end
            <input
              type="number"
              min="1"
              max={Math.max(1, Number(draft.duration_minutes || 1))}
              value={draft.alarm_minutes_before || 5}
              disabled={disabled}
              onChange={(event) => update("alarm_minutes_before", Number(event.target.value))}
            />
          </label>
        ) : (
          <p>Starts when staff marks the activity In Progress and warns near the end.</p>
        )}
      </section>

      <section>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={Boolean(draft.availability_window_enabled)}
            disabled={disabled}
            onChange={(event) => update("availability_window_enabled", event.target.checked)}
          />
          Available during certain hours
        </label>
        {draft.availability_window_enabled ? (
          <>
            <div className="activity-hours-grid">
              <label>
                Activity starts
                <input
                  type="time"
                  value={draft.availability_start || "08:00"}
                  disabled={disabled}
                  onInput={(event) => update("availability_start", event.currentTarget.value)}
                />
              </label>
              <label>
                Activity ends
                <input
                  type="time"
                  value={draft.availability_end || "16:00"}
                  disabled={disabled}
                  onInput={(event) => update("availability_end", event.currentTarget.value)}
                />
              </label>
            </div>
            <p>Outside these hours, guests cannot select this activity.</p>
          </>
        ) : (
          <p>Available throughout the configured workday.</p>
        )}
      </section>

      <section>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={Boolean(draft.monthly_window_enabled)}
            disabled={disabled}
            onChange={(event) => update("monthly_window_enabled", event.target.checked)}
          />
          Choose certain days during each month
        </label>
        {draft.monthly_window_enabled ? (
          <>
            <div className="activity-hours-grid">
              <label>
                Opens on day
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={draft.monthly_start_day || 1}
                  disabled={disabled}
                  onChange={(event) => update("monthly_start_day", Number(event.target.value))}
                />
              </label>
              <label>
                Closes after day
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={draft.monthly_end_day || 31}
                  disabled={disabled}
                  onChange={(event) => update("monthly_end_day", Number(event.target.value))}
                />
              </label>
            </div>
            <p>This repeats every month. A range such as 25 to 5 continues into the next month.</p>
          </>
        ) : (
          <p>Available on every day of the month.</p>
        )}
      </section>

      <section>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={Boolean(draft.yearly_window_enabled)}
            disabled={disabled}
            onChange={(event) => update("yearly_window_enabled", event.target.checked)}
          />
          Choose a certain time throughout the year
        </label>
        {draft.yearly_window_enabled ? (
          <>
            <div className="activity-date-range-grid">
              <fieldset>
                <legend>Opens each year</legend>
                <label>
                  Month
                  <select
                    value={yearlyStart.month}
                    disabled={disabled}
                    onChange={(event) =>
                      updateYearlyDate(
                        "yearly_start",
                        draft.yearly_start,
                        "month",
                        event.target.value
                      )
                    }
                  >
                    {monthOptions.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Day
                  <input
                    type="number"
                    min="1"
                    max={daysInMonth(yearlyStart.month)}
                    value={yearlyStart.day}
                    disabled={disabled}
                    onChange={(event) =>
                      updateYearlyDate(
                        "yearly_start",
                        draft.yearly_start,
                        "day",
                        event.target.value
                      )
                    }
                  />
                </label>
              </fieldset>
              <fieldset>
                <legend>Closes after</legend>
                <label>
                  Month
                  <select
                    value={yearlyEnd.month}
                    disabled={disabled}
                    onChange={(event) =>
                      updateYearlyDate("yearly_end", draft.yearly_end, "month", event.target.value)
                    }
                  >
                    {monthOptions.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Day
                  <input
                    type="number"
                    min="1"
                    max={daysInMonth(yearlyEnd.month)}
                    value={yearlyEnd.day}
                    disabled={disabled}
                    onChange={(event) =>
                      updateYearlyDate("yearly_end", draft.yearly_end, "day", event.target.value)
                    }
                  />
                </label>
              </fieldset>
            </div>
            <p>This date range repeats automatically every year.</p>
          </>
        ) : (
          <p>Available throughout the year.</p>
        )}
      </section>
    </div>
  );
}

function AnalyticsStat({ label, value, wide = false }) {
  return (
    <div className={`analytics-stat ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function KioskCustomizationPreview({ customizationDraft, kioskPreviewStyle }) {
  const [pageIndex, setPageIndex] = useState(0);
  const page = kioskPreviewPages[pageIndex];

  function movePage(direction) {
    setPageIndex(
      (current) => (current + direction + kioskPreviewPages.length) % kioskPreviewPages.length
    );
  }

  return (
    <div className="kiosk-customization-preview" style={kioskPreviewStyle}>
      <div className="preview-heading">
        <CustomizationIllustration type="preview" />
        <div>
          <h3>Live preview</h3>
          <p>Use the arrows to walk through each kiosk screen before saving.</p>
        </div>
      </div>

      <div className="preview-page-controls">
        <button
          type="button"
          onClick={() => movePage(-1)}
          aria-label="Show previous kiosk preview page"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <strong>{page.label}</strong>
          <span>
            {pageIndex + 1} of {kioskPreviewPages.length}
          </span>
        </div>
        <button type="button" onClick={() => movePage(1)} aria-label="Show next kiosk preview page">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className={`preview-screen is-${page.id}`}>
        <KioskPreviewPage pageId={page.id} customizationDraft={customizationDraft} />
      </div>

      <div className="preview-page-dots" aria-label="Kiosk preview pages">
        {kioskPreviewPages.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={index === pageIndex ? "is-active" : ""}
            onClick={() => setPageIndex(index)}
            aria-label={`Show ${item.label} preview`}
            aria-current={index === pageIndex ? "step" : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function KioskPreviewPage({ pageId, customizationDraft }) {
  if (pageId === "identity") {
    return (
      <div className="preview-page">
        <strong>{customizationDraft.kiosk_name_entry_title}</strong>
        <div className="preview-name-grid">
          <span>First name</span>
          <span>Last name</span>
        </div>
        <button type="button">Continue</button>
      </div>
    );
  }

  if (pageId === "language") {
    return (
      <div className="preview-page">
        <strong>{customizationDraft.kiosk_language_title}</strong>
        <div className="preview-language-grid">
          <span>English</span>
          <span>Spanish</span>
          <span>Hmong</span>
          <span>Somali</span>
        </div>
      </div>
    );
  }

  if (pageId === "activities") {
    return (
      <div className="preview-page">
        <strong>{customizationDraft.kiosk_activity_title}</strong>
        <span>{customizationDraft.kiosk_activity_subtitle}</span>
        <div className="preview-activity-grid">
          <span>
            Shower<small>30 min</small>
          </span>
          <span className="is-selected">
            Meal / Snacks<small>20 min</small>
          </span>
          <span>
            Phone Charging<small>20 min</small>
          </span>
          <span>
            Laundry<small>45 min</small>
          </span>
        </div>
      </div>
    );
  }

  if (pageId === "confirmation") {
    return (
      <div className="preview-page">
        <div className="preview-guest-name">Jordan Lee</div>
        <strong>{customizationDraft.kiosk_confirmation_message}</strong>
        <div className="preview-confirmation-list">
          <span>Shower</span>
          <span>Meal / Snacks</span>
        </div>
        <button type="button">{customizationDraft.kiosk_finish_button}</button>
      </div>
    );
  }

  return (
    <div className="preview-page">
      <div className="preview-symbol">
        <Palette size={28} />
      </div>
      <strong>{customizationDraft.kiosk_welcome_title}</strong>
      <span>{customizationDraft.kiosk_welcome_subtitle}</span>
      <div className="preview-welcome-actions">
        <button type="button">{customizationDraft.kiosk_check_in_button}</button>
      </div>
    </div>
  );
}

function CustomizationIllustration({ type }) {
  const scene = {
    name: (
      <>
        <rect x="18" y="32" width="86" height="54" rx="4" />
        <path d="M28 66h66M32 53h24M64 53h20" />
        <path d="M37 31v-8h48v8" />
      </>
    ),
    words: (
      <>
        <rect x="20" y="25" width="82" height="62" rx="5" />
        <path d="M32 43h48M32 56h60M32 69h36" />
        <circle cx="88" cy="74" r="7" />
      </>
    ),
    choices: (
      <>
        <rect x="18" y="28" width="38" height="26" rx="4" />
        <rect x="66" y="28" width="38" height="26" rx="4" />
        <rect x="18" y="64" width="38" height="26" rx="4" />
        <rect x="66" y="64" width="38" height="26" rx="4" />
        <path d="M77 77l7 7 14-18" />
      </>
    ),
    support: (
      <>
        <path d="M30 61c0-19 15-34 34-34s34 15 34 34-15 34-34 34-34-15-34-34z" />
        <path d="M43 61c0-12 9-21 21-21s21 9 21 21-9 21-21 21-21-9-21-21z" />
        <path d="M55 61h18" />
        <path d="M36 25l-9-9M91 25l9-9" />
      </>
    ),
    colors: (
      <>
        <circle cx="43" cy="44" r="19" />
        <circle cx="76" cy="44" r="19" />
        <circle cx="60" cy="73" r="19" />
        <path d="M78 77h24l-8 12H70z" />
      </>
    ),
    preview: (
      <>
        <rect x="18" y="24" width="86" height="66" rx="5" />
        <rect x="30" y="36" width="62" height="22" rx="3" />
        <path d="M36 72h50" />
        <path d="M48 83h26" />
      </>
    )
  };

  return (
    <svg
      className={`customization-illustration is-${type}`}
      viewBox="0 0 120 112"
      aria-hidden="true"
    >
      {scene[type] || scene.preview}
    </svg>
  );
}
