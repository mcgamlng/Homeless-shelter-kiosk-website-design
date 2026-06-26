import test from "node:test";
import assert from "node:assert/strict";
import {
  compactScheduleAfterFinalStatus,
  repairScheduleAfterMove,
  scheduleActivities
} from "../server/scheduler.js";

const settings = { workday_start: "08:00", workday_end: "20:00" };

function timedActivity(id, name, duration) {
  return {
    id,
    name,
    duration_minutes: duration,
    time_limit_enabled: true,
    availability_window_enabled: true,
    availability_start: "08:00",
    availability_end: "20:00",
    alarm_enabled: false,
    alarm_minutes_before: 5
  };
}

test("activity-specific hours control the scheduled window", () => {
  const [result] = scheduleActivities({
    activities: [
      {
        ...timedActivity(1, "Shower", 30),
        availability_start: "10:00",
        availability_end: "11:00"
      }
    ],
    guestId: 24,
    existingItems: [],
    bufferMinutes: 5,
    now: new Date(2026, 5, 23, 8, 5),
    settings
  });
  assert.equal(new Date(result.scheduled_start).getHours(), 10);
  assert.equal(new Date(result.scheduled_end).getHours(), 10);
  assert.equal(new Date(result.scheduled_end).getMinutes(), 30);

  assert.throws(
    () =>
      scheduleActivities({
        activities: [
          {
            ...timedActivity(1, "Shower", 30),
            availability_start: "10:00",
            availability_end: "10:20"
          }
        ],
        guestId: 24,
        existingItems: [],
        bufferMinutes: 5,
        now: new Date(2026, 5, 23, 8, 5),
        settings
      }),
    /not enough open time/
  );
});

function scheduledItem(overrides = {}) {
  return {
    id: 1,
    activity_id: 1,
    guest_id: 24,
    activity_name: "Shower",
    duration_minutes: 30,
    is_timed: 1,
    activity_window_enabled: 1,
    checked_in_at: "2026-06-23T14:00:00.000Z",
    scheduled_start: "2026-06-23T14:05:00.000Z",
    scheduled_end: "2026-06-23T14:35:00.000Z",
    status: "Waiting",
    sort_order: 1,
    ...overrides
  };
}

test("schedules one guest without overlapping their timed activities", () => {
  const result = scheduleActivities({
    activities: [
      timedActivity(1, "Shower", 30),
      timedActivity(2, "Meal", 20),
      timedActivity(3, "Phone Charging", 20)
    ],
    guestId: 24,
    existingItems: [],
    bufferMinutes: 5,
    now: new Date("2026-06-23T14:01:00.000Z"),
    settings
  });
  assert.equal(result.length, 3);
  for (let index = 1; index < result.length; index += 1) {
    assert.ok(new Date(result[index].scheduled_start) >= new Date(result[index - 1].scheduled_end));
  }
});

test("untimed activities are not placed on the calendar", () => {
  const result = scheduleActivities({
    activities: [{ ...timedActivity(1, "Mail Pickup", 10), time_limit_enabled: false }],
    guestId: 24,
    existingItems: [],
    bufferMinutes: 5,
    now: new Date("2026-06-23T14:01:00.000Z"),
    settings
  });
  assert.deepEqual(result, []);
});

test("moving a timed activity repairs conflicts by pushing later blocks", () => {
  const result = repairScheduleAfterMove({
    items: [
      scheduledItem(),
      scheduledItem({
        id: 2,
        guest_id: 12,
        scheduled_start: "2026-06-23T14:35:00.000Z",
        scheduled_end: "2026-06-23T15:05:00.000Z"
      })
    ],
    itemId: 2,
    targetStart: new Date("2026-06-23T14:15:00.000Z"),
    bufferMinutes: 5,
    settings,
    now: new Date("2026-06-23T14:00:00.000Z")
  });
  const moved = result.find((item) => item.id === 2);
  const other = result.find((item) => item.id === 1);
  assert.ok(
    new Date(moved.scheduled_end) <= new Date(other.scheduled_start) ||
      new Date(other.scheduled_end) <= new Date(moved.scheduled_start)
  );
});

test("cannot move an activity before guest check-in", () => {
  assert.throws(
    () =>
      repairScheduleAfterMove({
        items: [scheduledItem()],
        itemId: 1,
        targetStart: new Date("2026-06-23T13:50:00.000Z"),
        bufferMinutes: 5,
        settings,
        now: new Date("2026-06-23T13:45:00.000Z")
      }),
    /before check-in/
  );
});

test("cannot move an activity before that activity opens", () => {
  const checkedInAt = new Date(2026, 5, 23, 8, 0);
  const scheduledStart = new Date(2026, 5, 23, 10, 0);
  const scheduledEnd = new Date(2026, 5, 23, 10, 30);
  assert.throws(
    () =>
      repairScheduleAfterMove({
        items: [
          scheduledItem({
            checked_in_at: checkedInAt.toISOString(),
            scheduled_start: scheduledStart.toISOString(),
            scheduled_end: scheduledEnd.toISOString(),
            activity_start_time: "10:00",
            activity_end_time: "12:00"
          })
        ],
        itemId: 1,
        targetStart: new Date(2026, 5, 23, 9, 30),
        bufferMinutes: 5,
        settings,
        now: new Date(2026, 5, 23, 8, 30)
      }),
    /before this activity opens/
  );
});

test("completing an activity ends it now and pulls waiting blocks forward", () => {
  const result = compactScheduleAfterFinalStatus({
    items: [
      scheduledItem(),
      scheduledItem({
        id: 2,
        guest_id: 12,
        scheduled_start: "2026-06-23T14:35:00.000Z",
        scheduled_end: "2026-06-23T15:05:00.000Z"
      })
    ],
    itemId: 1,
    status: "Completed",
    bufferMinutes: 5,
    settings,
    now: new Date("2026-06-23T14:15:00.000Z")
  });
  assert.equal(result.find((item) => item.id === 1).scheduled_end, "2026-06-23T14:15:00.000Z");
  assert.equal(result.find((item) => item.id === 2).scheduled_start, "2026-06-23T14:15:00.000Z");
});
