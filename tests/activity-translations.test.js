import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("custom activities save translated names and carry them into check-ins", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-activity-translations-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  let database;

  try {
    const repository = await import(`../server/repository.js?activity-translations=${Date.now()}`);
    database = (await import("../server/db.js")).db;
    repository.updateSettings({ workday_start: "00:00", workday_end: "23:59" });

    const activity = repository.createActivity({
      name: "Private Shower Room",
      duration_minutes: 20,
      time_limit_enabled: true,
      availability_window_enabled: true,
      availability_start: "00:00",
      availability_end: "23:59",
      active: true
    });

    assert.equal(activity.name_es, "Habitacion privada de ducha");
    assert.equal(activity.name_hmn, "Chav da dej ntiag tug");
    assert.equal(activity.name_so, "Qol qubeys gaar ah");

    const updated = repository.updateActivity(activity.id, {
      ...activity,
      name: "Legal Support"
    });
    assert.equal(updated.name_es, "Apoyo legal");
    assert.equal(updated.name_hmn, "Kev pab raws cai");
    assert.equal(updated.name_so, "Taageero sharci");

    const corrected = repository.updateActivity(updated.id, {
      ...updated,
      name_es: "Apoyo legal revisado"
    });
    assert.equal(corrected.name_es, "Apoyo legal revisado");

    const checkIn = repository.createCheckIn({
      activityIds: [corrected.id],
      language: "es",
      signIn: { mode: "sign_up", firstName: "Translation", lastName: "Tester" }
    });
    assert.equal(checkIn.items[0].activity_name_es, "Apoyo legal revisado");
    assert.equal(checkIn.items[0].activity_name_hmn, "Kev pab raws cai");
    assert.equal(checkIn.items[0].activity_name_so, "Taageero sharci");
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
