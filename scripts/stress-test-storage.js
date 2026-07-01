import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const options = parseOptions(process.argv.slice(2));
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "listening-house-stress-"));
const databasePath = path.join(tempDirectory, "stress.sqlite");
process.env.DATABASE_PATH = databasePath;

const { db } = await import("../server/db.js");
const activityIds = db
  .prepare("SELECT id FROM activities ORDER BY id LIMIT ?")
  .all(options.activitiesPerCheckIn)
  .map((row) => row.id);

if (activityIds.length < options.activitiesPerCheckIn) {
  throw new Error("Not enough seeded activities to run the requested test.");
}

const insertGuest = db.prepare(
  "INSERT INTO guests (first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, ?)"
);
const insertCheckIn = db.prepare(
  `INSERT INTO check_ins
   (guest_id, sign_in_type, language, status, checked_in_at, completed_at, cleared_at)
   VALUES (?, 'sign_in', 'en', 'cleared', ?, ?, ?)`
);
const insertItem = db.prepare(
  `INSERT INTO scheduled_activity_items
   (check_in_id, activity_id, guest_id, activity_name, duration_minutes, is_timed,
    scheduled_start, scheduled_end, alarm_enabled, alarm_minutes_before, status,
    sort_order, created_at, updated_at)
   VALUES (?, ?, ?, ?, 30, 1, ?, ?, 1, 5, 'Completed', ?, ?, ?)`
);
const insertHistory = db.prepare(
  `INSERT INTO status_history (scheduled_item_id, old_status, new_status, changed_at)
   VALUES (?, ?, ?, ?)`
);

const startTime = performance.now();
const seed = db.transaction(() => {
  for (let index = 0; index < options.checkIns; index += 1) {
    const date = new Date(
      Date.UTC(2020, 0, 1) + Math.floor(index / options.checkInsPerDay) * 864e5
    );
    const checkedInAt = date.toISOString().replace("T00:00:00.000Z", "T09:00:00.000Z");
    const completedAt = date.toISOString().replace("T00:00:00.000Z", "T12:00:00.000Z");
    const guest = insertGuest.run(
      `Guest${String(index + 1).padStart(7, "0")}`,
      `Person${String((index % 10000) + 1).padStart(5, "0")}`,
      checkedInAt,
      checkedInAt
    );
    const checkIn = insertCheckIn.run(guest.lastInsertRowid, checkedInAt, completedAt, completedAt);

    activityIds.forEach((activityId, activityIndex) => {
      const scheduledStart = new Date(date.getTime() + (9 * 60 + activityIndex * 40) * 60_000);
      const scheduledEnd = new Date(scheduledStart.getTime() + 30 * 60_000);
      const item = insertItem.run(
        checkIn.lastInsertRowid,
        activityId,
        guest.lastInsertRowid,
        `Stress Activity ${activityIndex + 1}`,
        scheduledStart.toISOString(),
        scheduledEnd.toISOString(),
        activityIndex,
        checkedInAt,
        completedAt
      );
      for (let change = 0; change < options.statusChangesPerActivity; change += 1) {
        insertHistory.run(
          item.lastInsertRowid,
          change === 0 ? "Waiting" : "In Progress",
          change === options.statusChangesPerActivity - 1 ? "Completed" : "In Progress",
          completedAt
        );
      }
    });
  }
});
seed();
const writeMilliseconds = performance.now() - startTime;

db.pragma("wal_checkpoint(TRUNCATE)");
const databaseBytes = fs.statSync(databasePath).size;
const queryStart = performance.now();
const reportRows = db
  .prepare(
    `SELECT date(ci.checked_in_at) AS day, COUNT(DISTINCT ci.id) AS check_ins,
            COUNT(sai.id) AS activity_requests
     FROM check_ins ci
     LEFT JOIN scheduled_activity_items sai ON sai.check_in_id = ci.id
     GROUP BY date(ci.checked_in_at)
     ORDER BY day DESC
     LIMIT 31`
  )
  .all();
const reportQueryMilliseconds = performance.now() - queryStart;
const repository = await import("../server/repository.js");
const applicationReportStart = performance.now();
const applicationReport = repository.getAnalyticsReport({
  period: "month",
  date: "2020-01-15"
});
const applicationReportMilliseconds = performance.now() - applicationReportStart;
const bytesPerCheckIn = databaseBytes / options.checkIns;

const result = {
  checkIns: options.checkIns,
  activitiesPerCheckIn: options.activitiesPerCheckIn,
  statusChangesPerActivity: options.statusChangesPerActivity,
  databaseBytes,
  databaseMiB: round(databaseBytes / 1024 / 1024),
  bytesPerCheckIn: round(bytesPerCheckIn),
  writeSeconds: round(writeMilliseconds / 1000),
  writesPerSecond: round(options.checkIns / (writeMilliseconds / 1000)),
  reportQueryMilliseconds: round(reportQueryMilliseconds),
  reportDaysReturned: reportRows.length,
  applicationMonthReportMilliseconds: round(applicationReportMilliseconds),
  applicationMonthCheckIns: applicationReport.checkIns.length,
  capacity: {
    tenGiBRecords: Math.floor((10 * 1024 ** 3) / bytesPerCheckIn),
    thirtyGiBRecords: Math.floor((30 * 1024 ** 3) / bytesPerCheckIn)
  }
};

console.log(JSON.stringify(result, null, 2));
db.close();

if (options.keep) {
  console.log(`Stress database kept at ${databasePath}`);
} else {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

function parseOptions(args) {
  const valueAfter = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? Number(args[index + 1]) : fallback;
  };
  return {
    checkIns: positiveInteger(valueAfter("--check-ins", 100_000), "--check-ins"),
    activitiesPerCheckIn: positiveInteger(valueAfter("--activities", 3), "--activities"),
    statusChangesPerActivity: positiveInteger(
      valueAfter("--status-changes", 2),
      "--status-changes"
    ),
    checkInsPerDay: positiveInteger(valueAfter("--per-day", 300), "--per-day"),
    keep: args.includes("--keep")
  };
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive whole number.`);
  }
  return value;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
