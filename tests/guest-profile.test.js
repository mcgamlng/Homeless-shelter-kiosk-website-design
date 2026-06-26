import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

test("name-only sign-up and returning sign-in are stored and exported", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-name-check-in-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  let database;

  try {
    const repository = await import(`../server/repository.js?name-check-in=${Date.now()}`);
    database = (await import("../server/db.js")).db;
    repository.updateSettings({ workday_start: "00:00", workday_end: "23:59" });
    const activity = repository.getActivities()[0];
    repository.updateActivity(activity.id, {
      availability_start: "00:00",
      availability_end: "23:59"
    });

    assert.throws(
      () =>
        repository.createCheckIn({
          activityIds: [activity.id],
          language: "en",
          signIn: { mode: "sign_in", firstName: "Not", lastName: "Saved" }
        }),
      /not signed up/
    );

    const automaticNewGuest = repository.createCheckIn({
      activityIds: [activity.id],
      language: "en",
      signIn: { mode: "auto", firstName: "Automatic", lastName: "Guest" }
    });
    assert.equal(automaticNewGuest.sign_in_type, "sign_up");
    assert.throws(
      () =>
        repository.inspectNameCheckIn({
          firstName: "Automatic",
          lastName: "Guest"
        }),
      /already signed in for today/
    );
    repository.resetDailyData();
    assert.equal(
      repository.inspectNameCheckIn({
        firstName: "Automatic",
        lastName: "Guest"
      }).signInType,
      "sign_in"
    );
    const automaticReturningGuest = repository.createCheckIn({
      activityIds: [activity.id],
      language: "en",
      signIn: { mode: "auto", firstName: "Automatic", lastName: "Guest" }
    });
    assert.equal(automaticReturningGuest.guest_id, automaticNewGuest.guest_id);
    assert.equal(automaticReturningGuest.sign_in_type, "sign_in");
    repository.clearCheckIn(automaticReturningGuest.id);

    const firstCheckIn = repository.createCheckIn({
      activityIds: [activity.id],
      language: "en",
      signIn: { mode: "sign_up", firstName: "Maya", lastName: "Johnson" }
    });
    assert.equal(firstCheckIn.guest_name, "Maya Johnson");
    assert.equal(firstCheckIn.sign_in_type, "sign_up");

    repository.resetDailyData();
    const returning = repository.createCheckIn({
      activityIds: [activity.id],
      language: "en",
      signIn: { mode: "sign_in", firstName: "Maya", lastName: "Johnson" }
    });
    assert.equal(returning.guest_id, firstCheckIn.guest_id);
    assert.equal(returning.sign_in_type, "sign_in");

    repository.resetDailyData();
    const signUpButtonForExistingGuest = repository.createCheckIn({
      activityIds: [activity.id],
      language: "en",
      signIn: { mode: "sign_up", firstName: "Maya", lastName: "Johnson" }
    });
    assert.equal(signUpButtonForExistingGuest.guest_id, firstCheckIn.guest_id);
    assert.equal(signUpButtonForExistingGuest.sign_in_type, "sign_in");

    const guestColumns = database
      .prepare("PRAGMA table_info(guests)")
      .all()
      .map((row) => row.name);
    assert.deepEqual(guestColumns, ["id", "first_name", "last_name", "created_at", "updated_at"]);

    const report = repository.getAnalyticsReport({ period: "day", date: todayKey() });
    assert.equal(report.summary.newSignUps, 2);
    assert.equal(report.summary.returningSignIns, 3);
    assert.equal(report.summary.uniqueKnownGuests, 2);
    assert.equal(report.people.length, 2);
    const maya = report.people.find((person) => person.guestName === "Maya Johnson");
    assert.equal(maya.checkIns, 3);
    assert.ok(report.checkIns.some((checkIn) => checkIn.first_name === "Maya"));
    const workbook = repository.createAnalyticsWorkbook({ period: "day", date: todayKey() });
    assert.ok(workbook.buffer.length);
    assert.ok(workbook.buffer.includes(Buffer.from('sheet name="People"')));
    assert.ok(workbook.buffer.includes(Buffer.from("Maya Johnson")));
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
