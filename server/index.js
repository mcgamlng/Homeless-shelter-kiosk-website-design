import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import dotenv from "dotenv";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import {
  clearActiveCheckIns,
  clearCheckIn,
  changeAdminPin,
  applyDefaultActivities,
  createStaffUser,
  createActivity,
  createAnalyticsWorkbook,
  createCheckIn,
  deleteStaffUser,
  deleteActivity,
  getDataDeletionSettings,
  getAdminSecuritySettings,
  getAnalyticsReport,
  getActivities,
  getDashboardData,
  getSettings,
  inspectNameCheckIn,
  listStaffUsers,
  listStaffAuditLogs,
  moveScheduledItem,
  rebalanceActiveWaitingSchedule,
  recordStaffAuditLog,
  reorderCheckInItems,
  runDueYearlyDataDeletion,
  runYearlyDataDeletion,
  rescheduleScheduledItem,
  resetDailyData,
  updateDataDeletionSettings,
  updateActivity,
  updateStaffUser,
  updateScheduledItemStatus,
  updateSetting,
  updateSettings,
  verifyNameSignIn,
  verifyAdminPin,
  verifyStaffUserPin
} from "./repository.js";
import { createAccessInfo, getWifiName, normalizeServerBaseUrl } from "./network.js";
import { enrichActivityTranslations, translateActivityLabel } from "./translationService.js";
import { buildActivityTranslations } from "../shared/activityTranslations.js";
import {
  createHmongSpeechAudioResult,
  createHmongSpeechPlan,
  getCloudSpeechAudio,
  createLocalSpeechAudio,
  getHmongSyllablePath,
  getBestSpeechAudio,
  getNaturalSpeechAudio,
  preloadBestSpeechAudio,
  getSpanishSpeechAudio,
  getSpeechStatus
} from "./speechService.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PIN = process.env.ADMIN_PIN || "2468";
const PUBLIC_URL = String(process.env.PUBLIC_URL || "").replace(/\/+$/, "");
const adminSessions = new Map();
const analyticsDownloads = new Map();
const DOWNLOAD_TTL_MS = 10 * 60 * 1000;
const SCHEDULED_MAINTENANCE_CHECK_MS = 15 * 60 * 1000;
const EXIT_KIOSK_COMMAND =
  "pkill -f '(^|/)(chromium|chromium-browser).*--kiosk.*(:3000/kiosk|/kiosk)'";
const SYSTEM_ACTION_COMMANDS = {
  exitKiosk: EXIT_KIOSK_COMMAND,
  openKiosk:
    "pkill -f '(^|/)(chromium|chromium-browser).*--kiosk.*(:3000/kiosk|/kiosk)' || true; sleep 1; ./scripts/raspberry-pi/start-kiosk.sh",
  reboot: "sleep 2; sudo -n reboot"
};

if (PUBLIC_URL) {
  updateSettings({
    network_mode: "public",
    public_base_url: PUBLIC_URL
  });
}

app.use(express.json({ limit: "256kb" }));
app.set("trust proxy", 1);

function emitDashboard() {
  io.emit("dashboard:update", getDashboardData());
}

async function repairEnglishActivityTranslations() {
  const activities = getActivities({ includeInactive: true });
  let changed = false;
  for (const activity of activities) {
    const name = String(activity.name || "")
      .trim()
      .toLowerCase();
    const localTranslations = buildActivityTranslations(activity.name);
    const repaired = { ...activity };
    const needsRepair = ["name_es", "name_hmn", "name_so"].some((field) => {
      const translation = String(activity[field] || "")
        .trim()
        .toLowerCase();
      const expected = String(localTranslations[field] || "").trim();
      const isLegacyAccentlessSpanish =
        field === "name_es" &&
        expected &&
        normalizeWithoutDiacritics(translation) === normalizeWithoutDiacritics(expected) &&
        translation !== expected.toLowerCase();
      if (isLegacyAccentlessSpanish) repaired[field] = expected;
      return !translation || translation === name || isLegacyAccentlessSpanish;
    });
    if (!needsRepair) continue;
    const enriched = await enrichActivityTranslations(repaired);
    updateActivity(activity.id, enriched);
    changed = true;
  }
  if (changed) emitDashboard();
}

function normalizeWithoutDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function sessionFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token ? adminSessions.get(token) : null;
}

function auditActorFromSession(session) {
  if (!session) {
    return { actorType: "staff", actorId: null, actorName: "Unknown staff" };
  }
  return {
    actorType: session.owner ? "owner" : "staff",
    actorId: session.owner ? "owner" : session.userId,
    actorName: session.owner ? "Owner Admin" : session.displayName || "Staff user"
  };
}

function auditRequest(req, payload = {}) {
  try {
    const actor = payload.actor || auditActorFromSession(sessionFromRequest(req));
    recordStaffAuditLog({
      actorType: actor.actorType,
      actorId: actor.actorId,
      actorName: actor.actorName,
      action: payload.action,
      area: payload.area,
      subjectType: payload.subjectType,
      subjectId: payload.subjectId,
      summary: payload.summary,
      details: payload.details,
      ipAddress: req.ip || req.socket.remoteAddress || "",
      userAgent: req.get("user-agent") || ""
    });
  } catch (error) {
    console.warn("Staff audit log could not be saved:", error.message);
  }
}

function safeSettingKeys(settings = {}) {
  return Object.keys(settings || {})
    .filter((key) => !/pin|password|secret|token/i.test(key))
    .sort();
}

function safeActivityDetails(activity = {}) {
  return {
    id: activity.id,
    name: activity.name,
    active: Boolean(activity.active),
    time_limit_enabled: Boolean(activity.time_limit_enabled),
    availability_window_enabled: Boolean(activity.availability_window_enabled),
    daily_limit_enabled: Boolean(activity.daily_limit_enabled),
    waitlist_enabled: Boolean(activity.waitlist_enabled)
  };
}

