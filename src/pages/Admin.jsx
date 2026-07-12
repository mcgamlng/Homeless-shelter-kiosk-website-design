import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Globe2,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  MonitorX,
  Palette,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  Volume2,
  Wifi
} from "lucide-react";
import { api } from "../api.js";
import {
  DEFAULT_KIOSK_CUSTOMIZATION,
  getKioskCssVariables,
  getKioskCustomization
} from "../../shared/kioskCustomization.js";
import { buildActivityTranslations } from "../../shared/activityTranslations.js";
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

function formatWorkdayTime(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value || "";
  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
}

function formatWorkdayRange(settings = {}) {
  const start = settings.workday_start || "08:00";
  const end = settings.workday_end || "16:00";
  return `${formatWorkdayTime(start)} to ${formatWorkdayTime(end)}`;
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
  { id: "language", label: "Language" },
  { id: "identity", label: "Name" },
  { id: "activities", label: "Activities" },
  { id: "confirmation", label: "Confirmation" }
];

function cloneDefaultCustomization() {
  return { ...DEFAULT_KIOSK_CUSTOMIZATION };
}

function createNetworkDraft(network = {}) {
  return {
    mode: network.mode === "public" ? "public" : "local",
    preferred_local_url: network.preferred_local_url || "",
    public_base_url: network.public_base_url || ""
  };
}

function createNewActivityDraft() {
  return {
    name: "",
    name_es: "",
    name_hmn: "",
    name_so: "",
    duration_minutes: 20,
    time_limit_enabled: true,
    availability_window_enabled: false,
    availability_start: "08:00",
    availability_end: "16:00",
    weekly_window_enabled: false,
    weekly_days: "0,1,2,3,4,5,6",
    monthly_window_enabled: false,
    monthly_start_day: 1,
    monthly_end_day: 31,
    yearly_window_enabled: false,
    yearly_start: "01-01",
    yearly_end: "12-31",
    daily_limit_enabled: false,
    daily_limit: 10,
    waitlist_enabled: false,
    confirmed_spots: 0,
    waitlist_spots: 0,
    alarm_enabled: false,
    alarm_minutes_before: 5,
    icon: "heart-hand",
    active: true
  };
}

function createDataDeletionDraft(settings = {}) {
  return {
    enabled: Boolean(settings.enabled),
    month_day: settings.month_day || "01-01",
    time: settings.time || "03:00"
  };
}

function createStaffUserDraft() {
  return {
    display_name: "",
    pin: "",
    permissions: {
      dashboard: true,
      admin: false,
      about: false,
      admin_excel: false,
      admin_customization: false,
      admin_activities: false,
      admin_it: false
    },
    active: true
  };
}

const pagePermissionOptions = [
  ["dashboard", "Dashboard"],
  ["about", "About Page"]
];

const adminSectionPermissionOptions = [
  ["admin_excel", "Excel spreadsheets"],
  ["admin_customization", "Page customization"],
  ["admin_activities", "Activity customization"],
  ["admin_it", "IT tools"]
];

const adminSectionConfig = {
  excel: {
    title: "Excel spreadsheets",
    heading: "Excel spreadsheets",
    description: "Review analytics, download spreadsheets, and manage yearly data deletion.",
    permissionName: "Excel spreadsheets",
    permissionKey: "admin_excel"
  },
  customization: {
    title: "Page customization",
    heading: "Page customization",
    description: "Change kiosk wording, colors, live preview, and About-page inventor contacts.",
    permissionName: "Page customization",
    permissionKey: "admin_customization"
  },
  activities: {
    title: "Activity customization",
    heading: "Activity customization",
    description: "Set schedules, service limits, activity availability, resets, and alerts.",
    permissionName: "Activity customization",
    permissionKey: "admin_activities"
  },
  it: {
    title: "IT tools",
    heading: "IT tools",
    description: "Set phone access, read-aloud voices, Raspberry Pi controls, and staff access.",
    permissionName: "IT tools",
    permissionKey: "admin_it"
  }
};

function normalizePermissionToggle(permissions, permission, checked) {
  const next = { ...permissions, [permission]: checked };
  if (permission === "admin" && !checked) {
    adminSectionPermissionOptions.forEach(([key]) => {
      next[key] = false;
    });
  }
  if (permission.startsWith("admin_") && checked) {
    next.admin = true;
  }
  if (permission.startsWith("admin_")) {
    next.admin =
      checked || adminSectionPermissionOptions.some(([key]) => key !== permission && next[key]);
  }
  return next;
}

const piMaintenanceCommands = {
  update: "cd ~/listening-house-project && ./scripts/raspberry-pi/update-from-github.sh",
  exitKiosk: "pkill -f '(^|/)(chromium|chromium-browser).*--kiosk.*(:3000/kiosk|/kiosk)'",
  openKiosk: "cd ~/listening-house-project && ./scripts/raspberry-pi/start-kiosk.sh",
  reboot: "sudo reboot"
};

