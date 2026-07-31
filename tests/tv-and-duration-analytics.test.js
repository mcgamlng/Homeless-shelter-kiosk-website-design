import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function setupTempDatabase(prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  return tempDir;
}

function isoAt(dateKey, hour, minute = 0) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

async function loadRepository(tag) {
  return import(`../server/repository.js?${tag}=${Date.now()}`);
}

test("TV display data is public-safe and analytics measures actual activity duration", async () => {
  const tempDir = setupTempDatabase("lh-tv-display-");
  let database;

  try {
    const repository = await loadRepository("tv-duration");
    database = (await import("../server/db.js")).db;
    repository.updateSettings({ workday_start: "00:00", workday_end: "23:59" });
    const activity = repository.getActivities()[0];
    repository.updateActivity(activity.id, {
      time_limit_enabled: true,
      duration_minutes: 30,
      availability_window_enabled: false,
      weekly_window_enabled: false,
      active: true
    });

    const checkIn = repository.createCheckIn({
      activityIds: [activity.id],
      language: "en",
      signIn: { mode: "auto", firstName: "Alex", lastName: "Morgan" }
    });
    const itemId = checkIn.items[0].id;
    const now = new Date(2026, 6, 31, 12, 0, 0, 0);
    database
      .prepare(
        `UPDATE scheduled_activity_items
         SET scheduled_start = ?, scheduled_end = ?
         WHERE id = ?`
      )
      .run(isoAt("2026-07-31", 12, 5), isoAt("2026-07-31", 12, 35), itemId);

    const tvData = repository.getTvDisplayData({ now, leadMinutes: 10 });
    assert.equal(tvData.upcoming.length, 1);
    assert.equal(tvData.upcoming[0].guest_display_name, "Alex M.");
    assert.equal(tvData.upcoming[0].guest_display_name.includes("Morgan"), false);
    assert.equal(tvData.upcoming[0].state, "soon");
    assert.equal(tvData.upcoming[0].starts_in_minutes, 5);

    const readyData = repository.getTvDisplayData({
      now: new Date(2026, 6, 31, 12, 6, 0, 0),
      leadMinutes: 10
    });
    assert.equal(readyData.upcoming[0].state, "ready");

    database
      .prepare("UPDATE scheduled_activity_items SET status = 'In Progress' WHERE id = ?")
      .run(itemId);
    const afterStart = repository.getTvDisplayData({ now, leadMinutes: 10 });
    assert.equal(afterStart.upcoming.length, 0);

    const durationCheckIn = repository.createCheckIn({
      activityIds: [activity.id],
      language: "en",
      signIn: { mode: "auto", firstName: "Jamie", lastName: "Rivera" }
    });
    const durationItemId = durationCheckIn.items[0].id;
    database
      .prepare("UPDATE check_ins SET checked_in_at = ? WHERE id = ?")
      .run(isoAt("2026-06-24", 12), durationCheckIn.id);

    database
      .prepare("UPDATE scheduled_activity_items SET status = 'Completed' WHERE id = ?")
      .run(durationItemId);
    database
      .prepare(
        `INSERT INTO status_history (scheduled_item_id, old_status, new_status, changed_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(durationItemId, "Waiting", "In Progress", "2026-06-24 14:00:00");
    database
      .prepare(
        `INSERT INTO status_history (scheduled_item_id, old_status, new_status, changed_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(durationItemId, "In Progress", "Completed", "2026-06-24 14:25:00");

    const report = repository.getAnalyticsReport({ period: "day", date: "2026-06-24" });
    assert.equal(report.summary.measuredCompletedActivities, 1);
    assert.equal(report.summary.averageActualDurationMinutes, 25);
    assert.equal(report.activityDurationTotals[0].sessions, 1);
    assert.equal(report.activityDurationTotals[0].averageActualMinutes, 25);
    assert.equal(report.activityDurationTotals[0].averageDifferenceMinutes, -5);
    assert.equal(report.activityDurations[0].guestName, "Jamie Rivera");

    const workbook = repository.createAnalyticsWorkbook({
      period: "day",
      date: "2026-06-24"
    });
    assert.ok(workbook.buffer.includes(Buffer.from('sheet name="Activity Durations"')));
    assert.ok(workbook.buffer.includes(Buffer.from("Jamie Rivera")));
    assert.ok(workbook.buffer.includes(Buffer.from("25")));
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
