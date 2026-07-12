import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildActivityTranslations } from "../shared/activityTranslations.js";
import { DEFAULT_KIOSK_CUSTOMIZATION } from "../shared/kioskCustomization.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = path.join(__dirname, "..", "data", "listening-house.sqlite");
const databasePath = path.resolve(process.env.DATABASE_PATH || defaultDatabasePath);

export const OLD_DEFAULT_ACTIVITY_NAMES = [
  "Shower",
  "Laundry",
  "Meal / Snacks",
  "Clothing / Fresh Clothes",
  "Case Management",
  "Computer / Wi-Fi Access",
  "Phone Charging",
  "Mail Pickup",
  "Rest Area",
  "Hygiene Kit",
  "Housing Help",
  "Medical / Health Support",
  "Counseling / Partner Support"
];

export const DEFAULT_ACTIVITIES = [
  {
    name: "Showers",
    minutes: 30,
    icon: "shower",
    timed: true,
    alarmEnabled: true,
    alarmMinutesBefore: 5,
    availabilityWindowEnabled: true,
    availabilityStart: "14:00",
    availabilityEnd: "17:00",
    weeklyWindowEnabled: true,
    weeklyDays: "0,1,2,3,4,6"
  },
  {
    name: "Vital Records",
    minutes: 10,
    icon: "id-card",
    timed: false,
    availabilityWindowEnabled: true,
    availabilityStart: "14:00",
    availabilityEnd: "19:00",
    weeklyWindowEnabled: true,
    weeklyDays: "1,2,3,4"
  },
  {
    name: "Clothing",
    minutes: 10,
    icon: "shirt",
    timed: false
  },
  {
    name: "Beds",
    minutes: 10,
    icon: "bed",
    timed: false,
    dailyLimitEnabled: true,
    dailyLimit: 12,
    waitlistEnabled: true,
    confirmedSpots: 6,
    waitlistSpots: 6
  },
  {
    name: "Quiet Rooms",
    minutes: 10,
    icon: "private-room",
    timed: false,
    dailyLimitEnabled: true,
    dailyLimit: 6,
    waitlistEnabled: true,
    confirmedSpots: 3,
    waitlistSpots: 3
  }
];

export function createDatabase(filename = databasePath) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const database = new Database(filename);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  database.exec(schema);
  migrateDatabase(database);
  seedBaseData(database);
  return database;
}

