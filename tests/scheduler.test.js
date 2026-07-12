import test from "node:test";
import assert from "node:assert/strict";
import {
  compactScheduleAfterFinalStatus,
  rebalanceWaitingSchedule,
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

test("overnight workday schedules after a late-night check-in instead of next evening", () => {
  const [result] = scheduleActivities({
    activities: [
      {
        ...timedActivity(1, "Shower", 30),
        availability_start: "20:00",
        availability_end: "02:00"
      }
    ],
    guestId: 42,
    existingItems: [],
    bufferMinutes: 5,
    now: new Date(2026, 5, 24, 1, 0),
    settings: { workday_start: "20:00", workday_end: "02:00" }
  });

  const start = new Date(result.scheduled_start);
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 5);
  assert.equal(start.getDate(), 24);
  assert.equal(start.getHours(), 1);
  assert.equal(start.getMinutes(), 0);
});

test("full-day workday settings allow evening kiosk scheduling", () => {
  const [result] = scheduleActivities({
    activities: [
      {
        ...timedActivity(1, "Evening Support", 30),
        availability_window_enabled: false
      }
    ],
    guestId: 24,
    existingItems: [],
    bufferMinutes: 5,
    now: new Date(2026, 5, 23, 21, 10),
    settings: { workday_start: "00:00", workday_end: "23:59" }
  });

  const start = new Date(result.scheduled_start);
  const end = new Date(result.scheduled_end);
  assert.equal(start.getHours(), 21);
  assert.equal(start.getMinutes(), 10);
  assert.equal(end.getHours(), 21);
  assert.equal(end.getMinutes(), 40);
});

test("check-ins are rejected when the workday is closed", () => {
  assert.throws(
    () =>
      scheduleActivities({
        activities: [timedActivity(1, "Shower", 30)],
        guestId: 42,
        existingItems: [],
        bufferMinutes: 5,
        now: new Date(2026, 5, 24, 3, 0),
        settings: { workday_start: "20:00", workday_end: "02:00" }
      }),
    /workday is closed/
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

test("uses an earlier open activity lane instead of preserving selection order", () => {
  const now = new Date("2026-06-23T22:30:00.000Z");
  const eveningSettings = { workday_start: "17:30", workday_end: "23:00" };
  const activities = [
    {
      ...timedActivity(1, "Shower", 30),
      availability_start: "17:30",
      availability_end: "23:00"
    },
    {
      ...timedActivity(2, "Legal Support", 60),
      availability_start: "17:30",
      availability_end: "23:00"
    },
    {
      ...timedActivity(3, "Private Room", 30),
      availability_start: "17:30",
      availability_end: "23:00"
    }
  ];
  const firstGuest = scheduleActivities({
    activities,
    guestId: 6,
    existingItems: [],
    bufferMinutes: 5,
    now,
    settings: eveningSettings
  });
  const secondGuest = scheduleActivities({
    activities,
    guestId: 7,
    existingItems: firstGuest,
    bufferMinutes: 5,
    now,
    settings: eveningSettings
  });

  assert.equal(firstGuest[0].activity_name, "Legal Support");
  assert.equal(secondGuest[0].activity_name, "Shower");
  assert.equal(secondGuest[0].scheduled_start, "2026-06-23T22:30:00.000Z");
  assert.equal(secondGuest[1].activity_name, "Private Room");
  assert.equal(secondGuest[2].activity_name, "Legal Support");
});

test("automatic scheduling does not depend on the order activities were selected", () => {
  const now = new Date("2026-06-23T14:00:00.000Z");
  const activities = [
    timedActivity(1, "Shower", 30),
    timedActivity(2, "Legal Support", 60),
    timedActivity(3, "Private Room", 20)
  ];
  const schedule = (selectedActivities) =>
    scheduleActivities({
      activities: selectedActivities,
      guestId: 24,
      existingItems: [],
      bufferMinutes: 5,
      now,
      settings
    })
      .map((item) => ({
        activity: item.activity_name,
        start: item.scheduled_start,
        end: item.scheduled_end
      }))
      .toSorted((left, right) => left.activity.localeCompare(right.activity));

  assert.deepEqual(schedule(activities), schedule(activities.toReversed()));
});

test("daily rebalance fills independent activity lanes before moving later", () => {
  const activities = [
    { id: 1, name: "Shower", duration: 30 },
    { id: 2, name: "Legal Support", duration: 60 },
    { id: 3, name: "Private Room", duration: 30 }
  ];
  const items = [6, 7, 8].flatMap((guestId) =>
    activities.map((activity, activityIndex) =>
      scheduledItem({
        id: guestId * 10 + activity.id,
        guest_id: guestId,
        activity_id: activity.id,
        activity_name: activity.name,
        duration_minutes: activity.duration,
        checked_in_at: "2026-06-23T22:30:00.000Z",
        scheduled_start: `2026-06-2${activityIndex + 3}T22:30:00.000Z`,
        scheduled_end: `2026-06-2${activityIndex + 3}T23:00:00.000Z`
      })
    )
  );
  const result = rebalanceWaitingSchedule({
    items,
    bufferMinutes: 5,
    settings: { workday_start: "17:30", workday_end: "23:00" },
    now: new Date("2026-06-23T22:30:00.000Z")
  });
  const startingNow = result.filter((item) => item.scheduled_start === "2026-06-23T22:30:00.000Z");

  assert.equal(startingNow.length, 3);
  assert.equal(new Set(startingNow.map((item) => item.activity_id)).size, 3);
  assert.equal(new Set(startingNow.map((item) => item.guest_id)).size, 3);
});

test("rebalances waiting appointments into the earliest legal gaps", () => {
  const result = rebalanceWaitingSchedule({
    items: [
      scheduledItem({
        id: 1,
        guest_id: 6,
        activity_id: 1,
        activity_name: "Shower",
        checked_in_at: "2026-06-23T22:30:00.000Z",
        scheduled_start: "2026-06-23T22:30:00.000Z",
        scheduled_end: "2026-06-23T23:00:00.000Z"
      }),
      scheduledItem({
        id: 2,
        guest_id: 6,
        activity_id: 2,
        activity_name: "Legal Support",
        duration_minutes: 60,
        checked_in_at: "2026-06-23T22:30:00.000Z",
        scheduled_start: "2026-06-23T23:15:00.000Z",
        scheduled_end: "2026-06-24T00:15:00.000Z"
      }),
      scheduledItem({
        id: 3,
        guest_id: 7,
        activity_id: 3,
        activity_name: "Private Room",
        checked_in_at: "2026-06-23T22:30:00.000Z",
        scheduled_start: "2026-06-24T00:20:00.000Z",
        scheduled_end: "2026-06-24T00:50:00.000Z"
      })
    ],
    bufferMinutes: 5,
    settings: { workday_start: "17:30", workday_end: "23:00" },
    now: new Date("2026-06-23T22:30:00.000Z")
  });

  assert.equal(result.find((item) => item.id === 3).scheduled_start, "2026-06-23T22:30:00.000Z");
  assert.equal(result.find((item) => item.id === 2).scheduled_start, "2026-06-23T22:30:00.000Z");
  assert.equal(result.find((item) => item.id === 1).scheduled_start, "2026-06-23T23:35:00.000Z");
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
