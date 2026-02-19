const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
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

export function getISOWeekString(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  // ISO 8601: week starts on Monday, week 1 contains Jan 4th
  const dayOfWeek = d.getUTCDay() || 7; // Convert Sunday=0 to 7
  // Set to nearest Thursday (current date + 4 - dayOfWeek)
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function getMonthString(date: string): string {
  return date.slice(0, 7);
}

export function subtractDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
