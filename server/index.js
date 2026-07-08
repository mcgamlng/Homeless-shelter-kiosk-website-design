import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import {
  clearActiveCheckIns,
  clearCheckIn,
  changeAdminPin,
  applyDefaultActivities,
  createActivity,
  createAnalyticsWorkbook,
  createCheckIn,
  deleteActivity,
  getDailyExportDownload,
  getAdminSecuritySettings,
  getAnalyticsReport,
  getActivities,
  getDashboardData,
  getExportSettings,
  getSettings,
  inspectNameCheckIn,
  listDailyExports,
  moveScheduledItem,
  rebalanceActiveWaitingSchedule,
  reorderCheckInItems,
  runDailyExportArchive,
  runDueDailyExports,
  rescheduleScheduledItem,
  resetDailyData,
  sendDailyExportTestEmail,
  updateActivity,
  updateExportSettings,
  updateScheduledItemStatus,
  updateSetting,
  updateSettings,
  verifyNameSignIn,
  verifyAdminPin
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
  getNaturalSpeechAudio,
  getSpanishSpeechAudio,
  getSpeechStatus
} from "./speechService.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
const DAILY_EXPORT_CHECK_MS = 15 * 60 * 1000;

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

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Admin PIN required." });
  }
  return next();
}

function requireAdminDownload(req, res, next) {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : "";
  const queryToken = typeof req.query.token === "string" ? req.query.token : "";
  const token = bearerToken || queryToken;
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Admin PIN required." });
  }
  return next();
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
  requireAdmin,
  handleRoute((_req, res) => {
    res.json(getDashboardData());
  })
);

app.patch(
  "/api/scheduled-items/:id/status",
  requireAdmin,
  handleRoute((req, res) => {
    const item = updateScheduledItemStatus(req.params.id, req.body.status);
    emitDashboard();
    res.json(item);
  })
);

app.patch(
  "/api/scheduled-items/:id/move",
  requireAdmin,
  handleRoute((req, res) => {
    const item = moveScheduledItem(req.params.id, req.body.direction);
    emitDashboard();
    res.json(item);
  })
);

app.patch(
  "/api/scheduled-items/:id/reschedule",
  requireAdmin,
  handleRoute((req, res) => {
    const item = rescheduleScheduledItem(req.params.id, req.body.targetStart);
    emitDashboard();
    res.json(item);
  })
);

app.patch(
  "/api/check-ins/:id/reorder",
  requireAdmin,
  handleRoute((req, res) => {
    const checkIn = reorderCheckInItems(req.params.id, req.body.orderedIds);
    emitDashboard();
    res.json(checkIn);
  })
);

app.delete(
  "/api/check-ins/:id",
  requireAdmin,
  handleRoute((req, res) => {
    clearCheckIn(req.params.id);
    emitDashboard();
    res.json({ ok: true });
  })
);

app.post("/api/admin/session", (req, res) => {
  if (!verifyAdminPin(req.body.pin, ADMIN_PIN)) {
    return res.status(401).json({ error: "That PIN did not work." });
  }
  const token = crypto.randomUUID();
  adminSessions.set(token, { createdAt: Date.now() });
  return res.json({ token });
});

app.get(
  "/api/admin/security",
  requireAdmin,
  handleRoute((_req, res) => {
    res.json(getAdminSecuritySettings());
  })
);

app.put(
  "/api/admin/security/pin",
  handleRoute((req, res) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const hasValidSession = token && adminSessions.has(token);
    const hasValidCurrentPin = verifyAdminPin(
      req.body.currentPin ?? req.body.current_pin,
      ADMIN_PIN
    );

    if (!hasValidSession && !hasValidCurrentPin) {
      return res.status(401).json({ error: "Current PIN did not work." });
    }

    changeAdminPin(req.body, ADMIN_PIN);
    adminSessions.clear();
    res.json({ ok: true });
  })
);

app.post(
  "/api/admin/reset-day",
  requireAdmin,
  handleRoute((req, res) => {
    const data = resetDailyData({ seedDemo: Boolean(req.body.seedDemo) });
    emitDashboard();
    res.json(data);
  })
);

app.post(
  "/api/admin/clear-active",
  requireAdmin,
  handleRoute((_req, res) => {
    const data = clearActiveCheckIns();
    emitDashboard();
    res.json(data);
  })
);

