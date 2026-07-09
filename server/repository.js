import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { applyListeningHouseActivityPreset, db } from "./db.js";
import {
  addMinutes,
  compactScheduleAfterFinalStatus,
  getActivityBounds,
  isWithinWorkday,
  parseStoredDate,
  rebalanceWaitingSchedule,
  repairScheduleAfterMove,
  roundUpToFiveMinutes,
  scheduleActivities
} from "./scheduler.js";
import { createWorkbookBuffer } from "./xlsx.js";
import {
  buildActivityTranslations,
  buildScheduledActivityTranslations,
  normalizeActivityName
} from "../shared/activityTranslations.js";
import {
  DEFAULT_KIOSK_CUSTOMIZATION,
  KIOSK_COLOR_KEYS,
  KIOSK_CUSTOMIZATION_KEYS,
  normalizeKioskColor
} from "../shared/kioskCustomization.js";

const ACTIVE_STATUSES = ["active"];
const DASHBOARD_ITEM_STATUSES = ["Waiting", "In Progress"];
const VALID_STATUSES = new Set(["Waiting", "In Progress", "Completed", "Skipped"]);
const FINAL_STATUSES = new Set(["Completed", "Skipped"]);
const SIGN_IN_TYPES = new Set(["sign_in", "sign_up"]);
const PIN_HASH_ITERATIONS = 100000;
const KIOSK_COLOR_KEY_SET = new Set(KIOSK_COLOR_KEYS);
const KIOSK_CUSTOMIZATION_KEY_SET = new Set(KIOSK_CUSTOMIZATION_KEYS);
const NETWORK_URL_KEYS = new Set(["preferred_local_url", "public_base_url"]);
const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat([], {
  year: "numeric",
  month: "long",
  day: "numeric"
});
const LOCAL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat([], {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit"
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const exportDirectory = path.resolve(
  process.env.EXPORTS_PATH || path.join(projectRoot, "data", "exports")
);

function rows(statement, params = []) {
  return db.prepare(statement).all(...params);
}

function one(statement, params = []) {
  return db.prepare(statement).get(...params);
}

function getSettingValue(key) {
  return one("SELECT value FROM settings WHERE key = ?", [key])?.value || "";
}

function setSettingValue(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(key, String(value ?? ""));
}

function normalizeSettingValue(key, value) {
  if (KIOSK_COLOR_KEY_SET.has(key)) {
    return normalizeKioskColor(value, DEFAULT_KIOSK_CUSTOMIZATION[key]);
  }
  if (KIOSK_CUSTOMIZATION_KEY_SET.has(key)) {
    return String(value || "")
      .trim()
      .slice(0, 260);
  }
  if (key === "network_mode") {
    return String(value || "").toLowerCase() === "public" ? "public" : "local";
  }
  if (NETWORK_URL_KEYS.has(key)) {
    return String(value || "")
      .trim()
      .slice(0, 300);
  }
  return value;
}

function cleanText(value, maxLength = 160) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function getNameFields(payload = {}) {
  return {
    firstName: cleanText(payload.firstName ?? payload.first_name, 80),
    lastName: cleanText(payload.lastName ?? payload.last_name, 80)
  };
}

function requireFullName(payload = {}) {
  const guest = getNameFields(payload);
  if (!guest.firstName || !guest.lastName) {
    const error = new Error("Please enter first and last name.");
    error.status = 400;
    throw error;
  }
  return guest;
}

function normalizeSignInMode(value) {
  const mode = cleanText(value, 40).toLowerCase().replaceAll("-", "_");
  if (mode === "profile" || mode === "signup") return "sign_up";
  if (mode === "signin" || mode === "returning") return "sign_in";
  if (mode === "auto" || !mode) return "auto";
  return SIGN_IN_TYPES.has(mode) ? mode : "auto";
}

function findGuestByName(guest) {
  return one(
    `SELECT id, first_name, last_name
     FROM guests
     WHERE lower(first_name) = lower(?)
       AND lower(last_name) = lower(?)
     ORDER BY datetime(updated_at) DESC, id DESC
     LIMIT 1`,
    [guest.firstName, guest.lastName]
  );
}

function prepareGuestForCheckIn(payload = {}) {
  const mode = normalizeSignInMode(payload.mode ?? payload.signInType ?? payload.sign_in_type);
  const guest = requireFullName(payload);
  const existing = findGuestByName(guest);

  if (mode === "auto") {
    return existing
      ? { guest, guestId: existing.id, signInType: "sign_in", createGuest: false }
      : { guest, guestId: null, signInType: "sign_up", createGuest: true };
  }

  if (mode === "sign_in") {
    if (!existing) {
      const error = new Error(
        "This name is not signed up yet. Use the Sign In / Sign Up flow to continue."
      );
      error.status = 404;
      throw error;
    }
    return { guest, guestId: existing.id, signInType: "sign_in", createGuest: false };
  }

  if (existing) {
    return { guest, guestId: existing.id, signInType: "sign_in", createGuest: false };
  }
  return { guest, guestId: null, signInType: "sign_up", createGuest: true };
}

export function verifyNameSignIn(payload = {}) {
  const guest = requireFullName(payload);
  if (!findGuestByName(guest)) {
    const error = new Error(
      "This name is not signed up yet. Use the Sign In / Sign Up flow to continue."
    );
    error.status = 404;
    throw error;
  }
  return true;
}

export function inspectNameCheckIn(payload = {}, referenceDate = new Date()) {
  ensureCurrentDashboardDay();
  const guest = requireFullName(payload);
  const existing = findGuestByName(guest);
  if (!existing) {
    return {
      ok: true,
      alreadyCheckedInToday: false,
      signInType: "sign_up"
    };
  }
  if (findGuestCheckInForCurrentDay(existing.id, referenceDate)) {
    const error = new Error("Hey, you already signed in for today. Please tell a staff member.");
    error.status = 409;
    throw error;
  }
  return {
    ok: true,
    alreadyCheckedInToday: false,
    signInType: "sign_in"
  };
}

function createGuestProfile(guest) {
  const info = db
    .prepare("INSERT INTO guests (first_name, last_name) VALUES (?, ?)")
    .run(guest.firstName, guest.lastName);
  return Number(info.lastInsertRowid);
}

function attachGuestSummary(row) {
  if (!row) return row;
  return {
    ...row,
    guest_name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim()
  };
}

function getTodayStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function getLocalDayBounds(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function findGuestCheckInForCurrentDay(guestId, referenceDate = new Date()) {
  const { dashboardDayStart, checkInIdFloor } = getCurrentDashboardDayContext();
  const bounds = getLocalDayBounds(referenceDate);
  return rows(
    `SELECT id, checked_in_at, status
     FROM check_ins
     WHERE guest_id = ?
     ORDER BY datetime(checked_in_at) DESC`,
    [guestId]
  ).find((row) => {
    const checkedInAt = parseStoredDate(row.checked_in_at);
    return (
      isInCurrentDashboardDay(row, dashboardDayStart, checkInIdFloor) &&
      checkedInAt >= bounds.start &&
      checkedInAt < bounds.end
    );
  });
}

function getStoredDashboardDayStart() {
  const storedStart = getSettingValue("current_day_started_at");
  if (!storedStart) return null;
  const parsed = parseStoredDate(storedStart);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCurrentDashboardDayStart() {
  return getStoredDashboardDayStart() || getTodayStart();
}

function setCurrentDashboardDayStart(date = new Date(), { useCheckInFloor = true } = {}) {
  const cleanDate = new Date(date);
  cleanDate.setMilliseconds(0);
  setSettingValue("current_day_started_at", cleanDate.toISOString());
  if (useCheckInFloor) {
    const latest = one("SELECT COALESCE(MAX(id), 0) AS id FROM check_ins");
    setSettingValue("current_day_start_check_in_id", String(latest?.id || 0));
  } else {
    setSettingValue("current_day_start_check_in_id", "0");
  }
}

function getCurrentDashboardDayContext() {
  return {
    dashboardDayStart: getCurrentDashboardDayStart(),
    checkInIdFloor: Number(getSettingValue("current_day_start_check_in_id") || 0)
  };
}

function ensureCurrentDashboardDay() {
  const todayStart = getTodayStart();
  const storedStart = getStoredDashboardDayStart();
  if (storedStart && storedStart >= todayStart) return;

  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE check_ins
       SET status = 'cleared', cleared_at = CURRENT_TIMESTAMP
       WHERE status = 'active'
         AND datetime(checked_in_at) < datetime(?)`
    ).run(todayStart.toISOString());
    setCurrentDashboardDayStart(todayStart, { useCheckInFloor: false });
  });
  transaction();
}

function isInCurrentDashboardDay(row, dashboardDayStart, checkInIdFloor) {
  if (checkInIdFloor > 0 && row.check_in_id !== undefined) {
    return Number(row.check_in_id) > checkInIdFloor;
  }
  if (checkInIdFloor > 0 && row.id !== undefined) {
    return Number(row.id) > checkInIdFloor;
  }
  return parseStoredDate(row.checked_in_at) >= dashboardDayStart;
}

export function getSettings() {
  const values = rows("SELECT key, value FROM settings").reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  const customization = KIOSK_CUSTOMIZATION_KEYS.reduce((acc, key) => {
    acc[key] =
      values[key] === undefined || values[key] === ""
        ? DEFAULT_KIOSK_CUSTOMIZATION[key]
        : values[key];
    return acc;
  }, {});
  return {
    buffer_minutes: Number(values.buffer_minutes || 5),
    workday_start: values.workday_start || "08:00",
    workday_end: values.workday_end || "16:00",
    network: {
      mode: values.network_mode === "public" ? "public" : "local",
      preferred_local_url: values.preferred_local_url || "",
      public_base_url: values.public_base_url || ""
    },
    customization
  };
}

export function updateSetting(key, value) {
  return updateSettings({ [key]: value });
}

export function updateSettings(settings = {}) {
  const transaction = db.transaction(() => {
    Object.entries(settings || {}).forEach(([key, value]) => {
      setSettingValue(key, normalizeSettingValue(key, value));
    });
  });
  transaction();
  return getSettings();
}

export function verifyAdminPin(pin, fallbackPin = "2468") {
  const storedHash = getSettingValue("admin_pin_hash");
  return storedHash
    ? verifySecret(String(pin || ""), storedHash)
    : String(pin || "") === String(fallbackPin || "2468");
}

export function getAdminSecuritySettings() {
  return { admin_pin_change_enabled: true };
}

export function changeAdminPin(payload = {}, fallbackPin = "2468") {
  const currentPin = payload.currentPin ?? payload.current_pin ?? "";
  const newPin = payload.newPin ?? payload.new_pin ?? "";
  if (!verifyAdminPin(currentPin, fallbackPin)) {
    const error = new Error("Current PIN did not work.");
    error.status = 401;
    throw error;
  }
  saveAdminPin(newPin);
  return true;
}

function normalizeActivityPayload(payload, current = {}) {
  const name = cleanText(payload.name ?? current.name, 120);
  const generatedTranslations = buildActivityTranslations(name);
  const nameChanged = normalizeActivityName(name) !== normalizeActivityName(current.name);
  const timeLimitEnabled =
    payload.time_limit_enabled === undefined
      ? Boolean(current.time_limit_enabled ?? true)
      : Boolean(payload.time_limit_enabled);
  const dailyLimitEnabled =
    payload.daily_limit_enabled === undefined
      ? Boolean(current.daily_limit_enabled)
      : Boolean(payload.daily_limit_enabled);
  const alarmEnabled =
    timeLimitEnabled &&
    (payload.alarm_enabled === undefined
      ? Boolean(current.alarm_enabled)
      : Boolean(payload.alarm_enabled));
  const availabilityWindowEnabled =
    payload.availability_window_enabled === undefined
      ? Boolean(current.availability_window_enabled)
      : Boolean(payload.availability_window_enabled);
  const monthlyWindowEnabled =
    payload.monthly_window_enabled === undefined
      ? Boolean(current.monthly_window_enabled)
      : Boolean(payload.monthly_window_enabled);
  const yearlyWindowEnabled =
    payload.yearly_window_enabled === undefined
      ? Boolean(current.yearly_window_enabled)
      : Boolean(payload.yearly_window_enabled);
  const durationMinutes = Math.max(
    1,
    Number(payload.duration_minutes ?? current.duration_minutes ?? 20)
  );
  const dailyLimit = dailyLimitEnabled
    ? Math.max(1, Number(payload.daily_limit ?? current.daily_limit ?? 1))
    : null;
  const alarmMinutesBefore = Math.max(
    1,
    Math.min(
      durationMinutes,
      Number(payload.alarm_minutes_before ?? current.alarm_minutes_before ?? 5)
    )
  );
  const availabilityStart = normalizeClockTime(
    payload.availability_start ?? current.availability_start,
    "08:00"
  );
  const availabilityEnd = normalizeClockTime(
    payload.availability_end ?? current.availability_end,
    "16:00"
  );
  if (availabilityWindowEnabled && availabilityStart === availabilityEnd) {
    const error = new Error("Activity start and end times must be different.");
    error.status = 400;
    throw error;
  }
  const monthlyStartDay = normalizeDayOfMonth(
    payload.monthly_start_day ?? current.monthly_start_day,
    1
  );
  const monthlyEndDay = normalizeDayOfMonth(payload.monthly_end_day ?? current.monthly_end_day, 31);
  const yearlyStart = normalizeMonthDay(payload.yearly_start ?? current.yearly_start, "01-01");
  const yearlyEnd = normalizeMonthDay(payload.yearly_end ?? current.yearly_end, "12-31");

  return {
    name,
    name_es: normalizeActivityTranslation(
      "name_es",
      payload,
      current,
      generatedTranslations,
      nameChanged
    ),
    name_hmn: normalizeActivityTranslation(
      "name_hmn",
      payload,
      current,
      generatedTranslations,
      nameChanged
    ),
    name_so: normalizeActivityTranslation(
      "name_so",
      payload,
      current,
      generatedTranslations,
      nameChanged
    ),
    durationMinutes,
    timeLimitEnabled,
    availabilityWindowEnabled,
    availabilityStart,
    availabilityEnd,
    monthlyWindowEnabled,
    monthlyStartDay,
    monthlyEndDay,
    yearlyWindowEnabled,
    yearlyStart,
    yearlyEnd,
    dailyLimitEnabled,
    dailyLimit,
    alarmEnabled,
    alarmMinutesBefore,
    icon: cleanText(payload.icon ?? current.icon ?? "heart-hand", 60),
    active: payload.active === undefined ? Boolean(current.active ?? true) : Boolean(payload.active)
  };
}

function normalizeActivityTranslation(field, payload, current, generatedTranslations, nameChanged) {
  const payloadHasField = Object.hasOwn(payload, field);
  const incoming = payloadHasField ? cleanText(payload[field], 140) : "";
  const currentValue = cleanText(current[field], 140);
  if (incoming && (!nameChanged || incoming !== currentValue)) return incoming;
  if (!nameChanged && currentValue) return currentValue;
  return generatedTranslations[field] || "";
}

function normalizeClockTime(value, fallback) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeDayOfMonth(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(31, Math.max(1, parsed)) : fallback;
}

function normalizeMonthDay(value, fallback) {
  const match = String(value || "").match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) return fallback;
  const month = Math.min(12, Math.max(1, Number(match[1])));
  const maxDay = new Date(2000, month, 0).getDate();
  const day = Math.min(maxDay, Math.max(1, Number(match[2])));
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function valueFallsInRecurringRange(value, start, end) {
  return start <= end ? value >= start && value <= end : value >= start || value <= end;
}

function isActivityDateAvailable(activity, referenceDate = new Date()) {
  if (
    activity.monthly_window_enabled &&
    !valueFallsInRecurringRange(
      referenceDate.getDate(),
      Number(activity.monthly_start_day || 1),
      Number(activity.monthly_end_day || 31)
    )
  ) {
    return false;
  }
  if (activity.yearly_window_enabled) {
    const monthDay = `${String(referenceDate.getMonth() + 1).padStart(2, "0")}-${String(
      referenceDate.getDate()
    ).padStart(2, "0")}`;
    if (
      !valueFallsInRecurringRange(
        monthDay,
        activity.yearly_start || "01-01",
        activity.yearly_end || "12-31"
      )
    ) {
      return false;
    }
  }
  return true;
}

function activityUsageCounts() {
  const { dashboardDayStart, checkInIdFloor } = getCurrentDashboardDayContext();
  const counts = new Map();
  rows(
    `SELECT sai.activity_id, sai.check_in_id, ci.checked_in_at
     FROM scheduled_activity_items sai
     JOIN check_ins ci ON ci.id = sai.check_in_id`
  )
    .filter((row) => isInCurrentDashboardDay(row, dashboardDayStart, checkInIdFloor))
    .forEach((row) => {
      const key = Number(row.activity_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  return counts;
}

export function getActivities({ includeInactive = false } = {}) {
  ensureCurrentDashboardDay();
  const usage = activityUsageCounts();
  const settings = getSettings();
  const now = new Date();
  const where = includeInactive ? "" : "WHERE active = 1";
  return rows(
    `SELECT id, name, name_es, name_hmn, name_so,
            duration_minutes, time_limit_enabled, availability_window_enabled,
            availability_start, availability_end,
            monthly_window_enabled, monthly_start_day, monthly_end_day,
            yearly_window_enabled, yearly_start, yearly_end,
            daily_limit_enabled,
            daily_limit, alarm_enabled, alarm_minutes_before, icon, active, sort_order
     FROM activities
     ${where}
     ORDER BY sort_order, name`
  ).map((activity) => {
    const dailyUsed = usage.get(Number(activity.id)) || 0;
    const dailyLimitEnabled = Boolean(activity.daily_limit_enabled);
    const remaining = dailyLimitEnabled
      ? Math.max(0, Number(activity.daily_limit || 0) - dailyUsed)
      : null;
    const availabilityWindowEnabled = Boolean(activity.availability_window_enabled);
    const monthlyWindowEnabled = Boolean(activity.monthly_window_enabled);
    const yearlyWindowEnabled = Boolean(activity.yearly_window_enabled);
    const availabilityBounds = getActivityBounds(now, activity, settings);
    const isAvailableNow =
      isActivityDateAvailable(activity, now) &&
      (!availabilityWindowEnabled ||
        (now >= availabilityBounds.start && now < availabilityBounds.end));
    return {
      ...activity,
      active: Boolean(activity.active),
      time_limit_enabled: Boolean(activity.time_limit_enabled),
      availability_window_enabled: availabilityWindowEnabled,
      monthly_window_enabled: monthlyWindowEnabled,
      yearly_window_enabled: yearlyWindowEnabled,
      daily_limit_enabled: dailyLimitEnabled,
      alarm_enabled: Boolean(activity.alarm_enabled),
      daily_used: dailyUsed,
      daily_remaining: remaining,
      is_full: dailyLimitEnabled && remaining <= 0,
      is_available_now: isAvailableNow,
      is_unavailable: !isAvailableNow
    };
  });
}

export function createActivity(payload) {
  const activity = normalizeActivityPayload(payload);
  if (!activity.name) {
    const error = new Error("Enter an activity name.");
    error.status = 400;
    throw error;
  }
  const maxSort = one(
    "SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM activities"
  ).sort_order;
  const info = db
    .prepare(
      `INSERT INTO activities
       (name, name_es, name_hmn, name_so,
        duration_minutes, time_limit_enabled, availability_window_enabled,
        availability_start, availability_end,
        monthly_window_enabled, monthly_start_day, monthly_end_day,
        yearly_window_enabled, yearly_start, yearly_end,
        daily_limit_enabled, daily_limit,
        alarm_enabled, alarm_minutes_before, icon, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      activity.name,
      activity.name_es,
      activity.name_hmn,
      activity.name_so,
      activity.durationMinutes,
      activity.timeLimitEnabled ? 1 : 0,
      activity.availabilityWindowEnabled ? 1 : 0,
      activity.availabilityStart,
      activity.availabilityEnd,
      activity.monthlyWindowEnabled ? 1 : 0,
      activity.monthlyStartDay,
      activity.monthlyEndDay,
      activity.yearlyWindowEnabled ? 1 : 0,
      activity.yearlyStart,
      activity.yearlyEnd,
      activity.dailyLimitEnabled ? 1 : 0,
      activity.dailyLimit,
      activity.alarmEnabled ? 1 : 0,
      activity.alarmMinutesBefore,
      activity.icon,
      activity.active ? 1 : 0,
      maxSort + 1
    );
  return getActivities({ includeInactive: true }).find(
    (candidate) => Number(candidate.id) === Number(info.lastInsertRowid)
  );
}

export function updateActivity(id, payload) {
  const current = one("SELECT * FROM activities WHERE id = ?", [id]);
  if (!current) {
    const error = new Error("Activity not found.");
    error.status = 404;
    throw error;
  }
  const activity = normalizeActivityPayload(payload, current);
  if (!activity.name) {
    const error = new Error("Enter an activity name.");
    error.status = 400;
    throw error;
  }
  db.prepare(
    `UPDATE activities
     SET name = ?, name_es = ?, name_hmn = ?, name_so = ?,
         duration_minutes = ?, time_limit_enabled = ?,
         availability_window_enabled = ?, availability_start = ?, availability_end = ?,
         monthly_window_enabled = ?, monthly_start_day = ?, monthly_end_day = ?,
         yearly_window_enabled = ?, yearly_start = ?, yearly_end = ?,
         daily_limit_enabled = ?, daily_limit = ?, alarm_enabled = ?,
         alarm_minutes_before = ?, icon = ?, active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    activity.name,
    activity.name_es,
    activity.name_hmn,
    activity.name_so,
    activity.durationMinutes,
    activity.timeLimitEnabled ? 1 : 0,
    activity.availabilityWindowEnabled ? 1 : 0,
    activity.availabilityStart,
    activity.availabilityEnd,
    activity.monthlyWindowEnabled ? 1 : 0,
    activity.monthlyStartDay,
    activity.monthlyEndDay,
    activity.yearlyWindowEnabled ? 1 : 0,
    activity.yearlyStart,
    activity.yearlyEnd,
    activity.dailyLimitEnabled ? 1 : 0,
    activity.dailyLimit,
    activity.alarmEnabled ? 1 : 0,
    activity.alarmMinutesBefore,
    activity.icon,
    activity.active ? 1 : 0,
    id
  );
  return getActivities({ includeInactive: true }).find(
    (candidate) => Number(candidate.id) === Number(id)
  );
}

export function deleteActivity(id) {
  const current = one("SELECT * FROM activities WHERE id = ?", [id]);
  if (!current) {
    const error = new Error("Activity not found.");
    error.status = 404;
    throw error;
  }
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE scheduled_activity_items
       SET activity_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE activity_id = ?`
    ).run(id);
    db.prepare("DELETE FROM activities WHERE id = ?").run(id);
  });
  transaction();
  return current;
}

export function applyDefaultActivities() {
  applyListeningHouseActivityPreset(db, { replaceStockDefaults: false });
  return getDashboardData();
}

export function getActiveScheduledItems() {
  const { dashboardDayStart, checkInIdFloor } = getCurrentDashboardDayContext();
  return rows(
    `SELECT sai.*, ci.language, ci.checked_in_at
     FROM scheduled_activity_items sai
     JOIN check_ins ci ON ci.id = sai.check_in_id
     WHERE ci.status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})
       AND sai.status IN (${DASHBOARD_ITEM_STATUSES.map(() => "?").join(",")})
       AND sai.is_timed = 1
     ORDER BY datetime(sai.scheduled_start), sai.sort_order`,
    [...ACTIVE_STATUSES, ...DASHBOARD_ITEM_STATUSES]
  ).filter((row) => isInCurrentDashboardDay(row, dashboardDayStart, checkInIdFloor));
}

function getScheduledItemsForActiveCheckIns() {
  const { dashboardDayStart, checkInIdFloor } = getCurrentDashboardDayContext();
  return rows(
    `SELECT sai.*, ci.language, ci.checked_in_at
     FROM scheduled_activity_items sai
     JOIN check_ins ci ON ci.id = sai.check_in_id
     WHERE ci.status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})
       AND sai.is_timed = 1
     ORDER BY datetime(sai.scheduled_start), sai.sort_order`,
    ACTIVE_STATUSES
  ).filter((row) => isInCurrentDashboardDay(row, dashboardDayStart, checkInIdFloor));
}

export function rebalanceActiveWaitingSchedule(now = new Date()) {
  ensureCurrentDashboardDay();
  const settings = getSettings();
  const repairedItems = rebalanceWaitingSchedule({
    items: getScheduledItemsForActiveCheckIns(),
    bufferMinutes: settings.buffer_minutes,
    settings,
    now
  });
  const transaction = db.transaction(() => {
    const update = db.prepare(
      `UPDATE scheduled_activity_items
       SET scheduled_start = ?, scheduled_end = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'Waiting'`
    );
    repairedItems.forEach((item) => {
      if (item.status === "Waiting") {
        update.run(item.scheduled_start, item.scheduled_end, item.id);
      }
    });
  });
  transaction();
  return repairedItems;
}

function validateDailyLimits(activities) {
  const usage = activityUsageCounts();
  activities.forEach((activity) => {
    if (!activity.daily_limit_enabled) return;
    const used = usage.get(Number(activity.id)) || 0;
    if (used >= Number(activity.daily_limit)) {
      const error = new Error(`${activity.name} has reached its daily limit.`);
      error.status = 409;
      throw error;
    }
  });
}

function validateActivityAvailability(activities, settings, now = new Date()) {
  if (!isWithinWorkday(now, settings)) {
    const error = new Error("The workday is closed. Please ask staff for help.");
    error.status = 409;
    throw error;
  }

  activities.forEach((activity) => {
    const unavailableByDate = !isActivityDateAvailable(activity, now);
    const bounds = getActivityBounds(now, activity, settings);
    const unavailableByTime =
      activity.availability_window_enabled && (now < bounds.start || now >= bounds.end);
    if (unavailableByDate || unavailableByTime) {
      const error = new Error(`${activity.name} is not available right now.`);
      error.status = 409;
      throw error;
    }
  });
}

export function createCheckIn({ activityIds, language, signIn }) {
  ensureCurrentDashboardDay();
  if (!Array.isArray(activityIds) || activityIds.length === 0) {
    const error = new Error("Please choose at least one activity.");
    error.status = 400;
    throw error;
  }

  const guestContext = prepareGuestForCheckIn(signIn || {});
  const placeholders = activityIds.map(() => "?").join(",");
  const activities = rows(
    `SELECT id, name, name_es, name_hmn, name_so,
            duration_minutes, time_limit_enabled, availability_window_enabled,
            availability_start, availability_end,
            monthly_window_enabled, monthly_start_day, monthly_end_day,
            yearly_window_enabled, yearly_start, yearly_end,
            daily_limit_enabled,
            daily_limit, alarm_enabled, alarm_minutes_before
     FROM activities
     WHERE active = 1 AND id IN (${placeholders})
     ORDER BY sort_order, name`,
    activityIds.map(Number)
  ).map((activity) => ({
    ...activity,
    time_limit_enabled: Boolean(activity.time_limit_enabled),
    availability_window_enabled: Boolean(activity.availability_window_enabled),
    monthly_window_enabled: Boolean(activity.monthly_window_enabled),
    yearly_window_enabled: Boolean(activity.yearly_window_enabled),
    daily_limit_enabled: Boolean(activity.daily_limit_enabled),
    alarm_enabled: Boolean(activity.alarm_enabled)
  }));
  if (activities.length !== new Set(activityIds.map(Number)).size) {
    const error = new Error("One or more selected activities are not available right now.");
    error.status = 400;
    throw error;
  }
  validateDailyLimits(activities);

  const settings = getSettings();
  validateActivityAvailability(activities, settings);
  const existingItems = getActiveScheduledItems();
  const transaction = db.transaction(() => {
    const guestId = guestContext.createGuest
      ? createGuestProfile(guestContext.guest)
      : guestContext.guestId;
    if (!guestContext.createGuest) {
      db.prepare("UPDATE guests SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(guestId);
    }
    if (findGuestCheckInForCurrentDay(guestId)) {
      const error = new Error("Hey, you already signed in for today. Please tell a staff member.");
      error.status = 409;
      throw error;
    }

    validateDailyLimits(activities);
    validateActivityAvailability(activities, settings);
    const checkInInfo = db
      .prepare(
        `INSERT INTO check_ins (guest_id, sign_in_type, language, status)
         VALUES (?, ?, ?, 'active')`
      )
      .run(guestId, guestContext.signInType, language || "en");
    const checkInId = Number(checkInInfo.lastInsertRowid);
    const timedItems = scheduleActivities({
      activities,
      guestId,
      existingItems,
      bufferMinutes: settings.buffer_minutes,
      settings
    });
    const timedByActivity = new Map(timedItems.map((item) => [Number(item.activity_id), item]));
    const insertItem = db.prepare(
      `INSERT INTO scheduled_activity_items
       (check_in_id, activity_id, guest_id, activity_name,
        activity_name_es, activity_name_hmn, activity_name_so,
        duration_minutes, is_timed,
        activity_window_enabled, activity_start_time, activity_end_time,
        scheduled_start, scheduled_end,
        alarm_enabled, alarm_minutes_before, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Waiting', ?)`
    );
    activities.forEach((activity, index) => {
      const timed = timedByActivity.get(Number(activity.id));
      const translations = buildScheduledActivityTranslations(activity);
      insertItem.run(
        checkInId,
        activity.id,
        guestId,
        activity.name,
        translations.activity_name_es,
        translations.activity_name_hmn,
        translations.activity_name_so,
        activity.duration_minutes,
        timed ? 1 : 0,
        activity.availability_window_enabled ? 1 : 0,
        activity.availability_start,
        activity.availability_end,
        timed?.scheduled_start || null,
        timed?.scheduled_end || null,
        timed?.alarm_enabled || 0,
        timed?.alarm_minutes_before || activity.alarm_minutes_before || 5,
        index + 1
      );
    });
    return checkInId;
  });

  const checkInId = transaction();
  rebalanceActiveWaitingSchedule();
  return getCheckIn(checkInId);
}

export function getCheckIn(id) {
  const checkIn = one(
    `SELECT ci.*, g.first_name, g.last_name
     FROM check_ins ci
     JOIN guests g ON g.id = ci.guest_id
     WHERE ci.id = ?`,
    [id]
  );
  if (!checkIn) return null;
  const items = rows(
    `SELECT * FROM scheduled_activity_items
     WHERE check_in_id = ?
     ORDER BY sort_order, datetime(scheduled_start)`,
    [id]
  ).map(normalizeScheduledItem);
  return { ...attachGuestSummary(checkIn), items };
}

function normalizeScheduledItem(item) {
  return {
    ...item,
    is_timed: Boolean(item.is_timed),
    activity_window_enabled: Boolean(item.activity_window_enabled),
    alarm_enabled: Boolean(item.alarm_enabled)
  };
}

export function getDashboardData() {
  ensureCurrentDashboardDay();
  const { dashboardDayStart, checkInIdFloor } = getCurrentDashboardDayContext();
  const dailyNumberRows =
    checkInIdFloor > 0
      ? rows(
          `SELECT id, checked_in_at
           FROM check_ins
           WHERE id > ?
           ORDER BY datetime(checked_in_at), id`,
          [checkInIdFloor]
        )
      : rows(
          `SELECT id, checked_in_at
           FROM check_ins
           WHERE checked_in_at >= ?
           ORDER BY datetime(checked_in_at), id`,
          [formatSqliteUtcTimestamp(dashboardDayStart)]
        );
  const dailyNumbers = new Map(dailyNumberRows.map((row, index) => [Number(row.id), index + 1]));
  const activeCheckIns = rows(
    `SELECT ci.*, g.first_name, g.last_name
     FROM check_ins ci
     JOIN guests g ON g.id = ci.guest_id
     WHERE ci.status = 'active'
     ORDER BY datetime(ci.checked_in_at) DESC`
  )
    .filter((row) => isInCurrentDashboardDay(row, dashboardDayStart, checkInIdFloor))
    .map((checkIn) => ({
      ...attachGuestSummary(checkIn),
      daily_number: dailyNumbers.get(Number(checkIn.id)),
      items: rows(
        `SELECT * FROM scheduled_activity_items
         WHERE check_in_id = ?
         ORDER BY sort_order, datetime(scheduled_start)`,
        [checkIn.id]
      ).map(normalizeScheduledItem)
    }));

  const scheduledItems = rows(
    `SELECT
       sai.*, ci.language, ci.checked_in_at, ci.sign_in_type,
       g.first_name, g.last_name
     FROM scheduled_activity_items sai
     JOIN check_ins ci ON ci.id = sai.check_in_id
     JOIN guests g ON g.id = ci.guest_id
     WHERE ci.status = 'active'
     ORDER BY sai.is_timed DESC, datetime(sai.scheduled_start), sai.sort_order`
  )
    .filter((row) => isInCurrentDashboardDay(row, dashboardDayStart, checkInIdFloor))
    .map((row) => ({
      ...normalizeScheduledItem(attachGuestSummary(row)),
      daily_number: dailyNumbers.get(Number(row.check_in_id))
    }));

  return {
    activeCheckIns,
    scheduledItems,
    activities: getActivities({ includeInactive: true }),
    settings: getSettings(),
    totals: getDailyTotals()
  };
}

export function updateScheduledItemStatus(id, status) {
  ensureCurrentDashboardDay();
  if (!VALID_STATUSES.has(status)) {
    const error = new Error("Status must be Waiting, In Progress, Completed, or Skipped.");
    error.status = 400;
    throw error;
  }
  const item = one("SELECT * FROM scheduled_activity_items WHERE id = ?", [id]);
  if (!item) {
    const error = new Error("Activity request not found.");
    error.status = 404;
    throw error;
  }

  const transaction = db.transaction(() => {
    if (status === "In Progress" && item.is_timed && item.status !== "In Progress") {
      const settings = getSettings();
      const repairedItems = repairScheduleAfterMove({
        items: getActiveScheduledItems(),
        itemId: id,
        targetStart: roundUpToFiveMinutes(new Date()),
        bufferMinutes: settings.buffer_minutes,
        settings
      });
      const update = db.prepare(
        `UPDATE scheduled_activity_items
         SET status = ?, scheduled_start = ?, scheduled_end = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      );
      repairedItems.forEach((candidate) => {
        update.run(
          Number(candidate.id) === Number(id) ? "In Progress" : candidate.status,
          candidate.scheduled_start,
          candidate.scheduled_end,
          candidate.id
        );
      });
    } else if (FINAL_STATUSES.has(status) && item.is_timed) {
      const repairedItems = compactScheduleAfterFinalStatus({
        items: getScheduledItemsForActiveCheckIns(),
        itemId: id,
        status,
        bufferMinutes: getSettings().buffer_minutes,
        settings: getSettings()
      });
      const update = db.prepare(
        `UPDATE scheduled_activity_items
         SET status = ?, scheduled_start = ?, scheduled_end = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      );
      repairedItems.forEach((candidate) => {
        update.run(
          candidate.status,
          candidate.scheduled_start,
          candidate.scheduled_end,
          candidate.id
        );
      });
    } else {
      db.prepare(
        `UPDATE scheduled_activity_items
         SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(status, id);
    }
    db.prepare(
      `INSERT INTO status_history (scheduled_item_id, old_status, new_status)
       VALUES (?, ?, ?)`
    ).run(id, item.status, status);
    const remaining = one(
      `SELECT COUNT(*) AS count
       FROM scheduled_activity_items
       WHERE check_in_id = ? AND status IN ('Waiting', 'In Progress')`,
      [item.check_in_id]
    ).count;
    if (remaining === 0) {
      db.prepare(
        `UPDATE check_ins
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(item.check_in_id);
    }
  });
  transaction();
  return normalizeScheduledItem(one("SELECT * FROM scheduled_activity_items WHERE id = ?", [id]));
}

export function moveScheduledItem(id, direction) {
  const item = one("SELECT * FROM scheduled_activity_items WHERE id = ?", [id]);
  if (!item?.is_timed) {
    const error = new Error("This activity does not use scheduled time.");
    error.status = 409;
    throw error;
  }
  const minutes = direction === "earlier" ? -5 : 5;
  return rescheduleScheduledItem(id, addMinutes(parseStoredDate(item.scheduled_start), minutes));
}

export function rescheduleScheduledItem(id, targetStartValue) {
  ensureCurrentDashboardDay();
  const item = one("SELECT * FROM scheduled_activity_items WHERE id = ?", [id]);
  if (!item) {
    const error = new Error("Activity request not found.");
    error.status = 404;
    throw error;
  }
  if (!item.is_timed) {
    const error = new Error("This activity does not use scheduled time.");
    error.status = 409;
    throw error;
  }
  const targetStart = new Date(targetStartValue);
  if (Number.isNaN(targetStart.getTime())) {
    const error = new Error("Provide a valid target start time.");
    error.status = 400;
    throw error;
  }
  const settings = getSettings();
  const repairedItems = repairScheduleAfterMove({
    items: getActiveScheduledItems(),
    itemId: id,
    targetStart,
    bufferMinutes: settings.buffer_minutes,
    settings
  });
  const transaction = db.transaction(() => {
    const update = db.prepare(
      `UPDATE scheduled_activity_items
       SET scheduled_start = ?, scheduled_end = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    repairedItems.forEach((candidate) => {
      update.run(candidate.scheduled_start, candidate.scheduled_end, candidate.id);
    });
  });
  transaction();
  return normalizeScheduledItem(one("SELECT * FROM scheduled_activity_items WHERE id = ?", [id]));
}

export function reorderCheckInItems(checkInId, orderedIds) {
  ensureCurrentDashboardDay();
  const timedItems = rows(
    `SELECT * FROM scheduled_activity_items
     WHERE check_in_id = ? AND is_timed = 1`,
    [checkInId]
  );
  const knownIds = new Set(timedItems.map((item) => Number(item.id)));
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.length !== timedItems.length ||
    orderedIds.some((id) => !knownIds.has(Number(id)))
  ) {
    const error = new Error("The reorder list must include every timed activity for this guest.");
    error.status = 400;
    throw error;
  }
  const ordered = orderedIds.map((id) => timedItems.find((item) => Number(item.id) === Number(id)));
  const settings = getSettings();
  const firstStart = new Date(
    Math.min(...timedItems.map((item) => parseStoredDate(item.scheduled_start).getTime()))
  );
  const otherActiveItems = getActiveScheduledItems().filter(
    (item) => Number(item.check_in_id) !== Number(checkInId)
  );
  const rescheduled = scheduleActivities({
    activities: ordered.map((item) => ({
      id: item.activity_id,
      name: item.activity_name,
      duration_minutes: item.duration_minutes,
      time_limit_enabled: true,
      availability_window_enabled: Boolean(item.activity_window_enabled),
      availability_start: item.activity_start_time,
      availability_end: item.activity_end_time,
      alarm_enabled: item.alarm_enabled,
      alarm_minutes_before: item.alarm_minutes_before
    })),
    guestId: ordered[0]?.guest_id,
    existingItems: otherActiveItems,
    bufferMinutes: settings.buffer_minutes,
    now: new Date(Math.max(firstStart.getTime(), Date.now())),
    preserveOrder: true,
    settings
  });
  const transaction = db.transaction(() => {
    ordered.forEach((item, index) => {
      const scheduled = rescheduled[index];
      db.prepare(
        `UPDATE scheduled_activity_items
         SET sort_order = ?, scheduled_start = ?, scheduled_end = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(index + 1, scheduled.scheduled_start, scheduled.scheduled_end, item.id);
    });
  });
  transaction();
  return getCheckIn(checkInId);
}

export function clearCheckIn(id) {
  ensureCurrentDashboardDay();
  const checkIn = one("SELECT id FROM check_ins WHERE id = ?", [id]);
  if (!checkIn) {
    const error = new Error("Check-in not found.");
    error.status = 404;
    throw error;
  }
  db.prepare(
    `UPDATE check_ins
     SET status = 'cleared', cleared_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(id);
  return true;
}

export function resetDailyData({ seedDemo = false } = {}) {
  const transaction = db.transaction(() => {
    if (seedDemo) {
      db.prepare("DELETE FROM status_history").run();
      db.prepare("DELETE FROM scheduled_activity_items").run();
      db.prepare("DELETE FROM check_ins").run();
      db.prepare("DELETE FROM guests").run();
    } else {
      db.prepare(
        `UPDATE check_ins
         SET status = 'cleared', cleared_at = CURRENT_TIMESTAMP
         WHERE status = 'active'`
      ).run();
    }
    setCurrentDashboardDayStart();
  });
  transaction();
  if (seedDemo) seedDemoCheckIns();
  return getDashboardData();
}

export function clearActiveCheckIns() {
  ensureCurrentDashboardDay();
  db.prepare(
    `UPDATE check_ins
     SET status = 'cleared', cleared_at = CURRENT_TIMESTAMP
     WHERE status = 'active'`
  ).run();
  return getDashboardData();
}

export function seedDemoCheckIns() {
  const activities = getActivities();
  const byName = new Map(activities.map((activity) => [activity.name, activity.id]));
  const samples = [
    {
      firstName: "Maya",
      lastName: "Johnson",
      language: "en",
      activities: ["Meal / Snacks", "Mail Pickup", "Rest Area"]
    },
    {
      firstName: "Ari",
      lastName: "Lee",
      language: "en",
      activities: ["Shower", "Meal / Snacks", "Phone Charging"]
    },
    {
      firstName: "Samira",
      lastName: "Ahmed",
      language: "so",
      activities: ["Laundry", "Clothing / Fresh Clothes", "Housing Help"]
    }
  ];
  samples.forEach((sample) => {
    createCheckIn({
      language: sample.language,
      activityIds: sample.activities.map((name) => byName.get(name)).filter(Boolean),
      signIn: {
        mode: "sign_up",
        firstName: sample.firstName,
        lastName: sample.lastName
      }
    });
  });
}

export function getDailyTotals() {
  ensureCurrentDashboardDay();
  const { dashboardDayStart, checkInIdFloor } = getCurrentDashboardDayContext();
  const currentDayWhere = checkInIdFloor > 0 ? "ci.id > ?" : "ci.checked_in_at >= ?";
  const currentDayParameter =
    checkInIdFloor > 0 ? checkInIdFloor : formatSqliteUtcTimestamp(dashboardDayStart);
  const checkInsToday = rows(
    `SELECT ci.id, ci.status, ci.checked_in_at, g.first_name, g.last_name
     FROM check_ins ci
     JOIN guests g ON g.id = ci.guest_id
     WHERE ${currentDayWhere}`,
    [currentDayParameter]
  );
  const itemsToday = rows(
    `SELECT sai.activity_name, sai.status, sai.check_in_id, ci.checked_in_at
     FROM scheduled_activity_items sai
     JOIN check_ins ci ON ci.id = sai.check_in_id
     WHERE ${currentDayWhere}`,
    [currentDayParameter]
  );
  const activityCounts = new Map();
  itemsToday.forEach((item) => {
    activityCounts.set(item.activity_name, (activityCounts.get(item.activity_name) || 0) + 1);
  });
  return {
    guestsCheckedIn: checkInsToday.length,
    completedActivities: itemsToday.filter((item) => item.status === "Completed").length,
    skippedActivities: itemsToday.filter((item) => item.status === "Skipped").length,
    activeGuests: checkInsToday
      .filter((row) => row.status === "active")
      .map((row) => `${row.first_name} ${row.last_name}`),
    mostRequestedActivities: [...activityCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5)
  };
}

export function getAnalyticsReport({ period = "day", date } = {}) {
  const bounds = getReportBounds(period, date);
  const rangeParameters = [
    formatSqliteUtcTimestamp(bounds.start),
    formatSqliteUtcTimestamp(bounds.end)
  ];
  const details = rows(
    `SELECT
       sai.id, sai.activity_name, sai.status, sai.scheduled_start, sai.scheduled_end,
       sai.duration_minutes, sai.is_timed, ci.guest_id, ci.sign_in_type,
       ci.checked_in_at, ci.status AS check_in_status, g.first_name, g.last_name
     FROM scheduled_activity_items sai
     JOIN check_ins ci ON ci.id = sai.check_in_id
     JOIN guests g ON g.id = ci.guest_id
     WHERE ci.checked_in_at >= ? AND ci.checked_in_at < ?
     ORDER BY datetime(ci.checked_in_at), sai.activity_name`,
    rangeParameters
  ).map((row) => normalizeScheduledItem(attachGuestSummary(row)));
  const checkIns = rows(
    `SELECT ci.*, g.first_name, g.last_name
     FROM check_ins ci
     JOIN guests g ON g.id = ci.guest_id
     WHERE ci.checked_in_at >= ? AND ci.checked_in_at < ?
     ORDER BY datetime(ci.checked_in_at), g.last_name, g.first_name`,
    rangeParameters
  ).map(attachGuestSummary);
  const activityMap = new Map();
  const dayMap = new Map();
  const peopleMap = new Map();
  const dailyGuestMap = new Map(
    enumerateReportDates(bounds).map((date) => [
      date,
      {
        date,
        checkIns: 0,
        uniqueGuests: new Set(),
        guestNames: new Set(),
        newSignUps: 0,
        returningSignIns: 0,
        activityRequests: 0,
        completed: 0,
        skipped: 0
      }
    ])
  );
  const statusTotals = { Waiting: 0, "In Progress": 0, Completed: 0, Skipped: 0 };

  checkIns.forEach((row) => {
    const checkInDate = formatDateKey(parseStoredDate(row.checked_in_at));
    const dailyGuest = dailyGuestMap.get(checkInDate);
    if (dailyGuest) {
      dailyGuest.checkIns += 1;
      dailyGuest.uniqueGuests.add(row.guest_id);
      dailyGuest.guestNames.add(row.guest_name);
      if (row.sign_in_type === "sign_up") dailyGuest.newSignUps += 1;
      if (row.sign_in_type === "sign_in") dailyGuest.returningSignIns += 1;
    }
    if (!peopleMap.has(row.guest_id)) {
      peopleMap.set(row.guest_id, {
        guestId: row.guest_id,
        guestName: row.guest_name,
        firstName: row.first_name,
        lastName: row.last_name,
        checkIns: 0,
        activityRequests: 0,
        activities: new Set(),
        visitDates: new Set(),
        firstCheckIn: parseStoredDate(row.checked_in_at),
        lastCheckIn: parseStoredDate(row.checked_in_at)
      });
    }
    const person = peopleMap.get(row.guest_id);
    const checkedInAt = parseStoredDate(row.checked_in_at);
    person.checkIns += 1;
    person.visitDates.add(checkInDate);
    if (checkedInAt < person.firstCheckIn) person.firstCheckIn = checkedInAt;
    if (checkedInAt > person.lastCheckIn) person.lastCheckIn = checkedInAt;
  });

  details.forEach((row) => {
    const checkInDate = formatDateKey(parseStoredDate(row.checked_in_at));
    const dailyGuest = dailyGuestMap.get(checkInDate);
    if (dailyGuest) {
      dailyGuest.activityRequests += 1;
      if (row.status === "Completed") dailyGuest.completed += 1;
      if (row.status === "Skipped") dailyGuest.skipped += 1;
    }
    const person = peopleMap.get(row.guest_id);
    if (person) {
      person.activityRequests += 1;
      person.activities.add(row.activity_name);
    }
    if (!activityMap.has(row.activity_name)) {
      activityMap.set(row.activity_name, {
        activity: row.activity_name,
        requests: 0,
        waiting: 0,
        inProgress: 0,
        completed: 0,
        skipped: 0,
        guests: new Set()
      });
    }
    const activity = activityMap.get(row.activity_name);
    activity.requests += 1;
    activity.guests.add(row.guest_id);
    if (row.status === "Waiting") activity.waiting += 1;
    if (row.status === "In Progress") activity.inProgress += 1;
    if (row.status === "Completed") activity.completed += 1;
    if (row.status === "Skipped") activity.skipped += 1;
    if (statusTotals[row.status] !== undefined) statusTotals[row.status] += 1;

    const day = formatDateKey(parseStoredDate(row.checked_in_at));
    const dailyKey = `${day}|${row.activity_name}`;
    if (!dayMap.has(dailyKey)) {
      dayMap.set(dailyKey, {
        date: day,
        activity: row.activity_name,
        requests: 0,
        completed: 0,
        skipped: 0
      });
    }
    const daily = dayMap.get(dailyKey);
    daily.requests += 1;
    if (row.status === "Completed") daily.completed += 1;
    if (row.status === "Skipped") daily.skipped += 1;
  });

  const activityTotals = [...activityMap.values()]
    .map((item) => ({
      activity: item.activity,
      requests: item.requests,
      uniqueGuests: item.guests.size,
      waiting: item.waiting,
      inProgress: item.inProgress,
      completed: item.completed,
      skipped: item.skipped
    }))
    .toSorted((a, b) => b.requests - a.requests || a.activity.localeCompare(b.activity));
  const dailyActivityTotals = [...dayMap.values()].toSorted(
    (a, b) => a.date.localeCompare(b.date) || a.activity.localeCompare(b.activity)
  );
  const people = [...peopleMap.values()]
    .map((person) => ({
      guestId: person.guestId,
      guestName: person.guestName,
      firstName: person.firstName,
      lastName: person.lastName,
      checkIns: person.checkIns,
      activityRequests: person.activityRequests,
      activities: [...person.activities].toSorted().join(", "),
      daysVisited: person.visitDates.size,
      visitDates: [...person.visitDates].toSorted().join(", "),
      firstCheckIn: formatLocalDateTime(person.firstCheckIn),
      lastCheckIn: formatLocalDateTime(person.lastCheckIn)
    }))
    .toSorted(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
    );
  const dailySummaries = [...dailyGuestMap.values()].map((day) => ({
    date: day.date,
    checkIns: day.checkIns,
    uniqueGuests: day.uniqueGuests.size,
    guestNames: [...day.guestNames].toSorted().join(", "),
    newSignUps: day.newSignUps,
    returningSignIns: day.returningSignIns,
    activityRequests: day.activityRequests,
    completed: day.completed,
    skipped: day.skipped
  }));

  return {
    period: bounds.period,
    requestedDate: bounds.requestedDate,
    start: bounds.start.toISOString(),
    end: bounds.end.toISOString(),
    label: bounds.label,
    summary: {
      guestsCheckedIn: checkIns.length,
      newSignUps: checkIns.filter((row) => row.sign_in_type === "sign_up").length,
      returningSignIns: checkIns.filter((row) => row.sign_in_type === "sign_in").length,
      uniqueKnownGuests: new Set(checkIns.map((row) => row.guest_id)).size,
      activityRequests: details.length,
      completedActivities: statusTotals.Completed,
      skippedActivities: statusTotals.Skipped,
      mostRequestedActivity: activityTotals[0]?.activity || "None"
    },
    statusTotals,
    activityTotals,
    dailyActivityTotals,
    dailySummaries,
    people,
    details: details.map((row) => ({
      ...row,
      date: formatDateKey(parseStoredDate(row.checked_in_at)),
      scheduled_start_display: row.scheduled_start
        ? formatLocalDateTime(parseStoredDate(row.scheduled_start))
        : "Untimed",
      scheduled_end_display: row.scheduled_end
        ? formatLocalDateTime(parseStoredDate(row.scheduled_end))
        : "Untimed",
      checked_in_display: formatLocalDateTime(parseStoredDate(row.checked_in_at))
    })),
    checkIns: checkIns.map((row) => ({
      ...row,
      date: formatDateKey(parseStoredDate(row.checked_in_at)),
      checked_in_display: formatLocalDateTime(parseStoredDate(row.checked_in_at))
    }))
  };
}

export function createAnalyticsWorkbook({ period = "day", date } = {}) {
  const report = getAnalyticsReport({ period, date });
  return {
    filename: `listening-house-analytics-${report.period}-${report.requestedDate}.xlsx`,
    buffer: createWorkbookBuffer([
      {
        name: "Summary",
        rows: [
          ["Listening House Guest Check-In Analytics"],
          ["Requested Report Date", report.requestedDate],
          ["Report Period", report.period],
          ["Report Range", report.label],
          ["Guests Checked In", report.summary.guestsCheckedIn],
          ["New Sign-Ups", report.summary.newSignUps],
          ["Returning Sign-Ins", report.summary.returningSignIns],
          ["Unique Guests", report.summary.uniqueKnownGuests],
          ["Activity Requests", report.summary.activityRequests],
          ["Completed Activities", report.summary.completedActivities],
          ["Skipped Activities", report.summary.skippedActivities],
          ["Most Requested Activity", report.summary.mostRequestedActivity]
        ]
      },
      {
        name: "People",
        rows: [
          [
            "Guest Name",
            "First Name",
            "Last Name",
            "Check-Ins",
            "Activity Requests",
            "Activities Used",
            "Days Visited",
            "Visit Dates",
            "First Check-In",
            "Last Check-In"
          ],
          ...report.people.map((person) => [
            person.guestName,
            person.firstName,
            person.lastName,
            person.checkIns,
            person.activityRequests,
            person.activities,
            person.daysVisited,
            person.visitDates,
            person.firstCheckIn,
            person.lastCheckIn
          ])
        ]
      },
      {
        name: "Guests by Day",
        rows: [
          [
            "Date",
            "Check-Ins",
            "Different People",
            "Guest Names",
            "New Sign-Ups",
            "Returning Sign-Ins",
            "Activity Requests",
            "Completed",
            "Skipped"
          ],
          ...report.dailySummaries.map((day) => [
            day.date,
            day.checkIns,
            day.uniqueGuests,
            day.guestNames,
            day.newSignUps,
            day.returningSignIns,
            day.activityRequests,
            day.completed,
            day.skipped
          ])
        ]
      },
      {
        name: "Activity Totals",
        rows: [
          [
            "Activity",
            "Requests",
            "Unique Guests",
            "Waiting",
            "In Progress",
            "Completed",
            "Skipped"
          ],
          ...report.activityTotals.map((item) => [
            item.activity,
            item.requests,
            item.uniqueGuests,
            item.waiting,
            item.inProgress,
            item.completed,
            item.skipped
          ])
        ]
      },
      {
        name: "Daily Activity Counts",
        rows: [
          ["Date", "Activity", "Requests", "Completed", "Skipped"],
          ...report.dailyActivityTotals.map((item) => [
            item.date,
            item.activity,
            item.requests,
            item.completed,
            item.skipped
          ])
        ]
      },
      {
        name: "Activity Details",
        rows: [
          [
            "Date",
            "Guest Name",
            "First Name",
            "Last Name",
            "Sign-In Type",
            "Activity",
            "Status",
            "Timing",
            "Scheduled Start",
            "Scheduled End",
            "Checked In"
          ],
          ...report.details.map((item) => [
            item.date,
            item.guest_name,
            item.first_name,
            item.last_name,
            formatSignInType(item.sign_in_type),
            item.activity_name,
            item.status,
            item.is_timed ? `${item.duration_minutes} minutes` : "Untimed",
            item.scheduled_start_display,
            item.scheduled_end_display,
            item.checked_in_display
          ])
        ]
      },
      {
        name: "Check Ins",
        rows: [
          [
            "Date",
            "Guest Name",
            "First Name",
            "Last Name",
            "Sign-In Type",
            "Language",
            "Check-In Status",
            "Checked In"
          ],
          ...report.checkIns.map((item) => [
            item.date,
            item.guest_name,
            item.first_name,
            item.last_name,
            formatSignInType(item.sign_in_type),
            item.language,
            item.status,
            item.checked_in_display
          ])
        ]
      }
    ])
  };
}

export function getExportSettings() {
  const appPassword = getSettingValue("daily_export_gmail_app_password");
  return {
    export_time: getSettingValue("daily_export_time") || "03:00",
    recipient: getSettingValue("daily_export_recipient"),
    gmail_sender: getSettingValue("daily_export_gmail_sender"),
    gmail_app_password_configured: Boolean(appPassword),
    raw_retention_days: Math.max(7, Number(getSettingValue("daily_export_raw_retention_days") || 7))
  };
}

export function updateExportSettings(payload = {}) {
  const transaction = db.transaction(() => {
    if (payload.export_time !== undefined) {
      setSettingValue("daily_export_time", normalizeClockTime(payload.export_time, "03:00"));
    }
    if (payload.recipient !== undefined) {
      setSettingValue("daily_export_recipient", normalizeEmailList(payload.recipient));
    }
    if (payload.gmail_sender !== undefined) {
      setSettingValue("daily_export_gmail_sender", normalizeEmailAddress(payload.gmail_sender));
    }
    if (payload.gmail_app_password !== undefined) {
      const password = normalizeGmailAppPassword(payload.gmail_app_password);
      if (password) setSettingValue("daily_export_gmail_app_password", password);
    }
    if (payload.clear_gmail_app_password) {
      setSettingValue("daily_export_gmail_app_password", "");
    }
    if (payload.raw_retention_days !== undefined) {
      setSettingValue(
        "daily_export_raw_retention_days",
        String(Math.max(7, Number(payload.raw_retention_days || 7)))
      );
    }
  });
  transaction();
  return getExportSettings();
}

export function listDailyExports() {
  return rows(
    `SELECT id, report_date, filename, created_at, emailed_at, email_status, recipient, error_message
     FROM daily_export_archives
     ORDER BY report_date DESC, id DESC
     LIMIT 90`
  );
}

export async function runDailyExportArchive({
  date,
  sendEmail = true,
  force = false,
  mailer = null,
  now = new Date()
} = {}) {
  const reportDate = normalizeReportDateKey(date) || previousDateKey(now);
  const existing = one("SELECT * FROM daily_export_archives WHERE report_date = ?", [reportDate]);
  if (existing && !force) return normalizeExportArchive(existing);

  fs.mkdirSync(exportDirectory, { recursive: true });
  const workbook = createAnalyticsWorkbook({ period: "day", date: reportDate });
  const filename = `listening-house-daily-${reportDate}.xlsx`;
  const filePath = path.join(exportDirectory, filename);
  fs.writeFileSync(filePath, workbook.buffer);

  const archived = upsertDailyExportArchive({
    reportDate,
    filename,
    filePath,
    emailStatus: "not_configured",
    recipient: "",
    errorMessage: ""
  });

  let emailed = archived;
  if (sendEmail) {
    emailed = await emailDailyExportArchive(archived.id, { mailer });
  }
  if (emailed.email_status !== "failed") {
    purgeArchivedRawRows();
  }
  return emailed;
}

export async function runDueDailyExports({ now = new Date(), mailer = null } = {}) {
  const settings = getExportSettings();
  const exportTime = normalizeClockTime(settings.export_time, "03:00");
  const [hour, minute] = exportTime.split(":").map(Number);
  const todayRunTime = new Date(now);
  todayRunTime.setHours(hour, minute, 0, 0);
  if (now < todayRunTime) return [];

  const dueDates = rows(
    `SELECT DISTINCT substr(checked_in_at, 1, 10) AS report_date
     FROM check_ins
     WHERE checked_in_at < date('now', 'localtime')
     ORDER BY report_date`
  )
    .map((row) => row.report_date)
    .filter(Boolean)
    .filter((reportDate) => {
      const archived = one("SELECT id FROM daily_export_archives WHERE report_date = ?", [
        reportDate
      ]);
      return !archived;
    });

  const completed = [];
  for (const reportDate of dueDates) {
    completed.push(await runDailyExportArchive({ date: reportDate, sendEmail: true, mailer, now }));
  }
  return completed;
}

export async function sendDailyExportTestEmail({ mailer = null } = {}) {
  const settings = getExportSettings();
  const recipient = settings.recipient;
  if (!recipient) {
    const error = new Error("Enter a recipient email for daily exports.");
    error.status = 400;
    throw error;
  }
  const transporter = mailer || createGmailTransport(settings);
  try {
    await transporter.verify?.();
    await transporter.sendMail({
      from: `"Listening House Kiosk" <${settings.gmail_sender}>`,
      to: recipient,
      subject: "Listening House daily export test",
      text: "This is a test message from the Listening House kiosk system. Daily spreadsheets will be attached to future archive emails."
    });
  } catch (error) {
    const wrapped = new Error(formatEmailDeliveryError(error));
    wrapped.status = 502;
    throw wrapped;
  }
  return { ok: true, recipient };
}

export function getDailyExportDownload(id) {
  const archive = one("SELECT * FROM daily_export_archives WHERE id = ?", [id]);
  if (!archive || !fs.existsSync(archive.file_path)) {
    const error = new Error("That daily export file was not found.");
    error.status = 404;
    throw error;
  }
  return {
    filename: archive.filename,
    buffer: fs.readFileSync(archive.file_path)
  };
}

async function emailDailyExportArchive(id, { mailer = null } = {}) {
  const archive = one("SELECT * FROM daily_export_archives WHERE id = ?", [id]);
  if (!archive) {
    const error = new Error("Daily export archive not found.");
    error.status = 404;
    throw error;
  }
  const settings = getExportSettings();
  if (!settings.recipient || !settings.gmail_sender || !isGmailConfigured()) {
    return updateDailyExportEmailStatus(id, {
      emailStatus: "not_configured",
      recipient: settings.recipient,
      errorMessage: "Gmail sender, app password, and recipient are required before emailing."
    });
  }

  try {
    const transporter = mailer || createGmailTransport(settings);
    await transporter.verify?.();
    await transporter.sendMail({
      from: `"Listening House Kiosk" <${settings.gmail_sender}>`,
      to: settings.recipient,
      subject: `Listening House daily export for ${archive.report_date}`,
      text: `Attached is the Listening House daily spreadsheet archive for ${archive.report_date}.`,
      attachments: [
        {
          filename: archive.filename,
          path: archive.file_path
        }
      ]
    });
    return updateDailyExportEmailStatus(id, {
      emailStatus: "sent",
      recipient: settings.recipient,
      emailedAt: new Date().toISOString(),
      errorMessage: ""
    });
  } catch (error) {
    return updateDailyExportEmailStatus(id, {
      emailStatus: "failed",
      recipient: settings.recipient,
      errorMessage: formatEmailDeliveryError(error)
    });
  }
}

function createGmailTransport(settings) {
  const password = getSettingValue("daily_export_gmail_app_password");
  const sender = normalizeEmailAddress(settings.gmail_sender);
  if (!sender || !password) {
    const error = new Error(
      "Gmail sender and Gmail app password are required. Enter the Gmail address that will send the spreadsheet, plus a Google app password."
    );
    error.status = 400;
    throw error;
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
      user: sender,
      pass: password
    },
    tls: {
      servername: "smtp.gmail.com"
    }
  });
}

function isGmailConfigured() {
  return Boolean(getSettingValue("daily_export_gmail_app_password"));
}

function upsertDailyExportArchive({
  reportDate,
  filename,
  filePath,
  emailStatus,
  recipient,
  errorMessage
}) {
  db.prepare(
    `INSERT INTO daily_export_archives
       (report_date, filename, file_path, created_at, email_status, recipient, error_message)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
     ON CONFLICT(report_date) DO UPDATE SET
       filename = excluded.filename,
       file_path = excluded.file_path,
       created_at = CURRENT_TIMESTAMP,
       emailed_at = NULL,
       email_status = excluded.email_status,
       recipient = excluded.recipient,
       error_message = excluded.error_message`
  ).run(reportDate, filename, filePath, emailStatus, recipient, errorMessage);
  return normalizeExportArchive(
    one("SELECT * FROM daily_export_archives WHERE report_date = ?", [reportDate])
  );
}

function updateDailyExportEmailStatus(
  id,
  { emailStatus, recipient, emailedAt = null, errorMessage }
) {
  db.prepare(
    `UPDATE daily_export_archives
     SET email_status = ?, recipient = ?, emailed_at = ?, error_message = ?
     WHERE id = ?`
  ).run(emailStatus, recipient || "", emailedAt, errorMessage || "", id);
  return normalizeExportArchive(one("SELECT * FROM daily_export_archives WHERE id = ?", [id]));
}

function normalizeExportArchive(row) {
  if (!row) return row;
  return {
    id: row.id,
    report_date: row.report_date,
    filename: row.filename,
    created_at: row.created_at,
    emailed_at: row.emailed_at,
    email_status: row.email_status,
    recipient: row.recipient || "",
    error_message: row.error_message || ""
  };
}

function purgeArchivedRawRows() {
  const retentionDays = Math.max(
    7,
    Number(getSettingValue("daily_export_raw_retention_days") || 7)
  );
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffKey = formatDateKey(cutoff);
  const archivedDates = rows(
    `SELECT report_date, file_path
     FROM daily_export_archives
     WHERE report_date < ?`,
    [cutoffKey]
  ).filter((archive) => archive.file_path && fs.existsSync(archive.file_path));
  if (!archivedDates.length) return 0;

  const transaction = db.transaction(() => {
    let deleted = 0;
    for (const archive of archivedDates) {
      const ids = rows("SELECT id FROM check_ins WHERE substr(checked_in_at, 1, 10) = ?", [
        archive.report_date
      ]).map((row) => row.id);
      if (!ids.length) continue;
      const placeholders = ids.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM status_history
         WHERE scheduled_item_id IN (
           SELECT id FROM scheduled_activity_items WHERE check_in_id IN (${placeholders})
         )`
      ).run(...ids);
      db.prepare(`DELETE FROM scheduled_activity_items WHERE check_in_id IN (${placeholders})`).run(
        ...ids
      );
      const info = db.prepare(`DELETE FROM check_ins WHERE id IN (${placeholders})`).run(...ids);
      deleted += info.changes;
    }
    db.prepare(
      `DELETE FROM guests
       WHERE id NOT IN (SELECT DISTINCT guest_id FROM check_ins)`
    ).run();
    return deleted;
  });
  return transaction();
}

