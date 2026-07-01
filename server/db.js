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

export const DEFAULT_ACTIVITIES = [
  ["Shower", 30, "shower"],
  ["Laundry", 45, "laundry"],
  ["Meal / Snacks", 20, "utensils"],
  ["Clothing / Fresh Clothes", 25, "shirt"],
  ["Case Management", 35, "clipboard"],
  ["Computer / Wi-Fi Access", 30, "monitor"],
  ["Phone Charging", 20, "battery"],
  ["Mail Pickup", 10, "mail"],
  ["Rest Area", 30, "sofa"],
  ["Hygiene Kit", 10, "heart-hand"],
  ["Housing Help", 40, "home"],
  ["Medical / Health Support", 30, "stethoscope"],
  ["Counseling / Partner Support", 35, "message-heart"]
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
  ensureColumn(database, "activities", "monthly_window_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "monthly_start_day", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "activities", "monthly_end_day", "INTEGER NOT NULL DEFAULT 31");
  ensureColumn(database, "activities", "yearly_window_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "yearly_start", "TEXT NOT NULL DEFAULT '01-01'");
  ensureColumn(database, "activities", "yearly_end", "TEXT NOT NULL DEFAULT '12-31'");
  ensureColumn(database, "activities", "daily_limit_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "activities", "daily_limit", "INTEGER");
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
  Object.entries(DEFAULT_KIOSK_CUSTOMIZATION).forEach(([key, value]) => {
    insertSetting.run(key, value);
  });

  const activityCount = database.prepare("SELECT COUNT(*) AS count FROM activities").get().count;
  if (activityCount === 0) {
    const insertActivity = database.prepare(
      `INSERT INTO activities
       (name, name_es, name_hmn, name_so,
        duration_minutes, time_limit_enabled, availability_window_enabled,
        availability_start, availability_end,
        monthly_window_enabled, monthly_start_day, monthly_end_day,
        yearly_window_enabled, yearly_start, yearly_end,
        daily_limit_enabled, daily_limit,
        alarm_enabled, alarm_minutes_before, icon, active, sort_order)
       VALUES (?, ?, ?, ?, ?, 1, 0, '08:00', '16:00',
               0, 1, 31, 0, '01-01', '12-31',
               0, NULL, 0, 5, ?, 1, ?)`
    );
    const insertActivities = database.transaction(() => {
      DEFAULT_ACTIVITIES.forEach(([name, minutes, icon], index) => {
        const translations = buildActivityTranslations(name);
        insertActivity.run(
          name,
          translations.name_es,
          translations.name_hmn,
          translations.name_so,
          minutes,
          icon,
          index + 1
        );
      });
    });
    insertActivities();
  }
}

export function getDatabasePath() {
  return databasePath;
}

export const db = createDatabase();