app.get(
  "/api/admin/analytics",
  requireAdmin,
  handleRoute((req, res) => {
    res.json(getAnalyticsReport({ period: req.query.period, date: req.query.date }));
  })
);

app.get(
  "/api/admin/analytics/export",
  requireAdminDownload,
  handleRoute((req, res) => {
    const workbook = createAnalyticsWorkbook({ period: req.query.period, date: req.query.date });
    sendAnalyticsWorkbook(res, workbook);
  })
);

app.post(
  "/api/admin/analytics/export-link",
  requireAdmin,
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
  "/api/admin/export-settings",
  requireAdmin,
  handleRoute((_req, res) => {
    res.json(getExportSettings());
  })
);

app.put(
  "/api/admin/export-settings",
  requireAdmin,
  handleRoute((req, res) => {
    res.json(updateExportSettings(req.body || {}));
  })
);

app.get(
  "/api/admin/daily-exports",
  requireAdmin,
  handleRoute((_req, res) => {
    res.json(listDailyExports());
  })
);

app.post(
  "/api/admin/daily-exports/run",
  requireAdmin,
  handleRoute(async (req, res) => {
    res.json(
      await runDailyExportArchive({
        date: req.body.date,
        force: Boolean(req.body.force),
        sendEmail: req.body.sendEmail !== false
      })
    );
  })
);

app.post(
  "/api/admin/daily-exports/test-email",
  requireAdmin,
  handleRoute(async (_req, res) => {
    res.json(await sendDailyExportTestEmail());
  })
);

app.get(
  "/api/admin/daily-exports/:id/download",
  requireAdminDownload,
  handleRoute((req, res) => {
    const workbook = getDailyExportDownload(req.params.id);
    sendAnalyticsWorkbook(res, workbook);
  })
);

app.post(
  "/api/admin/activities",
  requireAdmin,
  handleRoute(async (req, res) => {
    const activity = createActivity(await enrichActivityTranslations(req.body));
    emitDashboard();
    res.status(201).json(activity);
  })
);

app.post(
  "/api/admin/activities/apply-listening-house-defaults",
  requireAdmin,
  handleRoute((_req, res) => {
    const data = applyDefaultActivities();
    emitDashboard();
    res.json(data);
  })
);

app.patch(
  "/api/admin/activities/:id",
  requireAdmin,
  handleRoute(async (req, res) => {
    const activity = updateActivity(req.params.id, await enrichActivityTranslations(req.body));
    emitDashboard();
    res.json(activity);
  })
);

app.post(
  "/api/admin/activity-translations",
  requireAdmin,
  handleRoute(async (req, res) => {
    res.json(await translateActivityLabel(req.body.name));
  })
);

app.delete(
  "/api/admin/activities/:id",
  requireAdmin,
  handleRoute((req, res) => {
    const activity = deleteActivity(req.params.id);
    emitDashboard();
    res.json({ ok: true, activity });
  })
);

app.put(
  "/api/admin/settings",
  requireAdmin,
  handleRoute((req, res) => {
    const settings = updateSettings(req.body.settings || req.body || {});
    emitDashboard();
    res.json(settings);
  })
);

app.put(
  "/api/admin/settings/:key",
  requireAdmin,
  handleRoute((req, res) => {
    const settings = updateSetting(req.params.key, req.body.value);
    emitDashboard();
    res.json(settings);
  })
);

app.post(
  "/api/admin/network/test",
  requireAdmin,
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
    return res.json({ ok: true, url: baseUrl });
  })
);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

const distPath = path.join(__dirname, "..", "dist");
const staticOptions = {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
      return;
    }

    res.setHeader("Cache-Control", "no-cache");
  }
};

app.use(express.static(distPath, staticOptions));
app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(distPath, "index.html"));
});

io.use((socket, next) => {
  const token = String(socket.handshake.auth?.token || "");
  if (!token || !adminSessions.has(token)) {
    next(new Error("Admin PIN required."));
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
  runDueDailyExports().catch((error) => {
    console.warn(`Daily export catch-up skipped: ${error.message}`);
  });
});

setInterval(() => {
  runDueDailyExports().catch((error) => {
    console.warn(`Daily export check skipped: ${error.message}`);
  });
}, DAILY_EXPORT_CHECK_MS).unref();
