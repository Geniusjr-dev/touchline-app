export function formatMatchDate(date, { weekday = false, fallback = "Date to be confirmed", now = new Date() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return fallback;
  const target = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(target.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    ...(weekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
    ...(target.getUTCFullYear() !== now.getUTCFullYear() ? { year: "numeric" } : {}),
  }).format(target);
}