function normalizeReportDateKey(value) {
  return parseRequestedReportDate(value) ? formatDateKey(parseRequestedReportDate(value)) : "";
}

function previousDateKey(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() - 1);
  return formatDateKey(date);
}

function normalizeEmailList(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, 500);
}

function normalizeEmailAddress(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 300);
}

function normalizeGmailAppPassword(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 80);
}

function formatEmailDeliveryError(error) {
  const message = String(error?.message || "Email could not be sent.");
  const response = String(error?.response || "");
  const combined = `${message} ${response}`.toLowerCase();
  if (combined.includes("invalid login") || combined.includes("535")) {
    return "Gmail rejected the login. Use the Gmail address in Sender and a Google app password, not the normal Gmail password.";
  }
  if (combined.includes("less secure") || combined.includes("application-specific")) {
    return "Gmail requires a Google app password for this system. Turn on 2-Step Verification for that Gmail account, then create an app password.";
  }
  if (
    combined.includes("network") ||
    combined.includes("timeout") ||
    combined.includes("econn") ||
    combined.includes("enotfound")
  ) {
    return "The server could not reach Gmail. Check that this computer or Raspberry Pi has internet access, then try Send test email again.";
  }
  return `Email could not be sent: ${message}`;
}

function formatSignInType(value) {
  return value === "sign_up" ? "New sign-up" : "Returning sign-in";
}

