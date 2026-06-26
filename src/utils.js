export const STATUSES = ["Waiting", "In Progress", "Completed", "Skipped"];

export function formatTime(value) {
  if (!value) return "Untimed";
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function minutesBetween(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

export function groupByGuest(items) {
  return items.reduce((acc, item) => {
    const key = item.guest_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}
