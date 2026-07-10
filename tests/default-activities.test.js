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
    assert.equal(seeded.length, 5);
    const showers = seeded.find((activity) => activity.name === "Showers");
    const vitalRecords = seeded.find((activity) => activity.name === "Vital Records");
    const beds = seeded.find((activity) => activity.name === "Beds");
    const quietRooms = seeded.find((activity) => activity.name === "Quiet Rooms");
    assert.equal(showers.duration_minutes, 30);
    assert.equal(showers.weekly_window_enabled, true);
    assert.equal(showers.weekly_days, "0,1,2,3,4,6");
    assert.equal(showers.availability_start, "14:00");
    assert.equal(showers.availability_end, "17:00");
    assert.equal(showers.alarm_enabled, true);
    assert.equal(vitalRecords.time_limit_enabled, false);
    assert.equal(vitalRecords.weekly_days, "1,2,3,4");
    assert.equal(beds.daily_limit, 12);
    assert.equal(beds.confirmed_spots, 6);
    assert.equal(beds.waitlist_spots, 6);
    assert.equal(quietRooms.daily_limit, 6);
    assert.equal(quietRooms.confirmed_spots, 3);
    assert.equal(quietRooms.waitlist_spots, 3);

    const custom = repository.createActivity({
      name: "Custom Staff Activity",
      time_limit_enabled: false,
      icon: "heart-hand",
      active: true
    });
    repository.applyDefaultActivities();
    const afterApply = repository.getActivities({ includeInactive: true });
    assert.ok(afterApply.some((activity) => activity.id === custom.id));
    assert.equal(afterApply.filter((activity) => activity.name === "Showers").length, 1);
  } finally {
    if (database?.open) database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
