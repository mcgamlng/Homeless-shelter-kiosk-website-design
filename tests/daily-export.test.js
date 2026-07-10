import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("daily spreadsheet archives stay local and yearly deletion preserves staff users", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-daily-export-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  process.env.EXPORTS_PATH = path.join(tempDir, "exports");
  let database;

  try {
    const repository = await import(`../server/repository.js?daily-export=${Date.now()}`);
    database = (await import("../server/db.js")).db;
    repository.updateSettings({ workday_start: "00:00", workday_end: "23:59" });
    const activities = repository.getActivities();
    activities.slice(0, 3).forEach((activity) => {
      repository.updateActivity(activity.id, {
        availability_window_enabled: false,
        weekly_window_enabled: false
      });
    });
    const openActivities = repository.getActivities();

    const staffUser = repository.createStaffUser({
      display_name: "Dashboard Staff",
      pin: "1717",
      permissions: { dashboard: true, about: true }
    });

    const firstCheckIn = repository.createCheckIn({
      activityIds: [openActivities[0].id],
      language: "en",
      signIn: { mode: "sign_up", firstName: "Maya", lastName: "Johnson" }
    });
    database
      .prepare("UPDATE check_ins SET checked_in_at = ? WHERE id = ?")
      .run("2026-07-05T12:00:00.000Z", firstCheckIn.id);

    const firstArchive = await repository.runDailyExportArchive({
      date: "2026-07-05"
    });
    const secondArchive = await repository.runDailyExportArchive({
      date: "2026-07-05"
    });

    assert.equal(firstArchive.report_date, "2026-07-05");
    assert.equal(secondArchive.id, firstArchive.id);
    assert.ok(fs.existsSync(path.join(process.env.EXPORTS_PATH, firstArchive.filename)));
    assert.deepEqual(Object.keys(firstArchive).sort(), [
      "created_at",
      "filename",
      "id",
      "report_date"
    ]);

    const catchUpCheckIn = repository.createCheckIn({
      activityIds: [openActivities[1].id],
      language: "en",
      signIn: { mode: "sign_up", firstName: "Ari", lastName: "Lee" }
    });
    database
      .prepare("UPDATE check_ins SET checked_in_at = ? WHERE id = ?")
      .run("2026-07-04T12:00:00.000Z", catchUpCheckIn.id);

    repository.updateExportSettings({ export_time: "03:00" });
    const catchUpArchives = await repository.runDueDailyExports({
      now: new Date(2026, 6, 5, 4, 0)
    });
    assert.ok(catchUpArchives.some((archive) => archive.report_date === "2026-07-04"));

    repository.updateDataDeletionSettings({
      enabled: true,
      month_day: "07-06",
      time: "03:00"
    });
    const warning = repository.getDataDeletionSettings(new Date(2026, 5, 25, 12, 0)).warning;
    assert.ok(warning);
    assert.match(warning.message, /Yearly data deletion/);

    const deletion = repository.runDueYearlyDataDeletion({
      now: new Date(2026, 6, 6, 4, 0)
    });
    assert.equal(deletion.ok, true);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM guests").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM check_ins").get().count, 0);
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM scheduled_activity_items").get().count,
      0
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM daily_export_archives").get().count,
      0
    );
    assert.equal(repository.listStaffUsers().length, 1);
    assert.equal(repository.listStaffUsers()[0].id, staffUser.id);
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