function safeScheduledItemDetails(item = {}) {
  return {
    id: item.id,
    check_in_id: item.check_in_id,
    daily_number: item.daily_number,
    guest_name: item.guest_name,
    activity_name: item.activity_name,
    status: item.status,
    scheduled_start: item.scheduled_start,
    scheduled_end: item.scheduled_end,
    service_spot_status: item.service_spot_status,
    service_spot_number: item.service_spot_number
  };
}

function sessionHasPermission(session, permission) {
  if (!session) return false;
  if (session.owner) return true;
  return Boolean(session.permissions?.[permission]);
}

function requirePermission(permission, label) {
  return (req, res, next) => {
    const session = sessionFromRequest(req);
    if (!sessionHasPermission(session, permission)) {
      return res.status(401).json({ error: `${label} access required.` });
    }
    return next();
  };
}

function requireAnyPermission(permissions, label) {
  return (req, res, next) => {
    const session = sessionFromRequest(req);
    if (!permissions.some((permission) => sessionHasPermission(session, permission))) {
      return res.status(401).json({ error: `${label} access required.` });
    }
    return next();
  };
}

const requireAdmin = requirePermission("admin", "staff section access");
const requireOwnerAdmin = (req, res, next) => {
  const session = sessionFromRequest(req);
  if (!session?.owner) {
    return res.status(401).json({ error: "Owner Admin access required." });
  }
  return next();
};
const requireAdminExcel = requirePermission("admin_excel", "Excel Sheets");
const requireAdminCustomization = requirePermission("admin_customization", "Page Customization");
const requireAdminActivities = requirePermission("admin_activities", "Activity Customization");
const requireAdminIt = requirePermission("admin_it", "IT");
const requireAdminUsers = requirePermission("admin_users", "User Control");
const requireDashboardAccess = requireAnyPermission(
  ["dashboard", "admin"],
  "Dashboard or staff section access"
);

function requireAnyStaff(req, res, next) {
  if (!sessionFromRequest(req)) {
    return res.status(401).json({ error: "Staff access required." });
  }
  return next();
}

function requireDownloadPermission(permission, label) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : "";
    const queryToken = typeof req.query.token === "string" ? req.query.token : "";
    const token = bearerToken || queryToken;
    const session = token ? adminSessions.get(token) : null;
    if (!sessionHasPermission(session, permission)) {
      return res.status(401).json({ error: `${label} access required.` });
    }
    return next();
  };
}

const requireAdminExcelDownload = requireDownloadPermission("admin_excel", "Excel Sheets");

function createStaffSession({ owner = false, user = null, permissions = null } = {}) {
  const token = crypto.randomUUID();
  const sessionPermissions = owner
    ? {
        dashboard: true,
        admin: true,
        owner_admin: true,
        about: true,
        admin_excel: true,
        admin_customization: true,
        admin_activities: true,
        admin_it: true,
        admin_users: true
      }
    : permissions || user?.permissions || {};
  adminSessions.set(token, {
    createdAt: Date.now(),
    owner,
    userId: user?.id || null,
    displayName: owner ? "Owner Admin" : user?.display_name || "",
    permissions: sessionPermissions
  });
  return {
    token,
    user: {
      id: owner ? "owner" : user?.id,
      display_name: owner ? "Owner Admin" : user?.display_name || "",
      permissions: sessionPermissions,
      owner
    }
  };
}

function requestedPermissionForPath(value) {
  const cleanValue = String(value || "").toLowerCase();
  if (
    cleanValue === "/admin" ||
    cleanValue === "admin" ||
    cleanValue.includes("owner_admin") ||
    cleanValue.includes("owner admin")
  ) {
    return "owner_admin";
  }
  if (cleanValue.includes("admin_excel") || cleanValue.includes("excel")) return "admin_excel";
  if (cleanValue.includes("admin_activities") || cleanValue.includes("activity")) {
    return "admin_activities";
  }
  if (cleanValue.includes("admin_customization") || cleanValue.includes("customization")) {
    return "admin_customization";
  }
  if (cleanValue.includes("admin_it") || cleanValue.includes("it")) return "admin_it";
  if (cleanValue.includes("admin_users") || cleanValue.includes("user-control")) {
    return "admin_users";
  }
  if (cleanValue.includes("users") || cleanValue.includes("user control")) return "admin_users";
  if (cleanValue.includes("about")) return "about";
  return "dashboard";
}

function requireAdminOrPermission(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = token ? adminSessions.get(token) : null;
  if (sessionHasPermission(session, "admin")) {
    return next();
  }
  return requireAdmin(req, res, next);
}

const IT_SETTING_KEYS = new Set(["network_mode", "preferred_local_url", "public_base_url"]);
const ACTIVITY_SETTING_KEYS = new Set(["buffer_minutes", "workday_start", "workday_end"]);
const CUSTOMIZATION_SETTING_PREFIXES = ["kiosk_"];
const CUSTOMIZATION_SETTING_KEYS = new Set([
  "system_name",
  "inventor_contact_phone",
  "inventor_contact_email",
  "inventor_contacts"
]);

function permissionForSettingKey(key) {
  if (IT_SETTING_KEYS.has(key)) return "admin_it";
  if (ACTIVITY_SETTING_KEYS.has(key)) return "admin_activities";
  if (CUSTOMIZATION_SETTING_KEYS.has(key)) return "admin_customization";
  if (CUSTOMIZATION_SETTING_PREFIXES.some((prefix) => String(key).startsWith(prefix))) {
    return "admin_customization";
  }
  return "admin";
}

