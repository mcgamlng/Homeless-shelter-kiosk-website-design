import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function localNoonIso(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

test("analytics reports use the requested historical period and include guest names by day", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-analytics-history-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  let database;

  try {
    const repository = await import(`../server/repository.js?analytics-history=${Date.now()}`);
    database = (await import("../server/db.js")).db;
    repository.updateSettings({ workday_start: "00:00", workday_end: "23:59" });
    const activity = repository.getActivities()[0];
    repository.updateActivity(activity.id, {
      time_limit_enabled: false,
      availability_window_enabled: true,
      availability_start: "00:00",
      availability_end: "23:59",
      weekly_window_enabled: false
    });

    const guests = [
      ["June", "TwentyFour"],
      ["Second", "Visitor"],
      ["June", "TwentyFive"]
    ].map(([firstName, lastName]) =>
      repository.createCheckIn({
        activityIds: [activity.id],
        language: "en",
        signIn: { mode: "auto", firstName, lastName }
      })
    );

    database
      .prepare("UPDATE check_ins SET checked_in_at = ? WHERE id = ?")
      .run(localNoonIso("2026-06-24"), guests[0].id);
    database
      .prepare("UPDATE check_ins SET checked_in_at = ? WHERE id = ?")
      .run(localNoonIso("2026-06-24"), guests[1].id);
    database
      .prepare("UPDATE check_ins SET checked_in_at = ? WHERE id = ?")
      .run(localNoonIso("2026-06-25"), guests[2].id);

    const day = repository.getAnalyticsReport({ period: "day", date: "2026-06-24" });
    assert.equal(day.requestedDate, "2026-06-24");
    assert.match(day.label, /June 24, 2026/);
    assert.doesNotMatch(day.label, /June 25/);
    assert.equal(day.summary.guestsCheckedIn, 2);
    assert.deepEqual(
      day.people.map((person) => person.guestName),
      ["June TwentyFour", "Second Visitor"]
    );
    assert.equal(day.dailySummaries.length, 1);
    assert.match(day.dailySummaries[0].guestNames, /June TwentyFour/);
    assert.match(day.dailySummaries[0].guestNames, /Second Visitor/);

    const week = repository.getAnalyticsReport({ period: "week", date: "2026-06-24" });
    assert.equal(week.dailySummaries.length, 7);
    assert.equal(week.dailySummaries.find((item) => item.date === "2026-06-24").checkIns, 2);
    assert.equal(week.dailySummaries.find((item) => item.date === "2026-06-25").checkIns, 1);

    const month = repository.getAnalyticsReport({ period: "month", date: "2026-06-24" });
    assert.equal(month.dailySummaries.length, 30);
    assert.equal(month.summary.guestsCheckedIn, 3);

    const year = repository.getAnalyticsReport({ period: "year", date: "2026-06-24" });
    assert.equal(year.label, "2026");
    assert.equal(year.dailySummaries.length, 365);
    assert.equal(year.summary.guestsCheckedIn, 3);

    const workbook = repository.createAnalyticsWorkbook({
      period: "day",
      date: "2026-06-24"
    });
    assert.equal(workbook.filename, "listening-house-analytics-day-2026-06-24.xlsx");
    assert.ok(workbook.buffer.includes(Buffer.from('sheet name="Guests by Day"')));
    assert.ok(workbook.buffer.includes(Buffer.from("June TwentyFour")));
    assert.ok(workbook.buffer.includes(Buffer.from("2026-06-24")));
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
