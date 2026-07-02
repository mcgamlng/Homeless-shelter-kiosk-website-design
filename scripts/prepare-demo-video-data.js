import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = path.resolve(
  process.env.DATABASE_PATH || path.join(projectRoot, "onboarding-video", "demo.sqlite")
);

for (const suffix of ["", "-shm", "-wal"]) {
  fs.rmSync(`${databasePath}${suffix}`, { force: true });
}
process.env.DATABASE_PATH = databasePath;

const repository = await import("../server/repository.js");
const { db } = await import("../server/db.js");

repository.updateSettings({
  workday_start: "00:00",
  workday_end: "23:59",
  buffer_minutes: 5
});

const activities = repository.getActivities({ includeInactive: true });
const activityByName = new Map(activities.map((activity) => [activity.name, activity]));
const activityUpdates = {
  Shower: { duration_minutes: 60, alarm_enabled: true, alarm_minutes_before: 5 },
  Laundry: { duration_minutes: 45, alarm_enabled: true, alarm_minutes_before: 5 },
  "Meal / Snacks": { duration_minutes: 20 },
  "Clothing / Fresh Clothes": { duration_minutes: 5 },
  "Housing Help": { duration_minutes: 40 }
};

for (const [name, update] of Object.entries(activityUpdates)) {
  const activity = activityByName.get(name);
  if (!activity) continue;
  repository.updateActivity(activity.id, {
    ...activity,
    ...update,
    active: true,
    time_limit_enabled: true,
    availability_window_enabled: false,
    availability_start: "08:00",
    availability_end: "17:00"
  });
}

const demoGuests = [
  {
    firstName: "John",
    lastName: "Doe",
    language: "en",
    activities: ["Shower", "Meal / Snacks"]
  },
  {
    firstName: "Jane",
    lastName: "Doe",
    language: "en",
    activities: ["Laundry", "Clothing / Fresh Clothes"]
  },
  {
    firstName: "Maria",
    lastName: "Lopez",
    language: "es",
    activities: ["Meal / Snacks", "Housing Help"]
  },
  {
    firstName: "Ahmed",
    lastName: "Hassan",
    language: "so",
    activities: ["Shower", "Clothing / Fresh Clothes"]
  }
];

const checkIns = demoGuests.map((guest) =>
  repository.createCheckIn({
    language: guest.language,
    activityIds: guest.activities.map((name) => activityByName.get(name)?.id).filter(Boolean),
    signIn: {
      mode: "auto",
      firstName: guest.firstName,
      lastName: guest.lastName
    }
  })
);

const today = new Date();
const localDateTime = (hours, minutes) => {
  const date = new Date(today);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

const checkInTime = db.prepare(
  "UPDATE check_ins SET checked_in_at = ?, status = 'active' WHERE id = ?"
);
checkIns.forEach((checkIn, index) => {
  checkInTime.run(localDateTime(8, index * 5), checkIn.id);
});

const demoSchedule = [
  ["John Doe", "Shower", 12, 0, 13, 0, "In Progress"],
  ["John Doe", "Meal / Snacks", 13, 5, 13, 25, "Waiting"],
  ["Jane Doe", "Laundry", 12, 15, 13, 0, "Waiting"],
  ["Jane Doe", "Clothing / Fresh Clothes", 13, 5, 13, 10, "Waiting"],
  ["Maria Lopez", "Meal / Snacks", 12, 35, 12, 55, "Waiting"],
  ["Maria Lopez", "Housing Help", 13, 0, 13, 40, "Waiting"],
  ["Ahmed Hassan", "Shower", 13, 5, 14, 5, "Waiting"],
  ["Ahmed Hassan", "Clothing / Fresh Clothes", 14, 10, 14, 15, "Waiting"]
];

const updateItem = db.prepare(
  `UPDATE scheduled_activity_items
   SET scheduled_start = ?, scheduled_end = ?, status = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = (
     SELECT sai.id
     FROM scheduled_activity_items sai
     JOIN check_ins ci ON ci.id = sai.check_in_id
     JOIN guests g ON g.id = ci.guest_id
     WHERE trim(g.first_name || ' ' || g.last_name) = ?
       AND sai.activity_name = ?
     LIMIT 1
   )`
);

for (const [
  guestName,
  activityName,
  startHour,
  startMinute,
  endHour,
  endMinute,
  status
] of demoSchedule) {
  updateItem.run(
    localDateTime(startHour, startMinute),
    localDateTime(endHour, endMinute),
    status,
    guestName,
    activityName
  );
}

repository.updateSettings({
  workday_start: "08:00",
  workday_end: "17:00",
  buffer_minutes: 5
});

db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
console.log(`Prepared demo data at ${databasePath}`);
