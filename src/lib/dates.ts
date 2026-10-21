// Date-only helpers. Slots are London calendar days ("YYYY-MM-DD"), so "today" is worked out in
// Europe/London, never from the server or database clock (both run on UTC/GMT).

const londonDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

export function londonToday(now: Date = new Date()): string {
  return londonDay.format(now);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 0 is Sunday, 1 is Monday: the same numbering as src/config/packages.ts and Postgres extract(dow).
export function weekday(iso: string): number {
  return toUtc(iso).getUTCDay();
}

// "2026-10"
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

// Six weeks of days, Monday first, covering the month (Calendar prototype).
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, -((weekday(first) + 6) % 7));
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)));
}

const monthLabelFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const shortFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayNameFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

// "October 2026"
export function monthLabel(month: string): string {
  return monthLabelFormat.format(toUtc(`${month}-01`));
}

// "27 Oct"
export function shortDate(iso: string): string {
  return shortFormat.format(toUtc(iso));
}

// "Tue, 27 Oct 2026" in en-GB becomes "Tue 27 Oct 2026" without the comma.
export function longDate(iso: string): string {
  return longFormat.format(toUtc(iso)).replace(",", "");
}

// "Tue"
export function dayName(iso: string): string {
  return dayNameFormat.format(toUtc(iso));
}
