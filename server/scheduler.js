const ACTIVE_ITEM_STATUSES = new Set(["Waiting", "In Progress"]);
const FINAL_ITEM_STATUSES = new Set(["Completed", "Skipped"]);
const DEFAULT_WORKDAY_START = "08:00";
const DEFAULT_WORKDAY_END = "16:00";

function scheduleError(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

export function parseStoredDate(value) {
  if (!value) return new Date(Number.NaN);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return new Date(value);
}

export function roundUpToFiveMinutes(date = new Date()) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const remainder = next.getMinutes() % 5;
  if (remainder !== 0) next.setMinutes(next.getMinutes() + (5 - remainder));
  return next;
}

export function roundToNearestFiveMinutes(date = new Date()) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  next.setMinutes(Math.round(next.getMinutes() / 5) * 5);
  return next;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function maxDate(...dates) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function minDate(...dates) {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function stripSeconds(date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

function parseTime(value, fallback) {
  const match = String(value || fallback).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return parseTime(fallback, DEFAULT_WORKDAY_START);
  return {
    hours: Math.min(23, Math.max(0, Number(match[1]))),
    minutes: Math.min(59, Math.max(0, Number(match[2])))
  };
}

export function getWorkdayBounds(referenceDate = new Date(), settings = {}) {
  const startParts = parseTime(settings.workday_start, DEFAULT_WORKDAY_START);
  const endParts = parseTime(settings.workday_end, DEFAULT_WORKDAY_END);
  const start = new Date(referenceDate);
  start.setHours(startParts.hours, startParts.minutes, 0, 0);
  const end = new Date(referenceDate);
  end.setHours(endParts.hours, endParts.minutes, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

export function getActivityBounds(referenceDate = new Date(), activity = {}, settings = {}) {
  const workday = getWorkdayBounds(referenceDate, settings);
  const availabilityEnabled = Boolean(
    activity.availability_window_enabled ?? activity.activity_window_enabled
  );
  if (!availabilityEnabled) return workday;
  const startParts = parseTime(
    activity.availability_start ?? activity.activity_start_time,
    settings.workday_start || DEFAULT_WORKDAY_START
  );
  const endParts = parseTime(
    activity.availability_end ?? activity.activity_end_time,
    settings.workday_end || DEFAULT_WORKDAY_END
  );
  const start = new Date(referenceDate);
  start.setHours(startParts.hours, startParts.minutes, 0, 0);
  const end = new Date(referenceDate);
  end.setHours(endParts.hours, endParts.minutes, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);

  return {
    start: maxDate(start, workday.start),
    end: minDate(end, workday.end)
  };
}

function requireActivityWindow(referenceDate, activity, settings) {
  const bounds = getActivityBounds(referenceDate, activity, settings);
  if (bounds.end <= bounds.start) {
    throw scheduleError(
      `${activity.activity_name || activity.name || "This activity"} is not available during the configured workday.`
    );
  }
  return bounds;
}

export function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function isActiveTimedItem(item) {
  return Boolean(item.is_timed) && ACTIVE_ITEM_STATUSES.has(item.status);
}

function itemRange(item) {
  return {
    start: parseStoredDate(item.scheduled_start),
    end: parseStoredDate(item.scheduled_end)
  };
}

function sameGuest(item, guestId) {
  return Number(item.guest_id) === Number(guestId);
}

function conflictsWithSameGuest(candidateStart, candidateEnd, existingItems, guestId) {
  return existingItems.some((item) => {
    if (!sameGuest(item, guestId) || !isActiveTimedItem(item)) return false;
    const range = itemRange(item);
    return rangesOverlap(candidateStart, candidateEnd, range.start, range.end);
  });
}

function conflictsWithActivityLane(candidateStart, candidateEnd, existingItems, activityId) {
  if (activityId === null || activityId === undefined) return false;
  return existingItems.some((item) => {
    if (!isActiveTimedItem(item)) return false;
    if (Number(item.activity_id) !== Number(activityId)) return false;
    const range = itemRange(item);
    return rangesOverlap(candidateStart, candidateEnd, range.start, range.end);
  });
}

export function findEarliestSlot({
  activityId,
  guestId,
  durationMinutes,
  minStart,
  existingItems,
  bufferMinutes,
  maxEnd
}) {
  let cursor = new Date(minStart);
  const sorted = existingItems
    .filter(isActiveTimedItem)
    .toSorted((a, b) => parseStoredDate(a.scheduled_start) - parseStoredDate(b.scheduled_start));

  for (let guard = 0; guard < 500; guard += 1) {
    const end = addMinutes(cursor, durationMinutes);
    if (maxEnd && end > maxEnd) {
      throw scheduleError("There is not enough open time left in the workday for this activity.");
    }

    const blockingItem = sorted.find((item) => {
      const samePerson = sameGuest(item, guestId);
      const sameLane = Number(item.activity_id) === Number(activityId);
      if (!samePerson && !sameLane) return false;
      const range = itemRange(item);
      return samePerson
        ? rangesOverlap(
            addMinutes(cursor, -bufferMinutes),
            addMinutes(end, bufferMinutes),
            range.start,
            range.end
          )
        : rangesOverlap(cursor, end, range.start, range.end);
    });

    if (!blockingItem) return { start: cursor, end };
    cursor = addMinutes(
      parseStoredDate(blockingItem.scheduled_end),
      sameGuest(blockingItem, guestId) ? bufferMinutes : 0
    );
  }

  throw scheduleError("The schedule could not find an open time for this activity.");
}

function getSlotFitScore({
  slot,
  activityId,
  guestId,
  durationMinutes,
  existingItems,
  bufferMinutes,
  activityEnd
}) {
  const nextBlockingStart = existingItems
    .filter(isActiveTimedItem)
    .flatMap((item) => {
      const blocksGuest = sameGuest(item, guestId);
      const blocksLane = Number(item.activity_id) === Number(activityId);
      if (!blocksGuest && !blocksLane) return [];
      const range = itemRange(item);
      const usableStart = blocksGuest ? addMinutes(range.start, -bufferMinutes) : range.start;
      return usableStart >= slot.end ? [usableStart] : [];
    })
    .reduce(
      (earliest, candidate) => (candidate < earliest ? candidate : earliest),
      new Date(8.64e15)
    );
  const gapSlackMinutes = Number.isFinite(nextBlockingStart.getTime())
    ? Math.max(0, (nextBlockingStart - slot.end) / 60_000)
    : Number.POSITIVE_INFINITY;

  return {
    gapSlackMinutes,
    windowSlackMinutes: Math.max(0, (activityEnd - slot.end) / 60_000),
    durationMinutes
  };
}

function compareAutomaticCandidates(left, right) {
  const startDifference = left.slot.start - right.slot.start;
  if (startDifference !== 0) return startDifference;

  const leftHasClosingGap = Number.isFinite(left.fit.gapSlackMinutes);
  const rightHasClosingGap = Number.isFinite(right.fit.gapSlackMinutes);
  if (leftHasClosingGap !== rightHasClosingGap) return leftHasClosingGap ? -1 : 1;

  return (
    left.fit.gapSlackMinutes - right.fit.gapSlackMinutes ||
    left.fit.windowSlackMinutes - right.fit.windowSlackMinutes ||
    right.fit.durationMinutes - left.fit.durationMinutes ||
    Number(left.activityId) - Number(right.activityId) ||
    Number(left.guestId) - Number(right.guestId) ||
    Number(left.itemId || 0) - Number(right.itemId || 0)
  );
}

export function scheduleActivities({
  activities,
  guestId,
  existingItems,
  bufferMinutes,
  now = new Date(),
  preserveOrder = false,
  settings = {}
}) {
  const timedActivities = activities.filter((activity) => Boolean(activity.time_limit_enabled));
  const scheduled = [];
  const workingItems = [...existingItems];
  const { start: workdayStart, end: workdayEnd } = getWorkdayBounds(now, settings);
  let minStart = maxDate(roundUpToFiveMinutes(now), workdayStart);
  const remaining = timedActivities.map((activity, originalIndex) => ({
    activity,
    originalIndex
  }));

  if (timedActivities.length > 0 && minStart >= workdayEnd) {
    throw scheduleError("The workday is closed. Please ask staff for help.");
  }

  while (remaining.length > 0) {
    const candidates = [];
    let firstError = null;
    const activitiesToEvaluate = preserveOrder ? remaining.slice(0, 1) : remaining;
    activitiesToEvaluate.forEach(({ activity, originalIndex }) => {
      try {
        const activityBounds = requireActivityWindow(now, activity, settings);
        const slot = findEarliestSlot({
          activityId: activity.id,
          guestId,
          durationMinutes: activity.duration_minutes,
          minStart: maxDate(minStart, activityBounds.start),
          existingItems: workingItems,
          bufferMinutes,
          maxEnd: activityBounds.end
        });
        candidates.push({
          activity,
          activityId: activity.id,
          guestId,
          originalIndex,
          slot,
          fit: getSlotFitScore({
            slot,
            activityId: activity.id,
            guestId,
            durationMinutes: activity.duration_minutes,
            existingItems: workingItems,
            bufferMinutes,
            activityEnd: activityBounds.end
          })
        });
      } catch (error) {
        firstError ||= error;
      }
    });
    if (candidates.length === 0)
      throw firstError || scheduleError("No open activity time remains.");

    candidates.sort(preserveOrder ? () => 0 : compareAutomaticCandidates);
    const { activity, originalIndex, slot } = candidates[0];
    const item = {
      activity_id: activity.id,
      guest_id: guestId,
      activity_name: activity.name,
      duration_minutes: activity.duration_minutes,
      is_timed: 1,
      activity_window_enabled: activity.availability_window_enabled ? 1 : 0,
      activity_start_time: activity.availability_start,
      activity_end_time: activity.availability_end,
      scheduled_start: slot.start.toISOString(),
      scheduled_end: slot.end.toISOString(),
      alarm_enabled: activity.alarm_enabled ? 1 : 0,
      alarm_minutes_before: activity.alarm_minutes_before || 5,
      status: "Waiting",
      sort_order: scheduled.length + 1
    };
    scheduled.push(item);
    workingItems.push(item);
    minStart = addMinutes(slot.end, bufferMinutes);
    remaining.splice(
      remaining.findIndex((candidate) => candidate.originalIndex === originalIndex),
      1
    );
  }

  return scheduled;
}

export function canMoveItem({ item, targetStart, existingItems, bufferMinutes = 0 }) {
  if (!item.is_timed) return false;
  const targetEnd = addMinutes(targetStart, item.duration_minutes);
  const relevantItems = existingItems.filter(
    (candidate) => Number(candidate.id) !== Number(item.id)
  );
  const sameGuestBlocked = conflictsWithSameGuest(
    addMinutes(targetStart, -bufferMinutes),
    addMinutes(targetEnd, bufferMinutes),
    relevantItems,
    item.guest_id
  );
  const sameActivityBlocked = conflictsWithActivityLane(
    targetStart,
    targetEnd,
    relevantItems,
    item.activity_id
  );
  return !sameGuestBlocked && !sameActivityBlocked;
}

export function repairScheduleAfterMove({
  items,
  itemId,
  targetStart,
  bufferMinutes = 0,
  settings = {},
  now = new Date()
}) {
  const timedItems = items.filter((item) => Boolean(item.is_timed));
  const pinnedId = Number(itemId);
  const pinned = timedItems.find((item) => Number(item.id) === pinnedId);
  if (!pinned) throw scheduleError("Timed activity not found.");

  const snappedTargetStart = roundToNearestFiveMinutes(targetStart);
  const { start: workdayStart, end: workdayEnd } = getWorkdayBounds(snappedTargetStart, settings);
  const pinnedBounds = requireActivityWindow(snappedTargetStart, pinned, settings);
  const checkedInAt = roundUpToFiveMinutes(parseStoredDate(pinned.checked_in_at));
  const earliestStart = maxDate(
    workdayStart,
    pinnedBounds.start,
    checkedInAt,
    roundUpToFiveMinutes(now)
  );

  if (snappedTargetStart < earliestStart) {
    throw scheduleError(
      "Activities cannot be scheduled before check-in, in the past, or before this activity opens."
    );
  }
  if (addMinutes(snappedTargetStart, pinned.duration_minutes) > pinnedBounds.end) {
    throw scheduleError("That activity would go past its configured end time.");
  }

  const normalized = timedItems.map((item) => ({
    ...item,
    desired_start:
      Number(item.id) === pinnedId ? snappedTargetStart : parseStoredDate(item.scheduled_start)
  }));
  const pinnedEnd = addMinutes(snappedTargetStart, pinned.duration_minutes);
  const preReserved = normalized.filter((item) => {
    if (Number(item.id) === pinnedId) return false;
    const start = parseStoredDate(item.scheduled_start);
    const end = parseStoredDate(item.scheduled_end);
    const sameLane = Number(item.activity_id) === Number(pinned.activity_id);
    const samePerson = sameGuest(item, pinned.guest_id);
    const laneConflict = sameLane && rangesOverlap(start, end, snappedTargetStart, pinnedEnd);
    const guestConflict =
      samePerson &&
      rangesOverlap(
        addMinutes(start, -bufferMinutes),
        addMinutes(end, bufferMinutes),
        snappedTargetStart,
        pinnedEnd
      );
    return !laneConflict && !guestConflict && end <= snappedTargetStart;
  });

  const preReservedIds = new Set(preReserved.map((item) => Number(item.id)));
  const laneEnd = new Map();
  const guestEnd = new Map();
  const repaired = new Map();

  preReserved
    .toSorted((a, b) => parseStoredDate(a.scheduled_start) - parseStoredDate(b.scheduled_start))
    .forEach((item) => {
      const end = parseStoredDate(item.scheduled_end);
      laneEnd.set(
        Number(item.activity_id),
        maxDate(laneEnd.get(Number(item.activity_id)) || workdayStart, end)
      );
      guestEnd.set(
        Number(item.guest_id),
        maxDate(guestEnd.get(Number(item.guest_id)) || workdayStart, end)
      );
      repaired.set(Number(item.id), {
        ...item,
        scheduled_start: parseStoredDate(item.scheduled_start).toISOString(),
        scheduled_end: end.toISOString()
      });
    });

  const ordered = [
    normalized.find((item) => Number(item.id) === pinnedId),
    ...normalized
      .filter((item) => Number(item.id) !== pinnedId && !preReservedIds.has(Number(item.id)))
      .toSorted((a, b) => a.desired_start - b.desired_start)
  ];

  ordered.forEach((item) => {
    const itemBounds = requireActivityWindow(snappedTargetStart, item, settings);
    const itemCheckIn = roundUpToFiveMinutes(parseStoredDate(item.checked_in_at));
    const laneAvailable = laneEnd.get(Number(item.activity_id)) || workdayStart;
    const guestAvailable = guestEnd.has(Number(item.guest_id))
      ? addMinutes(guestEnd.get(Number(item.guest_id)), bufferMinutes)
      : workdayStart;
    const start = maxDate(
      item.desired_start,
      workdayStart,
      itemBounds.start,
      itemCheckIn,
      laneAvailable,
      guestAvailable
    );
    const end = addMinutes(start, item.duration_minutes);
    if (end > minDate(workdayEnd, itemBounds.end)) {
      throw scheduleError("That move would push an activity past its configured end time.");
    }
    laneEnd.set(Number(item.activity_id), end);
    guestEnd.set(Number(item.guest_id), end);
    repaired.set(Number(item.id), {
      ...item,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString()
    });
  });

  return [...repaired.values()].toSorted(
    (a, b) => parseStoredDate(a.scheduled_start) - parseStoredDate(b.scheduled_start)
  );
}

export function compactScheduleAfterFinalStatus({
  items,
  itemId,
  status,
  bufferMinutes = 0,
  settings = {},
  now = new Date()
}) {
  if (!FINAL_ITEM_STATUSES.has(status)) {
    throw scheduleError("Schedule compaction only applies to completed or skipped activities.");
  }
  const timedItems = items.filter((item) => Boolean(item.is_timed));
  const finalizedId = Number(itemId);
  const finalized = timedItems.find((item) => Number(item.id) === finalizedId);
  if (!finalized) throw scheduleError("Timed activity not found.");

  const checkedInAt = roundUpToFiveMinutes(parseStoredDate(finalized.checked_in_at));
  const actualEnd = maxDate(stripSeconds(now), checkedInAt);
  const actualStart = minDate(parseStoredDate(finalized.scheduled_start), actualEnd);
  const { start: workdayStart, end: workdayEnd } = getWorkdayBounds(actualEnd, settings);
  const normalized = timedItems.map((item) =>
    Number(item.id) === finalizedId
      ? {
          ...item,
          status,
          scheduled_start: actualStart.toISOString(),
          scheduled_end: actualEnd.toISOString()
        }
      : { ...item }
  );
  return rebalanceWaitingSchedule({
    items: normalized,
    bufferMinutes,
    settings,
    now: actualEnd
  });
}

export function rebalanceWaitingSchedule({
  items,
  bufferMinutes = 0,
  settings = {},
  now = new Date()
}) {
  const timedItems = items.filter((item) => Boolean(item.is_timed));
  const { start: workdayStart, end: workdayEnd } = getWorkdayBounds(now, settings);
  const scheduleFloor = maxDate(roundUpToFiveMinutes(now), workdayStart);
  const repaired = new Map();
  const normalized = timedItems.map((item) => ({ ...item }));
  const fixedItems = normalized.filter((item) => item.status !== "Waiting");
  fixedItems.forEach((item) => repaired.set(Number(item.id), item));
  const workingItems = fixedItems.filter((item) => item.status === "In Progress");
  const waiting = normalized.filter((item) => item.status === "Waiting");

  while (waiting.length > 0) {
    const candidates = waiting.map((item) => {
      const itemBounds = requireActivityWindow(now, item, settings);
      const itemCheckIn = roundUpToFiveMinutes(parseStoredDate(item.checked_in_at));
      const slot = findEarliestSlot({
        activityId: item.activity_id,
        guestId: item.guest_id,
        durationMinutes: item.duration_minutes,
        minStart: maxDate(scheduleFloor, itemBounds.start, itemCheckIn),
        existingItems: workingItems,
        bufferMinutes,
        maxEnd: minDate(workdayEnd, itemBounds.end)
      });
      return {
        item,
        activityId: item.activity_id,
        guestId: item.guest_id,
        itemId: item.id,
        slot,
        fit: getSlotFitScore({
          slot,
          activityId: item.activity_id,
          guestId: item.guest_id,
          durationMinutes: item.duration_minutes,
          existingItems: workingItems,
          bufferMinutes,
          activityEnd: minDate(workdayEnd, itemBounds.end)
        })
      };
    });
    candidates.sort(compareAutomaticCandidates);
    const { item, slot } = candidates[0];
    const rescheduled = {
      ...item,
      scheduled_start: slot.start.toISOString(),
      scheduled_end: slot.end.toISOString()
    };
    workingItems.push(rescheduled);
    repaired.set(Number(item.id), rescheduled);
    waiting.splice(
      waiting.findIndex((candidate) => Number(candidate.id) === Number(item.id)),
      1
    );
  }

  return [...repaired.values()].toSorted(
    (a, b) => parseStoredDate(a.scheduled_start) - parseStoredDate(b.scheduled_start)
  );
}
