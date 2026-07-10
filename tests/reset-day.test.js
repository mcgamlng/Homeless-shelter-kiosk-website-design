import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("daily reset clears active names and zeroes live totals", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-reset-day-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  let database;

  try {
    const repository = await import(`../server/repository.js?reset-day=${Date.now()}`);
    database = (await import("../server/db.js")).db;
    repository.updateSettings({ workday_start: "00:00", workday_end: "23:59" });
    const activity = repository.getActivities()[0];
    repository.updateActivity(activity.id, {
      availability_start: "00:00",
      availability_end: "23:59",
      weekly_window_enabled: false
    });
    const create = (firstName, lastName) =>
      repository.createCheckIn({
        activityIds: [activity.id],
        language: "en",
        signIn: { mode: "sign_up", firstName, lastName }
      });

    create("Maya", "Johnson");
    create("Ari", "Lee");
    const before = repository.getDashboardData();
    assert.equal(before.totals.guestsCheckedIn, 2);
    assert.deepEqual(before.totals.activeGuests.toSorted(), ["Ari Lee", "Maya Johnson"]);
    assert.equal(
      before.activeCheckIns.find((checkIn) => checkIn.guest_name === "Maya Johnson").daily_number,
      1
    );
    assert.equal(
      before.activeCheckIns.find((checkIn) => checkIn.guest_name === "Ari Lee").daily_number,
      2
    );
    assert.deepEqual(before.scheduledItems.map((item) => item.daily_number).toSorted(), [1, 2]);

    const after = repository.resetDailyData();
    assert.equal(after.totals.guestsCheckedIn, 0);
    assert.deepEqual(after.totals.activeGuests, []);
    assert.equal(after.totals.completedActivities, 0);
    assert.equal(after.totals.skippedActivities, 0);

    const returning = repository.createCheckIn({
      activityIds: [activity.id],
      language: "en",
      signIn: { mode: "sign_in", firstName: "Maya", lastName: "Johnson" }
    });
    assert.equal(returning.guest_name, "Maya Johnson");
    const nextDay = repository.getDashboardData();
    assert.deepEqual(nextDay.totals.activeGuests, ["Maya Johnson"]);
    assert.equal(nextDay.activeCheckIns[0].daily_number, 1);
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
