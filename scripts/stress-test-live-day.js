import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const requestedCount = Number(process.argv[process.argv.indexOf("--check-ins") + 1] || 1000);
if (!Number.isInteger(requestedCount) || requestedCount < 1) {
  throw new Error("--check-ins must be a positive whole number.");
}

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "listening-house-live-stress-"));
process.env.DATABASE_PATH = path.join(tempDirectory, "live-stress.sqlite");

const repository = await import("../server/repository.js");
const { db } = await import("../server/db.js");
const activity = db.prepare("SELECT id, name FROM activities ORDER BY id LIMIT 1").get();
const now = new Date().toISOString();
const insertGuest = db.prepare(
  "INSERT INTO guests (first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, ?)"
);
const insertCheckIn = db.prepare(
  `INSERT INTO check_ins (guest_id, sign_in_type, language, status, checked_in_at)
   VALUES (?, 'sign_up', 'en', 'active', ?)`
);
const insertItem = db.prepare(
  `INSERT INTO scheduled_activity_items
   (check_in_id, activity_id, guest_id, activity_name, duration_minutes, is_timed,
    alarm_enabled, alarm_minutes_before, status, sort_order, created_at, updated_at)
   VALUES (?, ?, ?, ?, 30, 0, 0, 5, 'Waiting', 1, ?, ?)`
);

const seedStart = performance.now();
db.transaction(() => {
  for (let index = 0; index < requestedCount; index += 1) {
    const guest = insertGuest.run(`Live${index + 1}`, `Guest${index + 1}`, now, now);
    const checkIn = insertCheckIn.run(guest.lastInsertRowid, now);
    insertItem.run(
      checkIn.lastInsertRowid,
      activity.id,
      guest.lastInsertRowid,
      activity.name,
      now,
      now
    );
  }
})();
const seedMilliseconds = performance.now() - seedStart;

const dashboardStart = performance.now();
const dashboard = repository.getDashboardData();
const dashboardMilliseconds = performance.now() - dashboardStart;
const serializedBytes = Buffer.byteLength(JSON.stringify(dashboard));

console.log(
  JSON.stringify(
    {
      activeCheckIns: dashboard.activeCheckIns.length,
      scheduledItems: dashboard.scheduledItems.length,
      seedMilliseconds: round(seedMilliseconds),
      dashboardMilliseconds: round(dashboardMilliseconds),
      dashboardResponseMiB: round(serializedBytes / 1024 / 1024),
      heapUsedMiB: round(process.memoryUsage().heapUsed / 1024 / 1024)
    },
    null,
    2
  )
);

db.close();
fs.rmSync(tempDirectory, { recursive: true, force: true });

function round(value) {
  return Math.round(value * 100) / 100;
}
