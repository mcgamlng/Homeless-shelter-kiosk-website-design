import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("yearly deletion removes guest data and preserves staff users", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-data-retention-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  process.env.EXPORTS_PATH = path.join(tempDir, "exports");
  let database;

  try {
    const repository = await import(`../server/repository.js?data-retention=${Date.now()}`);
    database = (await import("../server/db.js")).db;
    repository.updateSettings({ workday_start: "00:00", workday_end: "23:59" });
    const activity = repository.getActivities()[0];
    repository.updateActivity(activity.id, {
      availability_window_enabled: false,
      weekly_window_enabled: false
    });
    const openActivity = repository.getActivities()[0];

    const staffUser = repository.createStaffUser({
      display_name: "Dashboard Staff",
      pin: "1717",
      permissions: {
        dashboard: true,
        about: true,
        admin_excel: true,
        admin_it: false
      }
    });
    assert.equal(repository.verifyStaffUserPin("1717").display_name, "Dashboard Staff");
    assert.equal(repository.verifyStaffUserPin("1717").permissions.admin, true);
    assert.equal(repository.verifyStaffUserPin("1717").permissions.admin_excel, true);
    assert.equal(repository.verifyStaffUserPin("1717").permissions.admin_it, false);

    repository.updateSettings({
      inventor_contacts: [
        { name: "Project Support", phone: "(555) 555-1212", email: "SUPPORT@EXAMPLE.ORG" },
        { name: "Technical Help", phone: "555.555.2323", email: "TECH@EXAMPLE.ORG" }
      ]
    });
    const contactSettings = repository.getSettings();
    assert.equal(contactSettings.inventorContacts.length, 2);
    assert.equal(contactSettings.inventorContacts[0].email, "support@example.org");

    const checkIn = repository.createCheckIn({
      activityIds: [openActivity.id],
      language: "en",
      signIn: { mode: "sign_up", firstName: "Maya", lastName: "Johnson" }
    });
    database
      .prepare("UPDATE check_ins SET checked_in_at = ? WHERE id = ?")
      .run("2026-07-05T12:00:00.000Z", checkIn.id);

    fs.mkdirSync(process.env.EXPORTS_PATH, { recursive: true });
    fs.writeFileSync(path.join(process.env.EXPORTS_PATH, "old-report.xlsx"), "old report");
    database
      .prepare(
        `INSERT INTO daily_export_archives (report_date, filename, file_path, created_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run("2026-07-05", "old-report.xlsx", path.join(process.env.EXPORTS_PATH, "old-report.xlsx"));

    repository.updateDataDeletionSettings({
      enabled: true,
      date: "2026-07-06",
      time: "03:00"
    });
    assert.equal(repository.getDataDeletionSettings().date, "2026-07-06");
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
    assert.equal(fs.existsSync(path.join(process.env.EXPORTS_PATH, "old-report.xlsx")), false);
    assert.equal(repository.listStaffUsers().length, 1);
    assert.equal(repository.listStaffUsers()[0].id, staffUser.id);
    assert.equal(repository.listStaffUsers()[0].permissions.admin_excel, true);
    assert.equal(repository.runDueYearlyDataDeletion({ now: new Date(2026, 6, 7, 4, 0) }), null);
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