function requireSettingsPermission(req, res, next) {
  const session = sessionFromRequest(req);
  const bodySettings = req.params.key
    ? { [req.params.key]: req.body?.value }
    : req.body.settings || req.body || {};
  const requiredPermissions = [...new Set(Object.keys(bodySettings).map(permissionForSettingKey))];
  if (requiredPermissions.every((permission) => sessionHasPermission(session, permission))) {
    return next();
  }
  return res.status(401).json({ error: "This staff user cannot change those Admin settings." });
}

function sendAnalyticsWorkbook(res, workbook) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${workbook.filename}"`);
  res.send(workbook.buffer);
}

function cleanExpiredDownloads() {
  const now = Date.now();
  for (const [id, download] of analyticsDownloads.entries()) {
    if (download.expiresAt <= now) {
      analyticsDownloads.delete(id);
    }
  }
}

function handleRoute(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message || "Something went wrong."
      });
    }
  };
}

function exitKioskBrowser() {
  if (process.platform !== "linux") {
    const error = new Error(
      "Automatic kiosk exit is only available on Raspberry Pi/Linux. Use the command shown in Admin."
    );
    error.status = 422;
    throw error;
  }

  const child = spawn("sh", ["-lc", EXIT_KIOSK_COMMAND], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return {
    ok: true,
    command: EXIT_KIOSK_COMMAND,
    message:
      "Exit command sent. If the browser stays open, open a terminal on the Pi and run the command shown in Admin."
  };
}

function requireLinuxSystemAction(actionName) {
  if (process.platform === "linux") return;
  const error = new Error(`${actionName} can only run automatically on Raspberry Pi/Linux.`);
  error.status = 422;
  throw error;
}

function ensurePasswordlessSudo(actionName) {
  const result = spawnSync("sudo", ["-n", "true"], {
    encoding: "utf8",
    timeout: 3000
  });
  if (!result.error && result.status === 0) return;
  const error = new Error(
    `${actionName} needs Raspberry Pi sudo permission. Run it once from the terminal if this button cannot continue.`
  );
  error.status = 503;
  throw error;
}

function runDetachedSystemAction({ actionName, command, message, requiresSudo = false }) {
  requireLinuxSystemAction(actionName);
  if (requiresSudo) ensurePasswordlessSudo(actionName);

  const logPath = path.join(PROJECT_ROOT, "data", "system-actions.log");
  const wrappedCommand = `mkdir -p data && (${command}) >> ${shellQuote(logPath)} 2>&1`;
  const child = spawn("sh", ["-lc", wrappedCommand], {
    cwd: PROJECT_ROOT,
    detached: true,
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":0",
      XAUTHORITY:
        process.env.XAUTHORITY ||
        (process.env.HOME ? path.join(process.env.HOME, ".Xauthority") : "")
    },
    stdio: "ignore"
  });
  child.unref();
  return { ok: true, command, logPath, message };
}

function openKioskBrowser() {
  return runDetachedSystemAction({
    actionName: "Open kiosk",
    command: SYSTEM_ACTION_COMMANDS.openKiosk,
    message: "Opening the kiosk full-screen on this Raspberry Pi."
  });
}

function updateFromGithub() {
  const updateCommand =
    "chmod +x scripts/raspberry-pi/*.sh && ./scripts/raspberry-pi/update-from-github.sh";
  const command = [
    "sudo -n systemd-run",
    "--unit=listening-house-update",
    "--collect",
    `--working-directory=${shellQuote(PROJECT_ROOT)}`,
    "/bin/bash",
    "-lc",
    shellQuote(updateCommand)
  ].join(" ");
  return runDetachedSystemAction({
    actionName: "Update from GitHub",
    command,
    message:
      "GitHub update started. The server may restart for a minute while it installs the newest version."
  });
}

function installAutoUpdateTimer() {
  const installCommand =
    "chmod +x scripts/raspberry-pi/*.sh && ./scripts/raspberry-pi/install-auto-update.sh";
  const command = [
    "sudo -n systemd-run",
    "--unit=listening-house-install-auto-update",
    "--collect",
    `--working-directory=${shellQuote(PROJECT_ROOT)}`,
    "/bin/bash",
    "-lc",
    shellQuote(installCommand)
  ].join(" ");
  return runDetachedSystemAction({
    actionName: "Turn on auto-update",
    command,
    message:
      "Two-week auto-update is turning on. The Raspberry Pi will check GitHub, rebuild, and restart on that schedule."
  });
}

function disableAutoUpdateTimer() {
  const disableCommand = "systemctl disable --now listening-house-auto-update.timer";
  const command = [
    "sudo -n systemd-run",
    "--unit=listening-house-disable-auto-update",
    "--collect",
    "/bin/bash",
    "-lc",
    shellQuote(disableCommand)
  ].join(" ");
  return runDetachedSystemAction({
    actionName: "Turn off auto-update",
    command,
    message: "Two-week auto-update is turning off. Manual updates will still work."
  });
}

function setAutoUpdateTimer(enabled) {
  return enabled ? installAutoUpdateTimer() : disableAutoUpdateTimer();
}

function getAutoUpdateTimerStatus() {
  requireLinuxSystemAction("Auto-update status");
  const timerName = "listening-house-auto-update.timer";
  const active = spawnSync("systemctl", ["is-active", timerName], {
    encoding: "utf8",
    timeout: 3000
  });
  const enabled = spawnSync("systemctl", ["is-enabled", timerName], {
    encoding: "utf8",
    timeout: 3000
  });
  const timers = spawnSync("systemctl", ["list-timers", "--all", "--no-pager", timerName], {
    encoding: "utf8",
    timeout: 3000
  });
  const activeText = String(active.stdout || "").trim();
  const enabledText = String(enabled.stdout || "").trim();
  return {
    ok: true,
    timer: timerName,
    active: active.status === 0 && activeText === "active",
    enabled: enabled.status === 0 && enabledText === "enabled",
    activeText: activeText || "inactive",
    enabledText: enabledText || "disabled",
    schedule: "Every two weeks after the last update, with a startup catch-up",
    timerOutput: String(timers.stdout || "").trim()
  };
}