function updateActivityNameDraft(current, name) {
  return {
    ...current,
    name,
    ...buildActivityTranslations(name)
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

const weekDayOptions = [
  ["0", "Sunday"],
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"]
];

function splitMonthDay(value, fallback = "01-01") {
  const match = String(value || fallback).match(/^(\d{2})-(\d{2})$/);
  return match ? { month: match[1], day: Number(match[2]) } : splitMonthDay(fallback);
}

function daysInMonth(month) {
  return new Date(2000, Number(month), 0).getDate();
}

export default function Admin({ section = "activities" }) {
  const currentPinRef = useRef(null);
  const newPinRef = useRef(null);
  const confirmPinRef = useRef(null);
  const analyticsRequestRef = useRef(0);
  const [pin, setPin] = useState("");
  const [token, setToken] = useState(sessionStorage.getItem("lh-admin-token") || "");
  const [staffSession, setStaffSession] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("lh-staff-user") || "null");
    } catch {
      return null;
    }
  });
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
  const [accessInfo, setAccessInfo] = useState(null);
  const [networkDraft, setNetworkDraft] = useState(createNetworkDraft);
  const [networkStatus, setNetworkStatus] = useState("");
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [speechStatus, setSpeechStatus] = useState(null);
  const [speechStatusMessage, setSpeechStatusMessage] = useState("");
  const [dataDeletionSettings, setDataDeletionSettings] = useState(null);
  const [dataDeletionDraft, setDataDeletionDraft] = useState(createDataDeletionDraft);
  const [dataDeletionMessage, setDataDeletionMessage] = useState("");
  const [savingDataDeletion, setSavingDataDeletion] = useState(false);
  const [runningDataDeletion, setRunningDataDeletion] = useState(false);
  const [staffUsers, setStaffUsers] = useState([]);
  const [staffUserDraft, setStaffUserDraft] = useState(createStaffUserDraft);
  const [staffUserMessage, setStaffUserMessage] = useState("");
  const [savingStaffUser, setSavingStaffUser] = useState(false);
  const [speechPreloadMessage, setSpeechPreloadMessage] = useState("");
  const [preloadingSpeech, setPreloadingSpeech] = useState(false);
  const [systemControlMessage, setSystemControlMessage] = useState("");
  const [runningSystemAction, setRunningSystemAction] = useState("");
  const kioskPreviewStyle = useMemo(
    () => getKioskCssVariables({ customization: customizationDraft }),
    [customizationDraft]
  );

  const signedIn = Boolean(token && adminVerified);
  const activeSection = adminSectionConfig[section] ? section : "activities";
  const sectionInfo = adminSectionConfig[activeSection];
  const sessionPermissions = staffSession?.permissions || {};
  const isOwnerAdmin = Boolean(staffSession?.owner);
  const canUseExcel = isOwnerAdmin || Boolean(sessionPermissions.admin_excel);
  const canUseCustomization = isOwnerAdmin || Boolean(sessionPermissions.admin_customization);
  const canUseActivities = isOwnerAdmin || Boolean(sessionPermissions.admin_activities);
  const canUseIt = isOwnerAdmin || Boolean(sessionPermissions.admin_it);
  const canManageUsers = isOwnerAdmin;
  const canUseActiveSection =
    !signedIn || isOwnerAdmin || Boolean(sessionPermissions[sectionInfo.permissionKey]);

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
    if (canUseExcel) {
      loadAnalytics(token);
      loadDataDeletionTools(token);
    } else {
      setAnalytics(null);
      setDataDeletionSettings(null);
    }
    if (canManageUsers) {
      loadStaffUsers(token);
    } else {
      setStaffUsers([]);
    }
  }, [signedIn, token, analyticsPeriod, analyticsDate, canUseExcel, canManageUsers]);

  useEffect(() => {
    if (data?.settings) {
      setCustomizationDraft(getKioskCustomization(data.settings));
      setNetworkDraft(createNetworkDraft(data.settings.network));
    }
  }, [data?.settings]);

  useEffect(() => {
    refreshNetworkInfo(false);
    refreshSpeechStatus(false);
  }, []);

  const mostRequested = useMemo(() => data?.totals.mostRequestedActivities || [], [data]);

  async function login(event) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await api.adminLogin(pin, { permission: "admin", path: "/admin" });
      sessionStorage.setItem("lh-admin-token", response.token);
      sessionStorage.setItem("lh-staff-user", JSON.stringify(response.user));
      window.dispatchEvent(new CustomEvent("lh:staff-session-updated", { detail: response.user }));
      setAdminVerified(false);
      setStaffSession(response.user);
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
      const session = await api.getStaffSession(authToken, "admin");
      setStaffSession(session.user);
      sessionStorage.setItem("lh-staff-user", JSON.stringify(session.user));
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
      sessionStorage.removeItem("lh-staff-user");
      window.dispatchEvent(new CustomEvent("lh:staff-session-updated", { detail: null }));
      setToken("");
      setStaffSession(null);
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
      const freshSession = await api.adminLogin(currentPinValue, {
        permission: "admin",
        path: "/admin"
      });
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
    sessionStorage.removeItem("lh-staff-user");
    window.dispatchEvent(new CustomEvent("lh:staff-session-updated", { detail: null }));
    setToken("");
    setStaffSession(null);
    setAdminVerified(false);
    setAnalytics(null);
    setPinDraft({ currentPin: "", newPin: "", confirmPin: "" });
    setPin("");
    setMessage("Admin PIN changed. Please sign in with the new PIN.");
  }

  function signOutAdmin() {
    sessionStorage.removeItem("lh-admin-token");
    sessionStorage.removeItem("lh-staff-user");
    window.dispatchEvent(new CustomEvent("lh:staff-session-updated", { detail: null }));
    setToken("");
    setStaffSession(null);
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

  async function loadDataDeletionTools(authToken = token) {
    try {
      const settings = await api.getDataDeletionSettings(authToken);
      setDataDeletionSettings(settings);
      setDataDeletionDraft(createDataDeletionDraft(settings));
    } catch (err) {
      handleAdminError(err, authToken);
    }
  }

  function updateDataDeletionDraft(key, value) {
    setDataDeletionDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveDataDeletionSettings(event) {
    event.preventDefault();
    setDataDeletionMessage("");
    const authToken = currentAdminToken();
    setSavingDataDeletion(true);
    try {
      const settings = await api.updateDataDeletionSettings(authToken, dataDeletionDraft);
      setDataDeletionSettings(settings);
      setDataDeletionDraft(createDataDeletionDraft(settings));
      setDataDeletionMessage("Yearly deletion settings saved.");
    } catch (err) {
      handleAdminError(err, authToken);
      setDataDeletionMessage(err.message);
    } finally {
      setSavingDataDeletion(false);
    }
  }

  async function runDataDeletionNow() {
    if (
      !window.confirm(
        "Delete all guest names, check-ins, activity history, and spreadsheet archives now? Staff users and app settings will stay."
      )
    ) {
      return;
    }
    setDataDeletionMessage("");
    const authToken = currentAdminToken();
    setRunningDataDeletion(true);
    try {
      const result = await api.runYearlyDataDeletion(authToken);
      setDataDeletionSettings(result.settings);
      setDataDeletionDraft(createDataDeletionDraft(result.settings));
      setDataDeletionMessage(
        `Deleted ${result.deleted.guests} guest profiles, ${result.deleted.checkIns} check-ins, and ${result.deleted_export_files} spreadsheet files.`
      );
      await refresh();
    } catch (err) {
      handleAdminError(err, authToken);
      setDataDeletionMessage(err.message);
    } finally {
      setRunningDataDeletion(false);
    }
  }

  async function loadStaffUsers(authToken = token) {
    try {
      setStaffUsers(await api.getStaffUsers(authToken));
    } catch (err) {
      handleAdminError(err, authToken);
    }
  }

  function updateStaffUserDraft(key, value) {
    setStaffUserDraft((current) => ({ ...current, [key]: value }));
  }

  function updateStaffPermissionDraft(permission, checked) {
    setStaffUserDraft((current) => ({
      ...current,
      permissions: normalizePermissionToggle(current.permissions, permission, checked)
    }));
  }

  async function addStaffUser(event) {
    event.preventDefault();
    setStaffUserMessage("");
    const authToken = currentAdminToken();
    setSavingStaffUser(true);
    try {
      await api.createStaffUser(authToken, staffUserDraft);
      setStaffUserDraft(createStaffUserDraft());
      setStaffUsers(await api.getStaffUsers(authToken));
      setStaffUserMessage("Staff user added.");
    } catch (err) {
      handleAdminError(err, authToken);
      setStaffUserMessage(err.message);
    } finally {
      setSavingStaffUser(false);
    }
  }

  async function updateStaffUser(user, changes) {
    const authToken = currentAdminToken();
    setStaffUserMessage("");
    try {
      await api.updateStaffUser(authToken, user.id, changes);
      setStaffUsers(await api.getStaffUsers(authToken));
      setStaffUserMessage("Staff user updated.");
    } catch (err) {
      handleAdminError(err, authToken);
      setStaffUserMessage(err.message);
    }
  }

  async function deleteStaffUser(user) {
    if (!window.confirm(`Delete staff user ${user.display_name}?`)) return;
    const authToken = currentAdminToken();
    setStaffUserMessage("");
    try {
      await api.deleteStaffUser(authToken, user.id);
      setStaffUsers(await api.getStaffUsers(authToken));
      setStaffUserMessage("Staff user deleted.");
    } catch (err) {
      handleAdminError(err, authToken);
      setStaffUserMessage(err.message);
    }
  }

  function buildSpeechPreloadSegments() {
    const languages = ["en", "es", "hmn", "so"];
    const phrases = [
      { key: "welcome_screen", text: "Welcome to Listening House. Start check-in." },
      { key: "identity_screen", text: "Please enter your first and last name." },
      { key: "language_screen", text: "Choose your preferred language." },
      { key: "activities_intro", text: "What do you need today? Choose the support you need." },
      { key: "confirmation_base", text: "Thank you. Please wait for your name to be called." }
    ];
    const activitySegments = (data?.activities || []).map((activity) => ({
      key: `activity_${activity.id}`,
      text: activity.name
    }));
    return languages.flatMap((language) =>
      [...phrases, ...activitySegments].map((segment) => ({
        ...segment,
        language
      }))
    );
  }

  async function preloadSpeech() {
    setSpeechPreloadMessage("");
    setPreloadingSpeech(true);
    const authToken = currentAdminToken();
    try {
      const result = await api.preloadSpeech(authToken, buildSpeechPreloadSegments());
      setSpeechPreloadMessage(
        `Speech preload finished: ${result.ready} ready, ${result.failed} failed.`
      );
      await refreshSpeechStatus(true);
    } catch (err) {
      handleAdminError(err, authToken);
      setSpeechPreloadMessage(err.message);
    } finally {
      setPreloadingSpeech(false);
    }
  }

  function testSpeechLanguage(language) {
    const sampleText = {
      en: "Welcome to Listening House. Please wait for your name to be called.",
      es: "Bienvenido a Listening House. Espere a que llamen su nombre.",
      hmn: "Zoo siab txais tos rau Listening House. Thov tos kom hu koj lub npe.",
      so: "Ku soo dhowow Listening House. Fadlan sug in magacaaga lagu yeero."
    };
    const audio = new Audio(
      `/api/speech/best?${new URLSearchParams({
        language,
        text: sampleText[language]
      }).toString()}`
    );
    audio.play().catch(() => {
      setSpeechPreloadMessage("Speech test could not play in this browser.");
    });
  }

  async function exitKioskScreen() {
    setSystemControlMessage("");
    setRunningSystemAction("exitKiosk");
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
      const result = await api.exitKiosk(currentAdminToken());
      setSystemControlMessage(result.message || "Kiosk exit command sent.");
    } catch (err) {
      setSystemControlMessage(`${err.message} Manual command: ${piMaintenanceCommands.exitKiosk}`);
    } finally {
      setRunningSystemAction("");
    }
  }

  async function runPiSystemAction(action, label, apiCall) {
    setSystemControlMessage("");
    setRunningSystemAction(action);
    try {
      const result = await apiCall(currentAdminToken());
      setSystemControlMessage(result.message || `${label} started.`);
    } catch (err) {
      setSystemControlMessage(`${err.message} Manual command: ${piMaintenanceCommands[action]}`);
    } finally {
      setRunningSystemAction("");
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

  async function applyListeningHouseDefaults() {
    if (
      !window.confirm("Add missing Listening House default services? Custom activities stay saved.")
    ) {
      return;
    }
    setMessage("");
    const authToken = currentAdminToken();
    try {
      const nextData = await api.applyListeningHouseDefaults(authToken);
      setData(nextData);
      setMessage("Listening House default services are ready.");
    } catch (err) {
      handleAdminError(err, authToken);
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

  async function saveFullDayWorkday() {
    setMessage("");
    const authToken = currentAdminToken();
    try {
      await api.updateSettings(authToken, {
        workday_start: "00:00",
        workday_end: "23:59"
      });
      await refresh();
      setMessage("Workday saved as 12:00 AM to 11:59 PM.");
    } catch (err) {
      handleAdminError(err, authToken);
    }
  }

  async function refreshNetworkInfo(showMessage = true) {
    try {
      const info = await api.getAccessInfo();
      setAccessInfo(info);
      setNetworkDraft((current) => ({
        ...current,
        preferred_local_url:
          current.preferred_local_url || info.preferredLocalUrl || info.localBaseUrl || ""
      }));
      if (showMessage) {
        setNetworkStatus(
          info.wifiName
            ? `Connected network detected: ${info.wifiName}`
            : "Network addresses refreshed."
        );
      }
      return info;
    } catch (err) {
      setNetworkStatus(err.message);
      return null;
    }
  }

  async function refreshSpeechStatus(showMessage = true) {
    try {
      const status = await api.getSpeechStatus();
      setSpeechStatus(status);
      if (showMessage) {
        setSpeechStatusMessage("Speech status refreshed.");
      }
      return status;
    } catch (err) {
      setSpeechStatusMessage(err.message);
      return null;
    }
  }

  async function saveNetworkSettings(event) {
    event.preventDefault();
    setNetworkStatus("");
    const authToken = currentAdminToken();
    if (!authToken) {
      setNetworkStatus("Unlock Admin first.");
      return;
    }
    if (networkDraft.mode === "local" && !networkDraft.preferred_local_url) {
      setNetworkStatus("Choose the local Wi-Fi address this server should use.");
      return;
    }
    if (networkDraft.mode === "public" && !networkDraft.public_base_url.trim()) {
      setNetworkStatus("Enter the public HTTPS address before selecting public mode.");
      return;
    }
    if (networkDraft.mode === "public") {
      try {
        if (new URL(networkDraft.public_base_url).protocol !== "https:") {
          setNetworkStatus("Public internet mode requires an HTTPS address.");
          return;
        }
      } catch {
        setNetworkStatus("Enter a valid public HTTPS address.");
        return;
      }
    }

    setSavingNetwork(true);
    try {
      const nextSettings = await api.updateSettings(authToken, {
        network_mode: networkDraft.mode,
        preferred_local_url: networkDraft.preferred_local_url,
        public_base_url: networkDraft.public_base_url
      });
      setData((current) => (current ? { ...current, settings: nextSettings } : current));
      const info = await refreshNetworkInfo(false);
      if (!info?.selectedServerUrl) {
        throw new Error("The server address could not be prepared.");
      }
      await api.testNetwork(authToken, info.selectedServerUrl);
      setNetworkStatus(
        `Saved and working: ${info.selectedServerUrl}. Phones can now use the Connect app button.`
      );
    } catch (err) {
      handleAdminError(err, authToken);
      setNetworkStatus(err.message);
    } finally {
      setSavingNetwork(false);
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
          <h1>{sectionInfo.heading}</h1>
          <p>{sectionInfo.description}</p>
        </div>
        <div className="admin-heading-actions">
          <span className={`admin-state ${signedIn ? "is-on" : ""}`}>
            {signedIn ? <ShieldCheck size={18} /> : <Lock size={18} />}
            {signedIn ? `${sectionInfo.permissionName} unlocked` : "PIN required"}
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

      {activeSection === "activities" ? (
        <AdminSectionIntro
          id="admin-section-activities"
          title="Activity customization"
          description="Set the working day, reset active check-ins, and customize the service/activity list."
          allowed={canUseActiveSection}
        />
      ) : null}

      {activeSection === "activities" && (canUseActivities || !signedIn) ? (
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
            <p className="schedule-settings-note">
              Current workday: <strong>{formatWorkdayRange(data.settings)}</strong>. The kiosk only
              accepts check-ins inside this window. For a full-day schedule, use 12:00 AM to 11:59
              PM. 12:00 PM means noon.
            </p>
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
                onClick={saveFullDayWorkday}
                type="button"
              >
                Set full-day hours
              </button>
              <button
                className="secondary-button"
                disabled={!signedIn}
                onClick={() => resetDay(true)}
                type="button"
              >
                <RotateCcw size={18} />
                Reset demo data
              </button>
              <button
                className="danger-button"
                disabled={!signedIn}
                onClick={() => resetDay(false)}
                type="button"
              >
                Reset daily schedule
              </button>
              <button
                className="secondary-button"
                disabled={!signedIn}
                onClick={clearActive}
                type="button"
              >
                Clear active guests
              </button>
            </div>
          </div>
        </div>
      ) : activeSection === "activities" ? (
        <RestrictedAdminSection title="Activity customization" />
      ) : null}

      {activeSection === "it" ? (
        <AdminSectionIntro
          id="admin-section-it"
          title="IT tools"
          description="Set phone access, check read-aloud voice status, and control Raspberry Pi kiosk actions."
          allowed={canUseActiveSection}
        />
      ) : null}

      {activeSection === "it" && (canUseIt || !signedIn) ? (
        <>
          <form className="card-panel network-settings-panel" onSubmit={saveNetworkSettings}>
            <div className="analytics-heading">
              <div>
                <h2>
                  <Wifi size={24} />
                  Network & Phone Access
                </h2>
                <p>
                  Choose the address phones and tablets should use, test it, then connect the
                  Android app with one tap.
                </p>
              </div>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => refreshNetworkInfo(true)}
              >
                <RefreshCw size={18} />
                Refresh network
              </button>
            </div>

            <div className="network-guide">
              <div>
                <span>1</span>
                <strong>Connect the server</strong>
                <p>Use Windows or Raspberry Pi settings to join the Wi-Fi you want to use.</p>
              </div>
              <div>
                <span>2</span>
                <strong>Choose its address</strong>
                <p>Select the matching network below and save it.</p>
              </div>
              <div>
                <span>3</span>
                <strong>Connect phones</strong>
                <p>Join phones to that Wi-Fi, then press Connect installed app.</p>
              </div>
            </div>

            <div className="network-current">
              <Wifi size={22} />
              <div>
                <span>Wi-Fi detected on this server</span>
                <strong>{accessInfo?.wifiName || "Network name unavailable"}</strong>
              </div>
              <code>{accessInfo?.localBaseUrl || "Looking for a local address..."}</code>
            </div>

            <div className="network-mode-picker" role="radiogroup" aria-label="Server access mode">
              <label className={networkDraft.mode === "local" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="network_mode"
                  value="local"
                  checked={networkDraft.mode === "local"}
                  disabled={!signedIn}
                  onChange={() => setNetworkDraft((current) => ({ ...current, mode: "local" }))}
                />
                <Wifi />
                <span>
                  <strong>Local Wi-Fi</strong>
                  <small>Phones must use the same building Wi-Fi.</small>
                </span>
              </label>
              <label className={networkDraft.mode === "public" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="network_mode"
                  value="public"
                  checked={networkDraft.mode === "public"}
                  disabled={!signedIn}
                  onChange={() => setNetworkDraft((current) => ({ ...current, mode: "public" }))}
                />
                <Globe2 />
                <span>
                  <strong>Public internet</strong>
                  <small>Uses a public HTTPS tunnel or hosted address.</small>
                </span>
              </label>
            </div>

            {networkDraft.mode === "local" ? (
              <label className="network-address-field">
                Local server address
                <select
                  value={networkDraft.preferred_local_url}
                  disabled={!signedIn}
                  onChange={(event) =>
                    setNetworkDraft((current) => ({
                      ...current,
                      preferred_local_url: event.target.value
                    }))
                  }
                >
                  <option value="">Choose this computer&apos;s network address</option>
                  {(accessInfo?.networkOptions || []).map((option) => (
                    <option key={`${option.interfaceName}-${option.address}`} value={option.url}>
                      {option.label}
                    </option>
                  ))}
                  {networkDraft.preferred_local_url &&
                  !(accessInfo?.networkOptions || []).some(
                    (option) => option.url === networkDraft.preferred_local_url
                  ) ? (
                    <option value={networkDraft.preferred_local_url}>
                      Saved address - currently unavailable
                    </option>
                  ) : null}
                </select>
                <small>
                  A website cannot switch the computer&apos;s Wi-Fi. Switch Wi-Fi in the device
                  settings, then press Refresh network here.
                </small>
              </label>
            ) : (
              <label className="network-address-field">
                Public HTTPS address
                <input
                  type="url"
                  placeholder="https://checkin.example.org"
                  value={networkDraft.public_base_url}
                  disabled={!signedIn}
                  onChange={(event) =>
                    setNetworkDraft((current) => ({
                      ...current,
                      public_base_url: event.target.value
                    }))
                  }
                />
                <small>
                  Enter the address created by your hosting service or Cloudflare Tunnel. Saving an
                  address here does not create the tunnel by itself.
                </small>
              </label>
            )}

            <div className="network-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={!signedIn || savingNetwork}
              >
                <Save size={18} />
                {savingNetwork ? "Saving and testing..." : "Save and test connection"}
              </button>
              {accessInfo?.browserUrl ? (
                <a
                  className="secondary-button"
                  href={accessInfo.browserUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Link2 size={18} />
                  Open selected address
                </a>
              ) : null}
              {accessInfo?.androidConfigureUrl ? (
                <a className="secondary-button" href={accessInfo.androidConfigureUrl}>
                  <Smartphone size={18} />
                  Connect installed Android app
                </a>
              ) : null}
            </div>
            {networkStatus ? <p className="network-status">{networkStatus}</p> : null}
          </form>

          <section className="card-panel speech-status-panel">
            <div className="analytics-heading">
              <div>
                <h2>
                  <Volume2 size={24} />
                  Read Aloud Voice Status
                </h2>
                <p>
                  Hmong reads best when native full-phrase recordings are installed. If they are not
                  present, the kiosk uses the local Hmong syllable voice pack as a fallback.
                </p>
              </div>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => refreshSpeechStatus(true)}
              >
                <RefreshCw size={18} />
                Refresh voices
              </button>
              <button
                className="primary-button compact-button"
                type="button"
                disabled={!signedIn || preloadingSpeech}
                onClick={preloadSpeech}
              >
                <Volume2 size={18} />
                {preloadingSpeech ? "Preloading..." : "Preload kiosk speech"}
              </button>
            </div>

            <div className="speech-test-actions">
              {[
                ["en", "Test English"],
                ["es", "Test Spanish"],
                ["hmn", "Test Hmong"],
                ["so", "Test Somali"]
              ].map(([languageCode, label]) => (
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={!signedIn}
                  key={languageCode}
                  onClick={() => testSpeechLanguage(languageCode)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="speech-status-grid">
              <SpeechStatusCard
                title="Hmong mode"
                value={formatSpeechMode(speechStatus?.hmongSpeechMode)}
                state={
                  !speechStatus
                    ? "checking"
                    : speechStatus.hmongSpeechMode === "phrase-first"
                      ? "ready"
                      : "warning"
                }
                detail={
                  !speechStatus
                    ? "Checking installed phrase and fallback voice files."
                    : speechStatus.hmongSpeechMode === "phrase-first"
                      ? "Using native phrase recordings first."
                      : speechStatus.hmongSpeechMode === "fallback-syllable"
                        ? "Using the syllable voice pack until phrase recordings are added."
                        : "Hmong voice files are not installed yet."
                }
              />
              <SpeechStatusCard
                title="Phrase recordings"
                value={`${speechStatus?.hmongPhraseCount ?? 0} installed`}
                state={speechStatus?.hmongPhraseReady ? "ready" : "warning"}
                detail="Put approved native phrase WAV files in data/hmong-phrases and list them in manifest.json."
              />
              <SpeechStatusCard
                title="Fallback voice pack"
                value={`${speechStatus?.hmongVoiceSamples ?? 0} samples`}
                state={speechStatus?.hmongVoiceReady ? "ready" : "warning"}
                detail={
                  speechStatus?.hmongVoiceReady
                    ? "The offline Yuhalu syllable pack is available."
                    : "Run npm run speech:install-hmong on this server."
                }
              />
              <SpeechStatusCard
                title="Natural online speech"
                value={speechStatus?.naturalSpeechReady ? "Ready" : "Unavailable"}
                state={speechStatus?.naturalSpeechReady ? "ready" : "warning"}
                detail="English, Spanish, and Somali try natural speech first when the Pi has internet."
              />
              <SpeechStatusCard
                title="Cloud language fallback"
                value={speechStatus?.cloudSpeechLanguages?.length ? "Ready" : "Unavailable"}
                state={speechStatus?.cloudSpeechLanguages?.length ? "ready" : "warning"}
                detail="Spanish, Somali, and Hmong Daw try cloud speech before any offline fallback."
              />
              <SpeechStatusCard
                title="Server speech cache"
                value={`${speechStatus?.speechCacheItems ?? 0} files`}
                state={speechStatus?.speechCacheItems ? "ready" : "warning"}
                detail="Preload kiosk speech to store reusable audio on the Raspberry Pi."
              />
              <SpeechStatusCard
                title="Emergency local speech"
                value={speechStatus?.serverSpeechReady ? "Ready" : "Unavailable"}
                state={speechStatus?.serverSpeechReady ? "ready" : "warning"}
                detail={
                  speechStatus?.serverSpeechReady
                    ? "espeak-ng is installed and will be used when natural or cloud speech is unavailable."
                    : "Run sudo apt-get install -y espeak-ng on the Raspberry Pi."
                }
              />
            </div>

            {speechStatus?.hmongPhraseErrors?.length ? (
              <div className="speech-status-errors">
                <strong>Phrase setup needs attention</strong>
                {speechStatus.hmongPhraseErrors.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
            {speechStatusMessage ? <p className="network-status">{speechStatusMessage}</p> : null}
            {speechPreloadMessage ? <p className="network-status">{speechPreloadMessage}</p> : null}
          </section>

          <section className="card-panel system-controls-panel">
            <div className="analytics-heading">
              <div>
                <h2>
                  <Power size={24} />
                  Kiosk & Raspberry Pi Controls
                </h2>
                <p>
                  Use these when the kiosk is full-screen, stuck, or needs the newest GitHub update.
                  Saved check-ins and spreadsheet archives stay on disk, but phones disconnect while
                  the Pi reboots and any unsaved Admin form edits are lost.
                </p>
              </div>
            </div>

            <div className="system-control-grid">
              <div className="system-control-card">
                <MonitorX size={26} />
                <div>
                  <strong>Exit full-screen kiosk</strong>
                  <p>
                    Tries to close only the Chromium kiosk window on Raspberry Pi. The server keeps
                    running.
                  </p>
                </div>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={!signedIn || Boolean(runningSystemAction)}
                  onClick={exitKioskScreen}
                >
                  {runningSystemAction === "exitKiosk" ? "Exiting..." : "Exit kiosk screen"}
                </button>
              </div>

              <div className="system-control-card">
                <RefreshCw size={26} />
                <div>
                  <strong>Update from GitHub</strong>
                  <p>Pulls the newest code, rebuilds the website, and restarts the app.</p>
                </div>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={!signedIn || Boolean(runningSystemAction)}
                  onClick={() => runPiSystemAction("update", "GitHub update", api.updateFromGithub)}
                >
                  {runningSystemAction === "update" ? "Updating..." : "Run update now"}
                </button>
              </div>

              <div className="system-control-card">
                <Power size={26} />
                <div>
                  <strong>Reboot Raspberry Pi</strong>
                  <p>
                    Rebooting does not delete saved database data, but wait until exports or
                    check-ins finish first.
                  </p>
                </div>
                <button
                  className="danger-button compact-button"
                  type="button"
                  disabled={!signedIn || Boolean(runningSystemAction)}
                  onClick={() => runPiSystemAction("reboot", "Reboot", api.rebootPi)}
                >
                  {runningSystemAction === "reboot" ? "Rebooting..." : "Reboot Pi now"}
                </button>
              </div>

              <div className="system-control-card">
                <Globe2 size={26} />
                <div>
                  <strong>Open kiosk again</strong>
                  <p>Reopens Chromium in full-screen kiosk mode after exiting it.</p>
                </div>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={!signedIn || Boolean(runningSystemAction)}
                  onClick={() => runPiSystemAction("openKiosk", "Open kiosk", api.openKiosk)}
                >
                  {runningSystemAction === "openKiosk" ? "Opening..." : "Open kiosk now"}
                </button>
              </div>
            </div>
            {systemControlMessage ? <p className="network-status">{systemControlMessage}</p> : null}
          </section>
        </>
      ) : activeSection === "it" ? (
        <RestrictedAdminSection title="IT tools" />
      ) : null}

      {activeSection === "customization" ? (
        <AdminSectionIntro
          id="admin-section-customization"
          title="Page customization"
          description="Change kiosk wording, colors, live preview, and the About-page inventor contacts."
          allowed={canUseActiveSection}
        />
      ) : null}

      {activeSection === "customization" && (canUseCustomization || !signedIn) ? (
        <form className="card-panel kiosk-customization-panel" onSubmit={saveKioskCustomization}>
          <div className="analytics-heading">
            <div>
              <h2>
                <Palette size={24} />
                Customization of Kiosk
              </h2>
              <p>
                Rename the kiosk and adjust the main colors so this system can fit another shelter
                or community site.
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
                        onChange={(event) =>
                          updateCustomizationDraft(field.key, event.target.value)
                        }
                      />
                      <input
                        type="text"
                        value={customizationDraft[field.key]}
                        disabled={!signedIn}
                        maxLength={7}
                        onChange={(event) =>
                          updateCustomizationDraft(field.key, event.target.value)
                        }
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
      ) : activeSection === "customization" ? (
        <RestrictedAdminSection title="Page customization" />
      ) : null}

      {activeSection === "it" && isOwnerAdmin ? (
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
      ) : null}

      {activeSection === "excel" ? (
        <AdminSectionIntro
          id="admin-section-excel"
          title="Excel spreadsheets"
          description="Review analytics, download spreadsheets, and manage yearly data deletion."
          allowed={canUseActiveSection}
        />
      ) : null}

      {activeSection === "excel" && (canUseExcel || !signedIn) ? (
        <>
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
                  <AnalyticsStat
                    label="Guests checked in"
                    value={analytics.summary.guestsCheckedIn}
                  />
                  <AnalyticsStat
                    label="Different people"
                    value={analytics.summary.uniqueKnownGuests}
                  />
                  <AnalyticsStat
                    label="Activity requests"
                    value={analytics.summary.activityRequests}
                  />
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

          <form className="card-panel data-deletion-panel" onSubmit={saveDataDeletionSettings}>
            <div className="analytics-heading">
              <div>
                <h2>
                  <Trash2 size={24} />
                  Yearly Data Deletion
                </h2>
                <p>
                  Choose one yearly date and time to delete guest history and spreadsheet archives.
                  Staff users, permissions, activities, and kiosk settings are kept.
                </p>
              </div>
              <button
                className="primary-button compact-button"
                type="submit"
                disabled={!signedIn || savingDataDeletion}
              >
                <Save size={18} />
                {savingDataDeletion ? "Saving..." : "Save deletion settings"}
              </button>
            </div>
            {dataDeletionSettings?.warning ? (
              <div className="data-deletion-warning">
                <strong>Deletion warning</strong>
                <span>{dataDeletionSettings.warning.message}</span>
              </div>
            ) : null}
            <div className="data-deletion-grid">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={Boolean(dataDeletionDraft.enabled)}
                  disabled={!signedIn}
                  onChange={(event) => updateDataDeletionDraft("enabled", event.target.checked)}
                />
                Enable yearly deletion
              </label>
              <label>
                Deletion date
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="MM-DD"
                  value={dataDeletionDraft.month_day}
                  disabled={!signedIn}
                  onChange={(event) => updateDataDeletionDraft("month_day", event.target.value)}
                />
                <small>Use month-day format, such as 01-15 for January 15.</small>
              </label>
              <label>
                Deletion time
                <input
                  type="time"
                  value={dataDeletionDraft.time}
                  disabled={!signedIn}
                  onInput={(event) => updateDataDeletionDraft("time", event.currentTarget.value)}
                />
              </label>
            </div>
            <div className="data-deletion-actions">
              <button
                className="danger-button compact-button"
                type="button"
                disabled={!signedIn || runningDataDeletion}
                onClick={runDataDeletionNow}
              >
                {runningDataDeletion ? "Deleting..." : "Run deletion now"}
              </button>
            </div>
            {dataDeletionMessage ? <p className="network-status">{dataDeletionMessage}</p> : null}
          </form>
        </>
      ) : activeSection === "excel" ? (
        <RestrictedAdminSection title="Excel spreadsheets" />
      ) : null}

      {activeSection === "it" && canManageUsers ? (
        <section className="card-panel user-control-panel">
          <div className="analytics-heading">
            <div>
              <h2>
                <ShieldCheck size={24} />
                User Control
              </h2>
              <p>
                Add staff users and choose which top navigation sections they can open. Everyone can
                use the kiosk.
              </p>
            </div>
          </div>

          <form className="staff-user-form" onSubmit={addStaffUser}>
            <label>
              Staff name
              <input
                value={staffUserDraft.display_name}
                disabled={!signedIn}
                onChange={(event) => updateStaffUserDraft("display_name", event.target.value)}
              />
            </label>
            <label>
              PIN
              <input
                type="password"
                inputMode="numeric"
                maxLength={12}
                value={staffUserDraft.pin}
                disabled={!signedIn}
                onChange={(event) =>
                  updateStaffUserDraft("pin", event.target.value.replace(/\D/g, "").slice(0, 12))
                }
              />
            </label>
            <div className="permission-groups" aria-label="User permissions">
              <PermissionGroup
                title="Main pages this person can open"
                options={pagePermissionOptions}
                permissions={staffUserDraft.permissions}
                disabled={!signedIn}
                onChange={updateStaffPermissionDraft}
              />
              <PermissionGroup
                title="Staff sections this person can open"
                options={adminSectionPermissionOptions}
                permissions={staffUserDraft.permissions}
                disabled={!signedIn}
                onChange={updateStaffPermissionDraft}
              />
            </div>
            <button
              className="primary-button compact-button"
              type="submit"
              disabled={!signedIn || savingStaffUser}
            >
              <Plus size={18} />
              {savingStaffUser ? "Adding..." : "Add user"}
            </button>
          </form>

          <div className="staff-user-list">
            {staffUsers.length === 0 ? (
              <p>No staff users yet. The owner Admin PIN still has full access.</p>
            ) : (
              staffUsers.map((user) => (
                <div className="staff-user-row" key={user.id}>
                  <strong>{user.display_name}</strong>
                  <div className="staff-user-permissions">
                    <PermissionGroup
                      title="Main pages"
                      options={pagePermissionOptions}
                      permissions={user.permissions}
                      disabled={!signedIn}
                      compact
                      onChange={(key, checked) =>
                        updateStaffUser(user, {
                          permissions: normalizePermissionToggle(user.permissions, key, checked)
                        })
                      }
                    />
                    <PermissionGroup
                      title="Staff sections"
                      options={adminSectionPermissionOptions}
                      permissions={user.permissions}
                      disabled={!signedIn}
                      compact
                      onChange={(key, checked) =>
                        updateStaffUser(user, {
                          permissions: normalizePermissionToggle(user.permissions, key, checked)
                        })
                      }
                    />
                  </div>
                  <label className="toggle-field">
                    <input
                      type="checkbox"
                      checked={Boolean(user.active)}
                      disabled={!signedIn}
                      onChange={(event) => updateStaffUser(user, { active: event.target.checked })}
                    />
                    Active
                  </label>
                  <button
                    className="icon-button delete-activity-button"
                    type="button"
                    disabled={!signedIn}
                    onClick={() => deleteStaffUser(user)}
                    aria-label={`Delete ${user.display_name}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
          {staffUserMessage ? <p className="network-status">{staffUserMessage}</p> : null}
        </section>
      ) : null}

      {activeSection === "activities" && (canUseActivities || !signedIn) ? (
        <div className="card-panel activity-admin">
          <h2>Activities</h2>
          <p>
            Add a service, then independently choose calendar time, a daily quantity limit, a
            countdown alarm, available hours, monthly dates, yearly dates, or any combination.
          </p>
          <button
            className="secondary-button compact-button"
            type="button"
            disabled={!signedIn}
            onClick={applyListeningHouseDefaults}
          >
            <RefreshCw size={18} />
            Apply Listening House defaults
          </button>
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
                    setNewActivity((current) =>
                      updateActivityNameDraft(current, event.target.value)
                    )
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
            <ActivityTranslationFields
              draft={newActivity}
              disabled={!signedIn}
              onChange={setNewActivity}
            />
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
      ) : null}
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
            onChange={(event) =>
              setDraft((current) => updateActivityNameDraft(current, event.target.value))
            }
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
      <ActivityTranslationFields draft={draft} disabled={disabled} onChange={setDraft} />
      <ActivityOptionFields draft={draft} disabled={disabled} onChange={setDraft} />
      <div className="activity-usage-note">
        Used today: <strong>{activity.daily_used || 0}</strong>
        {activity.daily_limit_enabled ? ` of ${activity.daily_limit}` : ""}
      </div>
    </div>
  );
}

function ActivityTranslationFields({ draft, disabled, onChange }) {
  const [translationStatus, setTranslationStatus] = useState("");

  useEffect(() => {
    const name = String(draft.name || "").trim();
    if (disabled || !name) {
      setTranslationStatus("");
      return undefined;
    }
    const needsTranslation = ["name_es", "name_hmn", "name_so"].some((field) => {
      const value = String(draft[field] || "").trim();
      return !value || value.toLowerCase() === name.toLowerCase();
    });
    if (!needsTranslation) {
      setTranslationStatus("");
      return undefined;
    }

    setTranslationStatus("Translating activity name...");
    const timer = window.setTimeout(async () => {
      try {
        const authToken = sessionStorage.getItem("lh-admin-token") || "";
        const result = await api.translateActivityName(authToken, name);
        const localTranslations = buildActivityTranslations(name);
        onChange((current) => {
          if (String(current.name || "").trim() !== name) return current;
          const next = { ...current };
          ["name_es", "name_hmn", "name_so"].forEach((field) => {
            const currentValue = String(current[field] || "").trim();
            const localValue = String(localTranslations[field] || "").trim();
            const canReplace =
              !currentValue ||
              currentValue.toLowerCase() === name.toLowerCase() ||
              (localValue && currentValue.toLowerCase() === localValue.toLowerCase());
            if (canReplace && result.translations?.[field]) {
              next[field] = result.translations[field];
            }
          });
          return next;
        });
        setTranslationStatus(
          result.complete
            ? "Spanish, Hmong, and Somali translations are ready."
            : "Some words could not be translated online. Check the fields before saving."
        );
      } catch {
        setTranslationStatus(
          "Online translation is unavailable. Check the connection or enter the translations manually."
        );
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [disabled, draft.name, onChange]);

  function update(field, value) {
    onChange((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="activity-translation-fields">
      <div>
        <strong>Automatic kiosk translations</strong>
        <p>
          The system translates the English activity name into Spanish, Hmong, and Somali. You can
          still edit any wording before saving.
        </p>
        {translationStatus ? (
          <span className="activity-translation-status" aria-live="polite">
            {translationStatus}
          </span>
        ) : null}
      </div>
      <div className="activity-translation-grid">
        <label>
          Spanish name
          <input
            value={draft.name_es || ""}
            disabled={disabled}
            onChange={(event) => update("name_es", event.target.value)}
          />
        </label>
        <label>
          Hmong name
          <input
            value={draft.name_hmn || ""}
            disabled={disabled}
            onChange={(event) => update("name_hmn", event.target.value)}
          />
        </label>
        <label>
          Somali name
          <input
            value={draft.name_so || ""}
            disabled={disabled}
            onChange={(event) => update("name_so", event.target.value)}
          />
        </label>
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

  function toggleWeeklyDay(day, checked) {
    const current = new Set(
      String(draft.weekly_days || "")
        .split(",")
        .filter(Boolean)
    );
    if (checked) current.add(day);
    else current.delete(day);
    update(
      "weekly_days",
      [...current].toSorted((a, b) => Number(a) - Number(b)).join(",") || "0,1,2,3,4,5,6"
    );
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
            checked={Boolean(draft.weekly_window_enabled)}
            disabled={disabled}
            onChange={(event) => update("weekly_window_enabled", event.target.checked)}
          />
          Choose certain days each week
        </label>
        {draft.weekly_window_enabled ? (
          <div className="weekday-checkbox-grid">
            {weekDayOptions.map(([day, label]) => (
              <label className="toggle-field" key={day}>
                <input
                  type="checkbox"
                  checked={String(draft.weekly_days || "")
                    .split(",")
                    .includes(day)}
                  disabled={disabled}
                  onChange={(event) => toggleWeeklyDay(day, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        ) : (
          <p>Available every day of the week.</p>
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

      <section className={!draft.daily_limit_enabled ? "is-disabled" : ""}>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={Boolean(draft.waitlist_enabled)}
            disabled={disabled || !draft.daily_limit_enabled}
            onChange={(event) => update("waitlist_enabled", event.target.checked)}
          />
          Use available spots plus waitlist
        </label>
        {draft.daily_limit_enabled && draft.waitlist_enabled ? (
          <div className="activity-hours-grid">
            <label>
              Available spots
              <input
                type="number"
                min="0"
                max="1000"
                value={draft.confirmed_spots || 0}
                disabled={disabled}
                onChange={(event) => update("confirmed_spots", Number(event.target.value))}
              />
            </label>
            <label>
              Waitlist spots
              <input
                type="number"
                min="0"
                max="1000"
                value={draft.waitlist_spots || 0}
                disabled={disabled}
                onChange={(event) => update("waitlist_spots", Number(event.target.value))}
              />
            </label>
          </div>
        ) : (
          <p>When enabled, guests after the available spots are marked waitlist until full.</p>
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

function PermissionGroup({
  title,
  helper = "",
  options,
  permissions,
  disabled,
  compact = false,
  onChange
}) {
  return (
    <fieldset className={`permission-group ${compact ? "is-compact" : ""}`}>
      <legend>{title}</legend>
      {helper ? <p>{helper}</p> : null}
      <div className="permission-checkboxes">
        {options.map(([key, label]) => (
          <label className="toggle-field" key={key}>
            <input
              type="checkbox"
              checked={Boolean(permissions[key])}
              disabled={disabled}
              onChange={(event) => onChange(key, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AdminSectionIntro({ id, title, description, allowed }) {
  return (
    <section className={`admin-section-intro ${allowed ? "" : "is-restricted"}`} id={id}>
      <div>
        <span>Admin section</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {!allowed ? <strong>Restricted for this staff PIN</strong> : null}
    </section>
  );
}

function RestrictedAdminSection({ title }) {
  return (
    <div className="card-panel restricted-admin-section">
      <Lock size={24} />
      <div>
        <h3>{title} is not available for this staff PIN.</h3>
        <p>Ask the owner admin to turn on this section in User Control.</p>
      </div>
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

function SpeechStatusCard({ title, value, detail, state = "warning" }) {
  return (
    <div className={`speech-status-card is-${state}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function formatSpeechMode(mode) {
  if (mode === "phrase-first") return "Phrase first";
  if (mode === "fallback-syllable") return "Fallback";
  if (mode === "not-installed") return "Not installed";
  return "Checking...";
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
