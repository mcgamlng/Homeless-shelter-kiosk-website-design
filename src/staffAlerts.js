const ACTIVE_STATUSES = new Set(["Waiting", "In Progress"]);

function startTime(item) {
  return item.scheduled_start ? new Date(item.scheduled_start).getTime() : Number.NaN;
}

export function getStaffActionItems(items = [], nowMs = Date.now(), leadMinutes = 5, limit = 4) {
  const leadMs = Math.max(0, Number(leadMinutes) || 0) * 60_000;
  return items
    .filter(
      (item) =>
        item.is_timed &&
        ACTIVE_STATUSES.has(item.status) &&
        Number.isFinite(startTime(item)) &&
        (item.status === "In Progress" || startTime(item) <= nowMs + leadMs)
    )
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "In Progress" ? -1 : 1;
      return startTime(left) - startTime(right);
    })
    .slice(0, Math.max(1, Number(limit) || 4));
}

export function getStartingSoonItems(items = [], nowMs = Date.now(), leadMinutes = 5) {
  const leadMs = Math.max(0, Number(leadMinutes) || 0) * 60_000;
  return items.filter((item) => {
    const startsAt = startTime(item);
    return (
      item.is_timed &&
      item.alarm_enabled &&
      item.status === "Waiting" &&
      Number.isFinite(startsAt) &&
      startsAt >= nowMs - 60_000 &&
      startsAt <= nowMs + leadMs
    );
  });
}

export function describeActionTiming(item, nowMs = Date.now()) {
  if (item.status === "In Progress") return "In progress now";
  const differenceMinutes = Math.round((startTime(item) - nowMs) / 60_000);
  if (differenceMinutes > 1) return `Starts in ${differenceMinutes} min`;
  if (differenceMinutes === 1) return "Starts in 1 min";
  if (differenceMinutes >= 0) return "Ready now";
  const overdueMinutes = Math.abs(differenceMinutes);
  return `${overdueMinutes} min overdue`;
}
