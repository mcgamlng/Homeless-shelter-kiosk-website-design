import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("activity quantity, untimed queue, and alarm settings are enforced", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-activity-rules-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  let database;

  try {
    const repository = await import(`../server/repository.js?activity-rules=${Date.now()}`);
    database = (await import("../server/db.js")).db;
    repository.updateSettings({ workday_start: "00:00", workday_end: "23:59" });
    const now = new Date();
    const todayMonthDay = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    const limited = repository.createActivity({
      name: "Limited Shower",
      duration_minutes: 30,
      time_limit_enabled: true,
      availability_window_enabled: true,
      availability_start: "00:00",
      availability_end: "23:59",
      monthly_window_enabled: true,
      monthly_start_day: now.getDate(),
      monthly_end_day: now.getDate(),
      yearly_window_enabled: true,
      yearly_start: todayMonthDay,
      yearly_end: todayMonthDay,
      daily_limit_enabled: true,
      daily_limit: 1,
      alarm_enabled: true,
      alarm_minutes_before: 5,
      active: true
    });
    const untimed = repository.createActivity({
      name: "Resource Desk",
      time_limit_enabled: false,
      availability_window_enabled: true,
      availability_start: "00:00",
      availability_end: "23:59",
      daily_limit_enabled: false,
      alarm_enabled: false,
      active: true
    });

    const checkIn = repository.createCheckIn({
      activityIds: [limited.id, untimed.id],
      language: "en",
      signIn: { mode: "sign_up", firstName: "Ari", lastName: "Lee" }
    });
    const shower = checkIn.items.find((item) => item.activity_id === limited.id);
    const resourceDesk = checkIn.items.find((item) => item.activity_id === untimed.id);
    assert.equal(shower.is_timed, true);
    assert.equal(shower.alarm_enabled, true);
    assert.equal(shower.activity_window_enabled, true);
    assert.equal(shower.alarm_minutes_before, 5);
    assert.equal(shower.activity_start_time, "00:00");
    assert.equal(shower.activity_end_time, "23:59");
    assert.equal(limited.monthly_window_enabled, true);
    assert.equal(limited.yearly_window_enabled, true);
    assert.equal(resourceDesk.is_timed, false);
    assert.equal(resourceDesk.scheduled_start, null);

    const startedShower = repository.updateScheduledItemStatus(shower.id, "In Progress");
    const timerMinutes = Math.round(
      (new Date(startedShower.scheduled_end).getTime() -
        new Date(startedShower.scheduled_start).getTime()) /
        60000
    );
    assert.equal(startedShower.status, "In Progress");
    assert.equal(timerMinutes, 30);

    assert.throws(
      () =>
        repository.createCheckIn({
          activityIds: [limited.id],
          language: "en",
          signIn: { mode: "sign_up", firstName: "Samira", lastName: "Ahmed" }
        }),
      /daily limit/
    );
    const availability = repository.getActivities().find((activity) => activity.id === limited.id);
    assert.equal(availability.is_full, true);
    assert.equal(availability.daily_remaining, 0);

    const closedStart = new Date(now.getTime() + 30 * 60 * 1000);
    const closedEnd = new Date(now.getTime() + 60 * 60 * 1000);
    const toClock = (date) =>
      `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const limitedHoursOnly = repository.createActivity({
      name: "Afternoon Resource Desk",
      time_limit_enabled: false,
      availability_window_enabled: true,
      availability_start: toClock(closedStart),
      availability_end: toClock(closedEnd),
      daily_limit_enabled: true,
      daily_limit: 5,
      alarm_enabled: false,
      active: true
    });
    const closedAvailability = repository
      .getActivities()
      .find((activity) => activity.id === limitedHoursOnly.id);
    assert.equal(closedAvailability.time_limit_enabled, false);
    assert.equal(closedAvailability.availability_window_enabled, true);
    assert.equal(closedAvailability.is_unavailable, true);
    assert.throws(
      () =>
        repository.createCheckIn({
          activityIds: [limitedHoursOnly.id],
          language: "en",
          signIn: { mode: "sign_up", firstName: "Closed", lastName: "Window" }
        }),
      /not available right now/
    );

    const closedDay = now.getDate() === 1 ? 2 : 1;
    const monthlyClosed = repository.createActivity({
      name: "Monthly Window",
      time_limit_enabled: false,
      monthly_window_enabled: true,
      monthly_start_day: closedDay,
      monthly_end_day: closedDay,
      active: true
    });
    assert.equal(
      repository.getActivities().find((activity) => activity.id === monthlyClosed.id)
        .is_unavailable,
      true
    );

    const otherMonth = now.getMonth() === 0 ? 2 : 1;
    const yearlyClosed = repository.createActivity({
      name: "Yearly Window",
      time_limit_enabled: false,
      yearly_window_enabled: true,
      yearly_start: `${String(otherMonth).padStart(2, "0")}-01`,
      yearly_end: `${String(otherMonth).padStart(2, "0")}-02`,
      active: true
    });
    assert.equal(
      repository.getActivities().find((activity) => activity.id === yearlyClosed.id).is_unavailable,
      true
    );

    const closedWindowStart = new Date(now.getTime() + 120 * 60 * 1000);
    const closedWindowEnd = new Date(now.getTime() + 180 * 60 * 1000);
    repository.updateSettings({
      workday_start: toClock(closedWindowStart),
      workday_end: toClock(closedWindowEnd)
    });
    const untimedClosedWorkday = repository.createActivity({
      name: "Closed Workday Untimed Help",
      time_limit_enabled: false,
      active: true
    });
    assert.throws(
      () =>
        repository.createCheckIn({
          activityIds: [untimedClosedWorkday.id],
          language: "en",
          signIn: { mode: "sign_up", firstName: "Late", lastName: "Guest" }
        }),
      /workday is closed/
    );
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