function migrateDatabase(database) {
  migrateIdentityTables(database);
  const hadActivityAvailability = tableColumns(database, "activities").has("availability_start");
  const hadActivityAvailabilityToggle = tableColumns(database, "activities").has(
    "availability_window_enabled"
  );
  const hadScheduledAvailability = tableColumns(database, "scheduled_activity_items").has(
    "activity_start_time"
  );
  const hadScheduledAvailabilityToggle = tableColumns(database, "scheduled_activity_items").has(
    "activity_window_enabled"
  );
  ensureColumn(database, "activities", "time_limit_enabled", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "activities", "name_es", "TEXT");
  ensureColumn(database, "activities", "name_hmn", "TEXT");
  ensureColumn(database, "activities", "name_so", "TEXT");
  ensureColumn(database, "activities", "availability_window_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "availability_start", "TEXT NOT NULL DEFAULT '08:00'");
  ensureColumn(database, "activities", "availability_end", "TEXT NOT NULL DEFAULT '16:00'");
  ensureColumn(database, "activities", "weekly_window_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "weekly_days", "TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6'");
  ensureColumn(database, "activities", "monthly_window_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "monthly_start_day", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "activities", "monthly_end_day", "INTEGER NOT NULL DEFAULT 31");
  ensureColumn(database, "activities", "yearly_window_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "yearly_start", "TEXT NOT NULL DEFAULT '01-01'");
  ensureColumn(database, "activities", "yearly_end", "TEXT NOT NULL DEFAULT '12-31'");
  ensureColumn(database, "activities", "daily_limit_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "daily_limit", "INTEGER");
  ensureColumn(database, "activities", "waitlist_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "confirmed_spots", "INTEGER");
  ensureColumn(database, "activities", "waitlist_spots", "INTEGER");
  ensureColumn(database, "activities", "alarm_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "alarm_minutes_before", "INTEGER NOT NULL DEFAULT 5");
  ensureColumn(database, "scheduled_activity_items", "activity_name_es", "TEXT");
  ensureColumn(database, "scheduled_activity_items", "activity_name_hmn", "TEXT");
  ensureColumn(database, "scheduled_activity_items", "activity_name_so", "TEXT");
  ensureColumn(
    database,
    "scheduled_activity_items",
    "activity_window_enabled",
    "INTEGER NOT NULL DEFAULT 0"
  );
  ensureColumn(
    database,
    "scheduled_activity_items",
    "activity_start_time",
    "TEXT NOT NULL DEFAULT '08:00'"
  );
  ensureColumn(
    database,
    "scheduled_activity_items",
    "activity_end_time",
    "TEXT NOT NULL DEFAULT '16:00'"
  );
  ensureColumn(
    database,
    "scheduled_activity_items",
    "service_spot_status",
    "TEXT NOT NULL DEFAULT 'confirmed'"
  );
  ensureColumn(database, "scheduled_activity_items", "service_spot_number", "INTEGER");
  const staffColumnsBeforeSectionPermissions = tableColumns(database, "staff_users");
  const hadAdminSectionPermissions =
    staffColumnsBeforeSectionPermissions.has("can_admin_excel") &&
    staffColumnsBeforeSectionPermissions.has("can_admin_customization") &&
    staffColumnsBeforeSectionPermissions.has("can_admin_activities") &&
    staffColumnsBeforeSectionPermissions.has("can_admin_it");
  ensureColumn(database, "staff_users", "can_admin_excel", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "staff_users", "can_admin_customization", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "staff_users", "can_admin_activities", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "staff_users", "can_admin_it", "INTEGER NOT NULL DEFAULT 0");
  if (!hadAdminSectionPermissions) {
    database
      .prepare(
        `UPDATE staff_users
         SET can_admin_excel = can_admin,
             can_admin_customization = can_admin,
             can_admin_activities = can_admin,
             can_admin_it = can_admin
         WHERE can_admin = 1`
      )
      .run();
  }
  database
    .prepare(
      "UPDATE settings SET value = '' WHERE key IN ('daily_export_recipient', 'daily_export_gmail_sender', 'daily_export_gmail_app_password')"
    )
    .run();
  const workdayStart =
    database.prepare("SELECT value FROM settings WHERE key = 'workday_start'").get()?.value ||
    "08:00";
  const workdayEnd =
    database.prepare("SELECT value FROM settings WHERE key = 'workday_end'").get()?.value ||
    "16:00";
  if (!hadActivityAvailability) {
    database
      .prepare("UPDATE activities SET availability_start = ?, availability_end = ?")
      .run(workdayStart, workdayEnd);
  }
  if (!hadActivityAvailabilityToggle) {
    database
      .prepare(
        `UPDATE activities
         SET availability_window_enabled =
           CASE WHEN availability_start <> ? OR availability_end <> ? THEN 1 ELSE 0 END`
      )
      .run(workdayStart, workdayEnd);
  }
  if (!hadScheduledAvailability) {
    database
      .prepare(
        `UPDATE scheduled_activity_items
         SET activity_start_time = ?, activity_end_time = ?`
      )
      .run(workdayStart, workdayEnd);
  }
  if (!hadScheduledAvailabilityToggle) {
    database
      .prepare(
        `UPDATE scheduled_activity_items
         SET activity_window_enabled =
           CASE WHEN activity_start_time <> ? OR activity_end_time <> ? THEN 1 ELSE 0 END`
      )
      .run(workdayStart, workdayEnd);
  }
  backfillActivityTranslations(database);
  database.exec(`
    DROP INDEX IF EXISTS idx_check_ins_bracelet;
    CREATE INDEX IF NOT EXISTS idx_check_ins_status ON check_ins(status);
    CREATE INDEX IF NOT EXISTS idx_check_ins_guest ON check_ins(guest_id);
    CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_at ON check_ins(checked_in_at);
    CREATE INDEX IF NOT EXISTS idx_guests_name ON guests(last_name, first_name);
    CREATE INDEX IF NOT EXISTS idx_scheduled_check_in ON scheduled_activity_items(check_in_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_guest ON scheduled_activity_items(guest_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_activity_items(status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_start ON scheduled_activity_items(scheduled_start);
    CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON status_history(changed_at);
    CREATE INDEX IF NOT EXISTS idx_daily_exports_report_date ON daily_export_archives(report_date);
  `);
  database
    .prepare(
      `UPDATE settings
       SET value = 'Guest check-in system', updated_at = CURRENT_TIMESTAMP
       WHERE key = 'system_name' AND value = 'Bracelet check-in system'`
    )
    .run();
  database
    .prepare(
      `UPDATE settings
       SET value = 'Thank you, and please wait for your name to be called.',
           updated_at = CURRENT_TIMESTAMP
       WHERE key = 'kiosk_confirmation_message'
         AND value IN (
           'Staff will call your name when it is your turn.',
           'Staff will call this number when it is your turn.'
         )`
    )
    .run();
}

function backfillActivityTranslations(database) {
  const activityRows = database
    .prepare("SELECT id, name, name_es, name_hmn, name_so FROM activities")
    .all();
  const updateActivity = database.prepare(
    `UPDATE activities
     SET name_es = ?, name_hmn = ?, name_so = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );
  activityRows.forEach((activity) => {
    const translations = buildActivityTranslations(activity.name);
    const nameEs = cleanStoredTranslation(activity.name_es) || translations.name_es;
    const nameHmn = cleanStoredTranslation(activity.name_hmn) || translations.name_hmn;
    const nameSo = cleanStoredTranslation(activity.name_so) || translations.name_so;
    if (
      nameEs !== activity.name_es ||
      nameHmn !== activity.name_hmn ||
      nameSo !== activity.name_so
    ) {
      updateActivity.run(nameEs, nameHmn, nameSo, activity.id);
    }
  });

  const scheduledRows = database
    .prepare(
      `SELECT id, activity_name, activity_name_es, activity_name_hmn, activity_name_so
       FROM scheduled_activity_items`
    )
    .all();
  const updateScheduled = database.prepare(
    `UPDATE scheduled_activity_items
     SET activity_name_es = ?, activity_name_hmn = ?, activity_name_so = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );
  scheduledRows.forEach((item) => {
    const translations = buildActivityTranslations(item.activity_name);
    const nameEs = cleanStoredTranslation(item.activity_name_es) || translations.name_es;
    const nameHmn = cleanStoredTranslation(item.activity_name_hmn) || translations.name_hmn;
    const nameSo = cleanStoredTranslation(item.activity_name_so) || translations.name_so;
    if (
      nameEs !== item.activity_name_es ||
      nameHmn !== item.activity_name_hmn ||
      nameSo !== item.activity_name_so
    ) {
      updateScheduled.run(nameEs, nameHmn, nameSo, item.id);
    }
  });
}

function cleanStoredTranslation(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function migrateIdentityTables(database) {
  const guestColumns = tableColumns(database, "guests");
  const checkInColumns = tableColumns(database, "check_ins");
  const itemColumns = tableColumns(database, "scheduled_activity_items");
  const needsMigration =
    guestColumns.has("email") ||
    guestColumns.has("phone") ||
    guestColumns.has("ethnicity") ||
    guestColumns.has("gender") ||
    checkInColumns.has("bracelet_number") ||
    itemColumns.has("bracelet_number") ||
    !itemColumns.has("guest_id");

  if (!needsMigration) return;

  database.pragma("foreign_keys = OFF");
  const transaction = database.transaction(() => {
    database.exec(`
      DROP TABLE IF EXISTS guests_migrated;
      CREATE TABLE guests_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO guests_migrated (id, first_name, last_name, created_at, updated_at)
      SELECT id, trim(first_name), trim(last_name), created_at, updated_at
      FROM guests
      WHERE trim(COALESCE(first_name, '')) <> ''
        AND trim(COALESCE(last_name, '')) <> '';

      DROP TABLE IF EXISTS check_ins_migrated;
      CREATE TABLE check_ins_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guest_id INTEGER NOT NULL,
        sign_in_type TEXT NOT NULL DEFAULT 'sign_in',
        language TEXT NOT NULL DEFAULT 'en',
        status TEXT NOT NULL DEFAULT 'active',
        checked_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        cleared_at TEXT,
        FOREIGN KEY (guest_id) REFERENCES guests(id)
      );
      INSERT INTO check_ins_migrated
        (id, guest_id, sign_in_type, language, status, checked_in_at, completed_at, cleared_at)
      SELECT
        ci.id,
        ci.guest_id,
        CASE WHEN ci.sign_in_type = 'profile' THEN 'sign_up' ELSE 'sign_in' END,
        ci.language,
        ci.status,
        ci.checked_in_at,
        ci.completed_at,
        ci.cleared_at
      FROM check_ins ci
      JOIN guests_migrated g ON g.id = ci.guest_id;

      DROP TABLE IF EXISTS scheduled_activity_items_migrated;
      CREATE TABLE scheduled_activity_items_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_in_id INTEGER NOT NULL,
        activity_id INTEGER,
        guest_id INTEGER NOT NULL,
        activity_name TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 20 CHECK (duration_minutes > 0),
        is_timed INTEGER NOT NULL DEFAULT 1,
        activity_window_enabled INTEGER NOT NULL DEFAULT 0,
        activity_start_time TEXT NOT NULL DEFAULT '08:00',
        activity_end_time TEXT NOT NULL DEFAULT '16:00',
        scheduled_start TEXT,
        scheduled_end TEXT,
        alarm_enabled INTEGER NOT NULL DEFAULT 0,
        alarm_minutes_before INTEGER NOT NULL DEFAULT 5,
        status TEXT NOT NULL DEFAULT 'Waiting',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (check_in_id) REFERENCES check_ins(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id),
        FOREIGN KEY (guest_id) REFERENCES guests(id)
      );
      INSERT INTO scheduled_activity_items_migrated
        (id, check_in_id, activity_id, guest_id, activity_name, duration_minutes,
         is_timed, activity_window_enabled, activity_start_time, activity_end_time,
         scheduled_start, scheduled_end,
         alarm_enabled, alarm_minutes_before,
         status, sort_order, created_at, updated_at)
      SELECT
        sai.id,
        sai.check_in_id,
        sai.activity_id,
        ci.guest_id,
        sai.activity_name,
        sai.duration_minutes,
        1,
        1,
        '08:00',
        '16:00',
        sai.scheduled_start,
        sai.scheduled_end,
        0,
        5,
        sai.status,
        sai.sort_order,
        sai.created_at,
        sai.updated_at
      FROM scheduled_activity_items sai
      JOIN check_ins_migrated ci ON ci.id = sai.check_in_id;

      DELETE FROM status_history
      WHERE scheduled_item_id NOT IN (SELECT id FROM scheduled_activity_items_migrated);

      DROP TABLE scheduled_activity_items;
      DROP TABLE check_ins;
      DROP TABLE guests;
      DROP TABLE IF EXISTS bracelet_numbers;

      ALTER TABLE guests_migrated RENAME TO guests;
      ALTER TABLE check_ins_migrated RENAME TO check_ins;
      ALTER TABLE scheduled_activity_items_migrated RENAME TO scheduled_activity_items;
    `);
  });

  transaction();
  database.pragma("foreign_keys = ON");
}

function tableColumns(database, tableName) {
  return new Set(
    database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((row) => row.name)
  );
}

function ensureColumn(database, tableName, columnName, definition) {
  if (tableColumns(database, tableName).has(columnName)) return;
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export function seedBaseData(database) {
  const insertSetting = database.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  insertSetting.run("buffer_minutes", "5");
  insertSetting.run("workday_start", "08:00");
  insertSetting.run("workday_end", "16:00");
  insertSetting.run("network_mode", "local");
  insertSetting.run("preferred_local_url", "");
  insertSetting.run("public_base_url", "");
  insertSetting.run("inventor_contact_phone", "");
  insertSetting.run("inventor_contact_email", "");
  insertSetting.run("inventor_contacts", "[]");
  insertSetting.run("yearly_data_deletion_enabled", "0");
  insertSetting.run("yearly_data_deletion_month_day", "01-01");
  insertSetting.run("yearly_data_deletion_time", "03:00");
  insertSetting.run("yearly_data_deletion_last_run_year", "");
  Object.entries(DEFAULT_KIOSK_CUSTOMIZATION).forEach(([key, value]) => {
    insertSetting.run(key, value);
  });

  const activityCount = database.prepare("SELECT COUNT(*) AS count FROM activities").get().count;
  if (activityCount === 0) {
    applyListeningHouseActivityPreset(database, { replaceStockDefaults: true });
  } else if (hasOnlyOldStockActivities(database)) {
    applyListeningHouseActivityPreset(database, { replaceStockDefaults: true });
  }
}

export function applyListeningHouseActivityPreset(database, { replaceStockDefaults = false } = {}) {
  const activityRows = database
    .prepare("SELECT id, name FROM activities ORDER BY sort_order, id")
    .all();
  const transaction = database.transaction(() => {
    if (replaceStockDefaults) {
      DEFAULT_ACTIVITIES.forEach((activity, index) => {
        const existing = activityRows[index];
        if (existing) {
          updatePresetActivity(database, existing.id, activity, index + 1);
        } else {
          insertPresetActivity(database, activity, index + 1);
        }
      });
      return;
    }

    const existingNames = new Set(activityRows.map((row) => normalizePresetName(row.name)));
    const maxSort =
      database.prepare("SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM activities").get()
        .sort_order || 0;
    let inserted = 0;
    DEFAULT_ACTIVITIES.forEach((activity, index) => {
      if (existingNames.has(normalizePresetName(activity.name))) return;
      insertPresetActivity(database, activity, maxSort + index + 1);
      inserted += 1;
    });
    return inserted;
  });
  transaction();
  return true;
}

function hasOnlyOldStockActivities(database) {
  const names = database
    .prepare("SELECT name FROM activities ORDER BY sort_order, id")
    .all()
    .map((row) => normalizePresetName(row.name));
  return (
    names.length === OLD_DEFAULT_ACTIVITY_NAMES.length &&
    names.every((name, index) => name === normalizePresetName(OLD_DEFAULT_ACTIVITY_NAMES[index]))
  );
}

function insertPresetActivity(database, activity, sortOrder) {
  const translations = buildActivityTranslations(activity.name);
  database
    .prepare(
      `INSERT INTO activities
       (name, name_es, name_hmn, name_so,
        duration_minutes, time_limit_enabled, availability_window_enabled,
        availability_start, availability_end,
        weekly_window_enabled, weekly_days,
        monthly_window_enabled, monthly_start_day, monthly_end_day,
        yearly_window_enabled, yearly_start, yearly_end,
        daily_limit_enabled, daily_limit, waitlist_enabled, confirmed_spots, waitlist_spots,
        alarm_enabled, alarm_minutes_before, icon, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?,
               0, 1, 31, 0, '01-01', '12-31',
               ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      activity.name,
      translations.name_es,
      translations.name_hmn,
      translations.name_so,
      activity.minutes,
      activity.timed === false ? 0 : 1,
      activity.availabilityWindowEnabled ? 1 : 0,
      activity.availabilityStart || "08:00",
      activity.availabilityEnd || "16:00",
      activity.weeklyWindowEnabled ? 1 : 0,
      activity.weeklyDays || "0,1,2,3,4,5,6",
      activity.dailyLimitEnabled ? 1 : 0,
      activity.dailyLimit || null,
      activity.waitlistEnabled ? 1 : 0,
      activity.confirmedSpots ?? null,
      activity.waitlistSpots ?? null,
      activity.alarmEnabled ? 1 : 0,
      activity.alarmMinutesBefore || 5,
      activity.icon,
      sortOrder
    );
}

function updatePresetActivity(database, id, activity, sortOrder) {
  const translations = buildActivityTranslations(activity.name);
  database
    .prepare(
      `UPDATE activities
       SET name = ?, name_es = ?, name_hmn = ?, name_so = ?,
           duration_minutes = ?, time_limit_enabled = ?,
           availability_window_enabled = ?,
           availability_start = ?,
           availability_end = ?,
           weekly_window_enabled = ?,
           weekly_days = ?,
           monthly_window_enabled = 0,
           monthly_start_day = 1,
           monthly_end_day = 31,
           yearly_window_enabled = 0,
           yearly_start = '01-01',
           yearly_end = '12-31',
           daily_limit_enabled = ?,
           daily_limit = ?,
           waitlist_enabled = ?,
           confirmed_spots = ?,
           waitlist_spots = ?,
           alarm_enabled = ?,
           alarm_minutes_before = ?,
           icon = ?,
           active = 1,
           sort_order = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(
      activity.name,
      translations.name_es,
      translations.name_hmn,
      translations.name_so,
      activity.minutes,
      activity.timed === false ? 0 : 1,
      activity.availabilityWindowEnabled ? 1 : 0,
      activity.availabilityStart || "08:00",
      activity.availabilityEnd || "16:00",
      activity.weeklyWindowEnabled ? 1 : 0,
      activity.weeklyDays || "0,1,2,3,4,5,6",
      activity.dailyLimitEnabled ? 1 : 0,
      activity.dailyLimit || null,
      activity.waitlistEnabled ? 1 : 0,
      activity.confirmedSpots ?? null,
      activity.waitlistSpots ?? null,
      activity.alarmEnabled ? 1 : 0,
      activity.alarmMinutesBefore || 5,
      activity.icon,
      sortOrder,
      id
    );
}

function normalizePresetName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function getDatabasePath() {
  return databasePath;
}

export const db = createDatabase();