function getReportBounds(period, dateValue) {
  const requestedAnchor = parseRequestedReportDate(dateValue);
  const anchor = requestedAnchor || new Date();
  const safePeriod = ["day", "week", "month", "year"].includes(period) ? period : "day";
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (safePeriod === "day") {
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
  }
  if (safePeriod === "week") {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  }
  if (safePeriod === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  }
  if (safePeriod === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setFullYear(end.getFullYear() + 1);
  }
  const inclusiveEnd = new Date(end.getTime() - 1);
  return {
    period: safePeriod,
    requestedDate: formatDateKey(anchor),
    start,
    end,
    label: formatReportLabel(safePeriod, start, inclusiveEnd)
  };
}

function parseRequestedReportDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}

function enumerateReportDates(bounds) {
  const dates = [];
  const cursor = new Date(bounds.start);
  while (cursor < bounds.end) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function formatReportLabel(period, start, inclusiveEnd) {
  if (period === "day") return formatLocalDateOnly(start);
  if (period === "month") {
    return new Intl.DateTimeFormat([], { month: "long", year: "numeric" }).format(start);
  }
  if (period === "year") return String(start.getFullYear());
  return `${formatLocalDateOnly(start)} to ${formatLocalDateOnly(inclusiveEnd)}`;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSqliteUtcTimestamp(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function formatLocalDateOnly(date) {
  return LOCAL_DATE_FORMATTER.format(date);
}

function formatLocalDateTime(date) {
  return LOCAL_DATE_TIME_FORMATTER.format(date);
}

function saveAdminPin(pin) {
  const cleanPin = String(pin || "").trim();
  if (!/^\d{4,12}$/.test(cleanPin)) {
    const error = new Error("Admin PIN must be 4 to 12 numbers.");
    error.status = 400;
    throw error;
  }
  setSettingValue("admin_pin_hash", hashSecret(cleanPin));
}

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(String(secret), salt, PIN_HASH_ITERATIONS, 32, "sha256")
    .toString("hex");
  return `pbkdf2$${PIN_HASH_ITERATIONS}$${salt}$${hash}`;
}

function verifySecret(secret, storedHash) {
  const [algorithm, iterations, salt, hash] = String(storedHash || "").split("$");
  if (algorithm !== "pbkdf2" || !iterations || !salt || !hash) return false;
  const candidate = crypto
    .pbkdf2Sync(String(secret), salt, Number(iterations), 32, "sha256")
    .toString("hex");
  const candidateBuffer = Buffer.from(candidate, "hex");
  const hashBuffer = Buffer.from(hash, "hex");
  return (
    candidateBuffer.length === hashBuffer.length &&
    crypto.timingSafeEqual(candidateBuffer, hashBuffer)
  );
}
