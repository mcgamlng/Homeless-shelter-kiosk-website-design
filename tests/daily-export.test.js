import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("daily spreadsheet archives are saved, caught up, and safe on email failure", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-daily-export-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  process.env.EXPORTS_PATH = path.join(tempDir, "exports");
  let database;

  try {
    const repository = await import(`../server/repository.js?daily-export=${Date.now()}`);
    database = (await import("../server/db.js")).db;
    repository.updateSettings({ workday_start: "00:00", workday_end: "23:59" });
    const activities = repository.getActivities();

    const firstCheckIn = repository.createCheckIn({
      activityIds: [activities[0].id],
      language: "en",
      signIn: { mode: "sign_up", firstName: "Maya", lastName: "Johnson" }
    });
    database
      .prepare("UPDATE check_ins SET checked_in_at = ? WHERE id = ?")
      .run("2026-07-05T12:00:00.000Z", firstCheckIn.id);

    const firstArchive = await repository.runDailyExportArchive({
      date: "2026-07-05",
      sendEmail: false
    });
    const secondArchive = await repository.runDailyExportArchive({
      date: "2026-07-05",
      sendEmail: false
    });

    assert.equal(firstArchive.report_date, "2026-07-05");
    assert.equal(secondArchive.id, firstArchive.id);
    assert.equal(firstArchive.email_status, "not_configured");
    assert.ok(fs.existsSync(path.join(process.env.EXPORTS_PATH, firstArchive.filename)));

    const catchUpCheckIn = repository.createCheckIn({
      activityIds: [activities[1].id],
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

    repository.updateExportSettings({
      recipient: "reports@example.org",
      gmail_sender: "sender@gmail.com",
      gmail_app_password: "abcdefghijklmnop",
      raw_retention_days: 7
    });
    const failedEmailCheckIn = repository.createCheckIn({
      activityIds: [activities[2].id],
      language: "en",
      signIn: { mode: "sign_up", firstName: "Samira", lastName: "Ahmed" }
    });
    database
      .prepare("UPDATE check_ins SET checked_in_at = ? WHERE id = ?")
      .run("2026-01-01T12:00:00.000Z", failedEmailCheckIn.id);

    const failedArchive = await repository.runDailyExportArchive({
      date: "2026-01-01",
      sendEmail: true,
      force: true,
      now: new Date(2026, 6, 7, 4, 0),
      mailer: {
        async sendMail() {
          throw new Error("SMTP failed");
        }
      }
    });

    const oldCheckInStillExists = database
      .prepare("SELECT COUNT(*) AS count FROM check_ins WHERE id = ?")
      .get(failedEmailCheckIn.id).count;
    assert.equal(failedArchive.email_status, "failed");
    assert.match(failedArchive.error_message, /SMTP failed/);
    assert.equal(oldCheckInStillExists, 1);
    assert.ok(repository.listDailyExports().length >= 3);
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