function rebootRaspberryPi() {
  return runDetachedSystemAction({
    actionName: "Reboot Raspberry Pi",
    command: SYSTEM_ACTION_COMMANDS.reboot,
    message: "Reboot command sent. The Raspberry Pi will disconnect briefly."
  });
}

function isLocalRequest(req) {
  const remoteAddress = req.socket.remoteAddress || "";
  const forwardedAddress = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const address = forwardedAddress || remoteAddress;
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    req.hostname === "localhost" ||
    req.hostname === "127.0.0.1"
  );
}

function adjustLocalSystemVolume(action) {
  requireLinuxSystemAction("Volume control");
  const safeAction = new Set(["up", "down", "mute", "loud"]).has(action) ? action : "loud";
  const scriptPath = path.join(PROJECT_ROOT, "scripts", "raspberry-pi", "volume-control.sh");
  const result = spawnSync("bash", [scriptPath, safeAction], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 5000
  });
  if (!result.error && result.status === 0) {
    return { ok: true, action: safeAction };
  }
  const error = new Error(
    result.stderr?.trim() ||
      result.stdout?.trim() ||
      "Volume control is not ready on this Raspberry Pi yet."
  );
  error.status = 503;
  throw error;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Listening House Guest Check-In System" });
});

app.get("/api/access-info", (req, res) => {
  const port = Number(req.socket.localPort || PORT);
  const requestBase = `${req.protocol}://${req.get("host")}`;
  const settings = getSettings();
  const access = createAccessInfo({
    requestBase,
    requestHostname: req.hostname,
    port,
    environmentPublicUrl: PUBLIC_URL,
    networkSettings: settings.network
  });
  const baseUrl = access.baseUrl;
  res.json({
    browserUrl: `${baseUrl}/dashboard`,
    kioskUrl: `${baseUrl}/kiosk`,
    iphoneInstallUrl: `${baseUrl}/install?platform=ios`,
    androidInstallUrl: `${baseUrl}/install?platform=android`,
    appDownloadUrl: `${baseUrl}/downloads/ListeningHouseKiosk-debug.apk`,
    androidConfigureUrl: `lhcheckin://save?url=${encodeURIComponent(baseUrl)}`,
    selectedServerUrl: baseUrl,
    activeMode: access.activeMode,
    requestedMode: access.requestedMode,
    localBaseUrl: access.localBaseUrl,
    publicUrl: access.publicBaseUrl,
    publicReady: access.publicReady,
    preferredLocalUrl: access.preferredLocalUrl,
    preferredLocalAvailable: access.preferredLocalAvailable,
    wifiName: getWifiName(),
    networkOptions: access.networkOptions,
    addresses: access.addresses
  });
});

app.get(
  "/api/activities",
  handleRoute((req, res) => {
    res.json(getActivities({ includeInactive: req.query.includeInactive === "true" }));
  })
);

app.get("/api/settings", (_req, res) => {
  res.json(getSettings());
});

app.get("/api/speech/status", (_req, res) => {
  res.json(getSpeechStatus());
});

app.get(
  "/api/speech/best",
  handleRoute(async (req, res) => {
    const result = await getBestSpeechAudio(req.query.text, req.query.language || "en", {
      key: req.query.key || ""
    });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Speech-Source", result.source);
    res.setHeader("X-Speech-Cache", result.cached ? "hit" : "miss");
    res.send(result.audio);
  })
);

app.post(
  "/api/admin/speech/preload",
  requireAdminIt,
  handleRoute(async (req, res) => {
    const rawSegments = Array.isArray(req.body?.segments) ? req.body.segments : [];
    const segments = rawSegments.slice(0, 300).map((segment) => ({
      language: String(segment.language || "en").slice(0, 8),
      key: String(segment.key || "").slice(0, 120),
      text: String(segment.text || "").slice(0, 350)
    }));
    const results = await preloadBestSpeechAudio(segments);
    auditRequest(req, {
      action: "speech_preloaded",
      area: "it",
      subjectType: "speech_cache",
      summary: "Read-aloud speech cache preload was run.",
      details: {
        total: results.length,
        ready: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length
      }
    });
    res.json({
      ok: true,
      total: results.length,
      ready: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results
    });
  })
);

app.get(
  "/api/speech/hmong-plan",
  handleRoute((req, res) => {
    res.json(createHmongSpeechPlan(req.query.text));
  })
);

app.get(
  "/api/speech/hmong",
  handleRoute((req, res) => {
    const result = createHmongSpeechAudioResult(req.query.text, { key: req.query.key });
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Hmong-Speech-Source", result.source);
    if (result.phraseKey) res.setHeader("X-Hmong-Phrase-Key", result.phraseKey);
    res.send(result.audio);
  })
);

app.get("/api/speech/hmong-syllable/:token", (req, res) => {
  const filePath = getHmongSyllablePath(req.params.token);
  if (!filePath) {
    res.status(404).json({ error: "Hmong speech sample not found." });
    return;
  }
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(filePath);
});

app.get(
  "/api/speech/natural",
  handleRoute(async (req, res) => {
    const audio = await getNaturalSpeechAudio(req.query.text, req.query.language || "en");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(audio);
  })
);

app.get(
  "/api/speech/cloud",
  handleRoute(async (req, res) => {
    const audio = await getCloudSpeechAudio(req.query.text, req.query.language || "es");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(audio);
  })
);

