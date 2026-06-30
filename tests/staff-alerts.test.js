import assert from "node:assert/strict";
import test from "node:test";
import {
  describeActionTiming,
  getStaffActionItems,
  getStartingSoonItems
} from "../src/staffAlerts.js";

const now = new Date("2026-06-30T15:00:00.000Z").getTime();

function item(id, status, minuteOffset, extra = {}) {
  return {
    id,
    is_timed: true,
    alarm_enabled: true,
    status,
    scheduled_start: new Date(now + minuteOffset * 60_000).toISOString(),
    ...extra
  };
}

test("staff action center includes in-progress and near-term waiting activities", () => {
  const actions = getStaffActionItems(
    [item(1, "Waiting", 8), item(2, "Waiting", 4), item(3, "In Progress", -10)],
    now
  );
  assert.deepEqual(
    actions.map((action) => action.id),
    [3, 2]
  );
});

test("starting-soon notifications honor the activity alarm option", () => {
  const startingSoon = getStartingSoonItems(
    [
      item(1, "Waiting", 3),
      item(2, "Waiting", 3, { alarm_enabled: false }),
      item(3, "Completed", 2)
    ],
    now
  );
  assert.deepEqual(
    startingSoon.map((action) => action.id),
    [1]
  );
});

test("action timing gives staff a plain-language prompt", () => {
  assert.equal(describeActionTiming(item(1, "Waiting", 3), now), "Starts in 3 min");
  assert.equal(describeActionTiming(item(2, "Waiting", 0), now), "Ready now");
  assert.equal(describeActionTiming(item(3, "In Progress", -4), now), "In progress now");
});
