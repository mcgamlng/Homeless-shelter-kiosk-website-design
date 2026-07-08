import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("Listening House default activities seed and preserve custom additions", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-default-activities-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
  let database;

  try {
    const repository = await import(`../server/repository.js?default-activities=${Date.now()}`);
    database = (await import("../server/db.js")).db;

    const seeded = repository.getActivities({ includeInactive: true });
    assert.equal(seeded.length, 18);
    assert.ok(seeded.some((activity) => activity.name === "Housing / Outreach Help"));
    assert.ok(seeded.some((activity) => activity.name === "Staff / Volunteers Ready to Listen"));
    assert.ok(seeded.some((activity) => activity.name === "Bathrooms / Showers"));
    assert.ok(seeded.some((activity) => activity.time_limit_enabled === false));

    const custom = repository.createActivity({
      name: "Custom Staff Activity",
      time_limit_enabled: false,
      icon: "heart-hand",
      active: true
    });
    repository.applyDefaultActivities();
    const afterApply = repository.getActivities({ includeInactive: true });
    assert.ok(afterApply.some((activity) => activity.id === custom.id));
    assert.equal(
      afterApply.filter((activity) => activity.name === "Housing / Outreach Help").length,
      1
    );
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
