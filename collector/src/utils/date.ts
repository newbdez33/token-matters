const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  // Check round-trip to catch invalid days like Feb 30
  return d.toISOString().startsWith(s);
}

export function getDateRange(from: string, to: string): string[] {
  if (from > to) {
    throw new Error(`Invalid date range: ${from} is after ${to}`);
  }
  const dates: string[] = [];
  const current = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export function toLocalDate(isoTimestamp: string, timezone: string): string {
  const d = new Date(isoTimestamp);
  const formatted = d.toLocaleDateString('en-CA', { timeZone: timezone });
  // en-CA locale gives YYYY-MM-DD format
  return formatted;
}

export function todayInTimezone(timezone: string): string {
  return toLocalDate(new Date().toISOString(), timezone);
}