app.get(
  "/api/speech/spanish",
  handleRoute(async (req, res) => {
    const audio = await getSpanishSpeechAudio(req.query.text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(audio);
  })
);

app.get(
  "/api/speech/local",
  handleRoute((req, res) => {
    const audio = createLocalSpeechAudio(req.query.text, req.query.language || "en");
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(audio);
  })
);

app.post(
  "/api/check-ins",
  handleRoute((req, res) => {
    const checkIn = createCheckIn(req.body);
    emitDashboard();
    res.status(201).json(checkIn);
  })
);

app.post(
  "/api/sign-in/inspect",
  handleRoute((req, res) => {
    res.json(inspectNameCheckIn(req.body));
  })
);

app.post(
  "/api/sign-in/verify",
  handleRoute((req, res) => {
    try {
      verifyNameSignIn(req.body);
      res.json({ ok: true });
    } catch (error) {
      if (error.status === 404 || error.status === 409) {
        res.json({ ok: false, error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.get(
  "/api/dashboard",
  requireDashboardAccess,
  handleRoute((_req, res) => {
    res.json(getDashboardData());
  })
);

app.patch(
  "/api/scheduled-items/:id/status",
  requireDashboardAccess,
  handleRoute((req, res) => {
    const item = updateScheduledItemStatus(req.params.id, req.body.status);
    auditRequest(req, {
      action: "status_changed",
      area: "dashboard",
      subjectType: "scheduled_activity_item",
      subjectId: item.id,
      summary: `${item.guest_name || "A guest"} was marked ${item.status} for ${
        item.activity_name || "an activity"
      }.`,
      details: safeScheduledItemDetails(item)
    });
    emitDashboard();
    res.json(item);
  })
);

app.patch(
  "/api/scheduled-items/:id/move",
  requireDashboardAccess,
  handleRoute((req, res) => {
    const item = moveScheduledItem(req.params.id, req.body.direction);
    auditRequest(req, {
      action: "schedule_moved",
      area: "dashboard",
      subjectType: "scheduled_activity_item",
      subjectId: item.id,
      summary: `${item.guest_name || "A guest"} was moved ${
        req.body.direction === "earlier" ? "earlier" : "later"
      } for ${item.activity_name || "an activity"}.`,
      details: {
        direction: req.body.direction,
        ...safeScheduledItemDetails(item)
      }
    });
    emitDashboard();
    res.json(item);
  })
);

app.patch(
  "/api/scheduled-items/:id/reschedule",
  requireDashboardAccess,
  handleRoute((req, res) => {
    const item = rescheduleScheduledItem(req.params.id, req.body.targetStart);
    auditRequest(req, {
      action: "schedule_rescheduled",
      area: "dashboard",
      subjectType: "scheduled_activity_item",
      subjectId: item.id,
      summary: `${item.guest_name || "A guest"} was rescheduled for ${
        item.activity_name || "an activity"
      }.`,
      details: {
        requested_start: req.body.targetStart,
        ...safeScheduledItemDetails(item)
      }
    });
    emitDashboard();
    res.json(item);
  })
);

app.patch(
  "/api/check-ins/:id/reorder",
  requireDashboardAccess,
  handleRoute((req, res) => {
    const checkIn = reorderCheckInItems(req.params.id, req.body.orderedIds);
    auditRequest(req, {
      action: "schedule_reordered",
      area: "dashboard",
      subjectType: "check_in",
      subjectId: req.params.id,
      summary: `Activities were reordered for ${checkIn.guest_name || "a guest"}.`,
      details: {
        check_in_id: checkIn.id,
        guest_name: checkIn.guest_name,
        ordered_ids: Array.isArray(req.body.orderedIds) ? req.body.orderedIds : []
      }
    });
    emitDashboard();
    res.json(checkIn);
  })
);

app.delete(
  "/api/check-ins/:id",
  requireDashboardAccess,
  handleRoute((req, res) => {
    clearCheckIn(req.params.id);
    auditRequest(req, {
      action: "guest_cleared",
      area: "dashboard",
      subjectType: "check_in",
      subjectId: req.params.id,
      summary: `Cleared active guest check-in #${req.params.id}.`,
      details: { check_in_id: req.params.id }
    });
    emitDashboard();
    res.json({ ok: true });
  })
);

app.post("/api/admin/session", (req, res) => {
  const requestedPermission = requestedPermissionForPath(req.body.permission || req.body.path);
  if (verifyAdminPin(req.body.pin, ADMIN_PIN)) {
    const response = createStaffSession({ owner: true });
    auditRequest(req, {
      actor: { actorType: "owner", actorId: "owner", actorName: "Owner Admin" },
      action: "signed_in",
      area: "access",
      summary: `Owner Admin signed in to ${requestedPermission}.`,
      details: { requested_permission: requestedPermission }
    });
    return res.json(response);
  }
  const user = verifyStaffUserPin(req.body.pin);
  if (!user) {
    return res.status(401).json({ error: "That staff PIN did not work." });
  }
  if (!user.permissions?.[requestedPermission]) {
    return res.status(403).json({ error: "This user does not have access to that page." });
  }
  const response = createStaffSession({ user });
  auditRequest(req, {
    actor: { actorType: "staff", actorId: user.id, actorName: user.display_name },
    action: "signed_in",
    area: "access",
    subjectType: "staff_user",
    subjectId: user.id,
    summary: `${user.display_name} signed in to ${requestedPermission}.`,
    details: { requested_permission: requestedPermission }
  });
  return res.json(response);
});

app.get(
  "/api/admin/security",
  requireOwnerAdmin,
  handleRoute((_req, res) => {
    res.json(getAdminSecuritySettings());
  })
);

app.get(
  "/api/staff/session",
  handleRoute((req, res) => {
    const session = sessionFromRequest(req);
    const permission = requestedPermissionForPath(req.query.permission || req.query.path);
    if (!sessionHasPermission(session, permission)) {
      return res.status(401).json({ error: "Staff access required." });
    }
    res.json({
      ok: true,
      user: {
        id: session.owner ? "owner" : session.userId,
        display_name: session.displayName,
        permissions: session.permissions,
        owner: Boolean(session.owner)
      }
    });
  })
);

app.put(
  "/api/admin/security/pin",
  handleRoute((req, res) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const session = token ? adminSessions.get(token) : null;
    const hasValidSession = Boolean(session?.owner);
    const hasValidCurrentPin = verifyAdminPin(
      req.body.currentPin ?? req.body.current_pin,
      ADMIN_PIN
    );

    if (!hasValidSession && !hasValidCurrentPin) {
      return res.status(401).json({ error: "Current PIN did not work." });
    }

    changeAdminPin(req.body, ADMIN_PIN);
    auditRequest(req, {
      action: "admin_pin_changed",
      area: "admin",
      subjectType: "admin_security",
      subjectId: "owner_pin",
      summary: "Owner Admin PIN was changed.",
      details: { pin_changed: true }
    });
    adminSessions.clear();
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/users",
  requireAdminUsers,
  handleRoute((_req, res) => {
    res.json(listStaffUsers());
  })
);

app.get(
  "/api/admin/audit-logs",
  requireOwnerAdmin,
  handleRoute((req, res) => {
    res.json(
      listStaffAuditLogs({
        limit: req.query.limit,
        area: req.query.area,
        actor: req.query.actor,
        action: req.query.action
      })
    );
  })
);

app.post(
  "/api/admin/users",
  requireAdminUsers,
  handleRoute((req, res) => {
    const user = createStaffUser(req.body);
    auditRequest(req, {
      action: "staff_user_added",
      area: "users",
      subjectType: "staff_user",
      subjectId: user.id,
      summary: `${user.display_name} was added as a staff user.`,
      details: { user_id: user.id, display_name: user.display_name, permissions: user.permissions }
    });
    res.status(201).json(user);
  })
);

app.patch(
  "/api/admin/users/:id",
  requireAdminUsers,
  handleRoute((req, res) => {
    const user = updateStaffUser(req.params.id, req.body);
    auditRequest(req, {
      action: "staff_user_updated",
      area: "users",
      subjectType: "staff_user",
      subjectId: user.id,
      summary: `${user.display_name} staff access was updated.`,
      details: {
        user_id: user.id,
        display_name: user.display_name,
        permissions: user.permissions,
        active: user.active,
        pin_changed: Boolean(req.body.pin)
      }
    });
    res.json(user);
  })
);

app.delete(
  "/api/admin/users/:id",
  requireAdminUsers,
  handleRoute((req, res) => {
    const user = deleteStaffUser(req.params.id);
    auditRequest(req, {
      action: "staff_user_deleted",
      area: "users",
      subjectType: "staff_user",
      subjectId: user.id,
      summary: `${user.display_name} was deleted from staff users.`,
      details: { user_id: user.id, display_name: user.display_name }
    });
    res.json({ ok: true, user });
  })
);

app.post(
  "/api/admin/reset-day",
  requireAdminActivities,
  handleRoute((req, res) => {
    const data = resetDailyData({ seedDemo: Boolean(req.body.seedDemo) });
    auditRequest(req, {
      action: req.body.seedDemo ? "demo_data_reset" : "daily_schedule_reset",
      area: "activities",
      subjectType: "daily_schedule",
      summary: req.body.seedDemo
        ? "Demo data was reset for the activity schedule."
        : "The daily activity schedule was reset.",
      details: { seed_demo: Boolean(req.body.seedDemo) }
    });
    emitDashboard();
    res.json(data);
  })
);

app.post(
  "/api/admin/clear-active",
  requireAdminActivities,
  handleRoute((req, res) => {
    const data = clearActiveCheckIns();
    auditRequest(req, {
      action: "active_guests_cleared",
      area: "activities",
      subjectType: "daily_schedule",
      summary: "All active guests were cleared from the current schedule.",
      details: {}
    });
    emitDashboard();
    res.json(data);
  })
);

app.get(
  "/api/admin/analytics",
  requireAdminExcel,
  handleRoute((req, res) => {
    res.json(getAnalyticsReport({ period: req.query.period, date: req.query.date }));
  })
);

app.get(
  "/api/admin/analytics/export",
  requireAdminExcelDownload,
  handleRoute((req, res) => {
    const workbook = createAnalyticsWorkbook({ period: req.query.period, date: req.query.date });
    sendAnalyticsWorkbook(res, workbook);
  })
);

app.post(
  "/api/admin/analytics/export-link",
  requireAdminExcel,
  handleRoute((req, res) => {
    cleanExpiredDownloads();
    const workbook = createAnalyticsWorkbook({ period: req.body.period, date: req.body.date });
    const id = crypto.randomUUID();
    analyticsDownloads.set(id, {
      ...workbook,
      expiresAt: Date.now() + DOWNLOAD_TTL_MS
    });
    res.json({
      filename: workbook.filename,
      url: `/api/admin/analytics/download/${id}`
    });
    auditRequest(req, {
      action: "excel_export_created",
      area: "excel",
      subjectType: "analytics_export",
      subjectId: id,
      summary: `Excel export was created for ${req.body.period || "day"} ${
        req.body.date || ""
      }.`.trim(),
      details: { period: req.body.period, date: req.body.date, filename: workbook.filename }
    });
  })
);

app.get(
  "/api/admin/analytics/download/:id",
  handleRoute((req, res) => {
    cleanExpiredDownloads();
    const download = analyticsDownloads.get(req.params.id);
    if (!download) {
      return res
        .status(404)
        .json({ error: "This Excel download link expired. Please export again." });
    }
    sendAnalyticsWorkbook(res, download);
  })
);

app.get(
  "/api/admin/data-deletion",
  requireOwnerAdmin,
  handleRoute((_req, res) => {
    res.json(getDataDeletionSettings());
  })
);

app.put(
  "/api/admin/data-deletion",
  requireOwnerAdmin,
  handleRoute((req, res) => {
    const settings = updateDataDeletionSettings(req.body || {});
    auditRequest(req, {
      action: "data_deletion_settings_changed",
      area: "admin",
      subjectType: "data_deletion",
      summary: "Yearly spreadsheet and guest data deletion settings were changed.",
      details: {
        enabled: settings.enabled,
        date: settings.date,
        time: settings.time
      }
    });
    res.json(settings);
  })
);

app.post(
  "/api/admin/data-deletion/run",
  requireOwnerAdmin,
  handleRoute((req, res) => {
    const result = runYearlyDataDeletion({ reason: "manual" });
    auditRequest(req, {
      action: "data_deletion_run",
      area: "admin",
      subjectType: "data_deletion",
      summary: "Spreadsheet and guest data deletion was run manually.",
      details: result.deleted
    });
    emitDashboard();
    res.json(result);
  })
);

app.post(
  "/api/admin/system/exit-kiosk",
  requireAdminIt,
  handleRoute((req, res) => {
    const result = exitKioskBrowser();
    auditRequest(req, {
      action: "kiosk_exit_requested",
      area: "it",
      subjectType: "system_action",
      summary: "Exit full-screen kiosk was requested.",
      details: { ok: result.ok }
    });
    res.json(result);
  })
);

app.post(
  "/api/admin/system/open-kiosk",
  requireAdminIt,
  handleRoute((req, res) => {
    const result = openKioskBrowser();
    auditRequest(req, {
      action: "kiosk_open_requested",
      area: "it",
      subjectType: "system_action",
      summary: "Open full-screen kiosk was requested.",
      details: { ok: result.ok }
    });
    res.json(result);
  })
);

app.post(
  "/api/admin/system/update",
  requireAdminIt,
  handleRoute((req, res) => {
    const result = updateFromGithub();
    auditRequest(req, {
      action: "github_update_requested",
      area: "it",
      subjectType: "system_action",
      summary: "Update from GitHub was started.",
      details: { ok: result.ok }
    });
    res.json(result);
  })
);

app.post(
  "/api/admin/system/install-auto-update",
  requireAdminIt,
  handleRoute((req, res) => {
    const result = installAutoUpdateTimer();
    auditRequest(req, {
      action: "auto_update_installed",
      area: "it",
      subjectType: "system_action",
      summary: "Raspberry Pi two-week auto-update setup was started.",
      details: { ok: result.ok }
    });
    res.json(result);
  })
);

app.put(
  "/api/admin/system/auto-update",
  requireAdminIt,
  handleRoute((req, res) => {
    const enabled = Boolean(req.body?.enabled);
    const result = setAutoUpdateTimer(enabled);
    auditRequest(req, {
      action: enabled ? "auto_update_enabled" : "auto_update_disabled",
      area: "it",
      subjectType: "system_action",
      summary: enabled
        ? "Raspberry Pi two-week auto-update was turned on."
        : "Raspberry Pi two-week auto-update was turned off.",
      details: { ok: result.ok, enabled }
    });
    res.json(result);
  })
);

app.get(
  "/api/admin/system/auto-update-status",
  requireAdminIt,
  handleRoute((_req, res) => {
    res.json(getAutoUpdateTimerStatus());
  })
);

app.post(
  "/api/admin/system/reboot",
  requireAdminIt,
  handleRoute((req, res) => {
    const result = rebootRaspberryPi();
    auditRequest(req, {
      action: "raspberry_pi_reboot_requested",
      area: "it",
      subjectType: "system_action",
      summary: "Raspberry Pi reboot was requested.",
      details: { ok: result.ok }
    });
    res.json(result);
  })
);

app.post(
  "/api/system/open-kiosk",
  handleRoute((req, res) => {
    if (!isLocalRequest(req)) {
      const error = new Error("Open this button on the Raspberry Pi screen itself.");
      error.status = 403;
      throw error;
    }
    res.json(openKioskBrowser());
  })
);

app.post(
  "/api/system/volume",
  handleRoute((req, res) => {
    if (!isLocalRequest(req)) {
      const error = new Error(
        "Volume keys can only control the Raspberry Pi from the kiosk screen."
      );
      error.status = 403;
      throw error;
    }
    res.json(adjustLocalSystemVolume(req.body?.action));
  })
);

app.post(
  "/api/admin/activities",
  requireAdminActivities,
  handleRoute(async (req, res) => {
    const activity = createActivity(await enrichActivityTranslations(req.body));
    auditRequest(req, {
      action: "activity_added",
      area: "activities",
      subjectType: "activity",
      subjectId: activity.id,
      summary: `${activity.name} was added as an activity.`,
      details: safeActivityDetails(activity)
    });
    emitDashboard();
    res.status(201).json(activity);
  })
);

app.post(
  "/api/admin/activities/apply-listening-house-defaults",
  requireAdminActivities,
  handleRoute((req, res) => {
    const data = applyDefaultActivities();
    auditRequest(req, {
      action: "activity_defaults_applied",
      area: "activities",
      subjectType: "activity_defaults",
      summary: "Listening House default activities were applied.",
      details: { activities: Array.isArray(data.activities) ? data.activities.length : undefined }
    });
    emitDashboard();
    res.json(data);
  })
);

app.patch(
  "/api/admin/activities/:id",
  requireAdminActivities,
  handleRoute(async (req, res) => {
    const activity = updateActivity(req.params.id, await enrichActivityTranslations(req.body));
    auditRequest(req, {
      action: "activity_updated",
      area: "activities",
      subjectType: "activity",
      subjectId: activity.id,
      summary: `${activity.name} activity settings were updated.`,
      details: safeActivityDetails(activity)
    });
    emitDashboard();
    res.json(activity);
  })
);

app.post(
  "/api/admin/activity-translations",
  requireAdminActivities,
  handleRoute(async (req, res) => {
    res.json(await translateActivityLabel(req.body.name));
  })
);

app.delete(
  "/api/admin/activities/:id",
  requireAdminActivities,
  handleRoute((req, res) => {
    const activity = deleteActivity(req.params.id);
    auditRequest(req, {
      action: "activity_deleted",
      area: "activities",
      subjectType: "activity",
      subjectId: activity.id,
      summary: `${activity.name} was deleted from activities.`,
      details: safeActivityDetails(activity)
    });
    emitDashboard();
    res.json({ ok: true, activity });
  })
);

app.put(
  "/api/admin/settings",
  requireSettingsPermission,
  handleRoute((req, res) => {
    const incomingSettings = req.body.settings || req.body || {};
    const settings = updateSettings(incomingSettings);
    const keys = safeSettingKeys(incomingSettings);
    auditRequest(req, {
      action: "settings_updated",
      area: keys.some((key) => permissionForSettingKey(key) === "admin_it")
        ? "it"
        : keys.some((key) => permissionForSettingKey(key) === "admin_customization")
          ? "customization"
          : keys.some((key) => permissionForSettingKey(key) === "admin_activities")
            ? "activities"
            : "admin",
      subjectType: "settings",
      summary: `Settings updated: ${keys.join(", ") || "settings"}.`,
      details: { keys }
    });
    emitDashboard();
    res.json(settings);
  })
);

app.put(
  "/api/admin/settings/:key",
  requireSettingsPermission,
  handleRoute((req, res) => {
    const settings = updateSetting(req.params.key, req.body.value);
    const key = req.params.key;
    auditRequest(req, {
      action: "setting_updated",
      area: permissionForSettingKey(key).replace("admin_", "") || "admin",
      subjectType: "setting",
      subjectId: key,
      summary: `Setting updated: ${key}.`,
      details: { key }
    });
    emitDashboard();
    res.json(settings);
  })
);

app.post(
  "/api/admin/network/test",
  requireAdminIt,
  handleRoute(async (req, res) => {
    const baseUrl = normalizeServerBaseUrl(req.body.url);
    if (!baseUrl) {
      return res.status(400).json({ error: "Enter a valid local or public server address." });
    }

    let response;
    try {
      response = await fetch(`${baseUrl}/api/health`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000)
      });
    } catch {
      return res.status(502).json({
        error:
          "The server could not reach that address. Check the Wi-Fi connection, address, and firewall."
      });
    }

    if (!response.ok) {
      return res
        .status(502)
        .json({ error: `That address responded with HTTP ${response.status}.` });
    }
    const health = await response.json().catch(() => ({}));
    if (!health.ok) {
      return res.status(502).json({ error: "That address is not the check-in server." });
    }
    auditRequest(req, {
      action: "network_address_tested",
      area: "it",
      subjectType: "network",
      summary: "A network address was tested successfully.",
      details: { url: baseUrl }
    });
    return res.json({ ok: true, url: baseUrl });
  })
);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

const distPath = path.join(__dirname, "..", "dist");
const androidApkFileName = "ListeningHouseKiosk-debug.apk";
const androidApkCandidates = [
  path.join(PROJECT_ROOT, "public", "downloads", androidApkFileName),
  path.join(PROJECT_ROOT, "dist", "downloads", androidApkFileName)
];

function setAndroidApkHeaders(res) {
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", `attachment; filename="${androidApkFileName}"`);
}

function findAndroidApkPath() {
  return androidApkCandidates.find((candidate) => fs.existsSync(candidate));
}

const staticOptions = {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
      return;
    }

    if (filePath.endsWith(".apk")) {
      setAndroidApkHeaders(res);
      return;
    }

    res.setHeader("Cache-Control", "no-cache");
  }
};

app.get(`/downloads/${androidApkFileName}`, (_req, res) => {
  const apkPath = findAndroidApkPath();
  if (!apkPath) {
    res.status(404).send("Android app file not found. Update the project and rebuild the app.");
    return;
  }

  setAndroidApkHeaders(res);
  res.sendFile(apkPath);
});

app.use(express.static(distPath, staticOptions));
app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(distPath, "index.html"));
});

io.use((socket, next) => {
  const token = String(socket.handshake.auth?.token || "");
  const session = token ? adminSessions.get(token) : null;
  if (
    !session ||
    (!sessionHasPermission(session, "dashboard") && !sessionHasPermission(session, "admin"))
  ) {
    next(new Error("Dashboard access required."));
    return;
  }
  next();
});

io.on("connection", (socket) => {
  socket.emit("dashboard:update", getDashboardData());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening House Guest Check-In System running at http://localhost:${PORT}`);
  try {
    rebalanceActiveWaitingSchedule();
  } catch (error) {
    console.warn(`Schedule compaction skipped: ${error.message}`);
  }
  repairEnglishActivityTranslations().catch((error) => {
    console.warn(`Activity translation repair skipped: ${error.message}`);
  });
  try {
    const deletion = runDueYearlyDataDeletion();
    if (deletion) console.warn(`Yearly data deletion ran: ${deletion.ran_at}`);
  } catch (error) {
    console.warn(`Yearly data deletion skipped: ${error.message}`);
  }
});

setInterval(() => {
  try {
    runDueYearlyDataDeletion();
  } catch (error) {
    console.warn(`Yearly data deletion check skipped: ${error.message}`);
  }
}, SCHEDULED_MAINTENANCE_CHECK_MS).unref();
