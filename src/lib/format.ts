/**
 * Small, client-safe formatting helpers for times and missing values. Times are shown in UTC so the
 * server and the browser always agree, and a missing value reads as a value ("Unknown"), never as a gap.
 */
import { STALE_SOURCE_HOURS } from "./domain";

type DateLike = Date | string | number;

const toDate = (value: DateLike) => (value instanceof Date ? value : new Date(value));

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "long" });

/** "3 minutes ago", "yesterday", "just now". */
export function relativeTime(value: DateLike, now: DateLike = new Date()): string {
  const diff = toDate(value).getTime() - toDate(now).getTime();
  const size = Math.abs(diff);
  if (size < 45_000) return "just now";
  for (const [unit, ms] of UNITS) {
    if (size >= ms || unit === "minute") return relative.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayOnly = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dateShort = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "18 Nov 2026, 14:05 UTC": the exact time, for titles and tables. */
export function formatDateTime(value: DateLike): string {
  return `${dateTime.format(toDate(value))} UTC`;
}

/** "18 Nov 2026" (UTC). */
export function formatDate(value: DateLike): string {
  return dateShort.format(toDate(value));
}

/** "14:05": the time of day in UTC. */
export function formatClock(value: DateLike): string {
  return clock.format(toDate(value));
}

/** The UTC calendar day a time falls on, as `YYYY-MM-DD` (for grouping). */
export function dayKey(value: DateLike): string {
  return toDate(value).toISOString().slice(0, 10);
}

/** "Today", "Yesterday", or "Monday 16 November 2026" for a `YYYY-MM-DD` key. */
export function formatDay(key: string, now: DateLike = new Date()): string {
  const today = dayKey(now);
  if (key === today) return "Today";
  if (key === dayKey(toDate(now).getTime() - 86_400_000)) return "Yesterday";
  return dayOnly.format(new Date(`${key}T00:00:00Z`));
}

/** True when a source has not reported for `STALE_SOURCE_HOURS` and did not check out. */
export function isQuiet(lastSeenAt: DateLike, checkedOutAt: DateLike | null, now: DateLike = new Date()): boolean {
  if (checkedOutAt) return false;
  return toDate(now).getTime() - toDate(lastSeenAt).getTime() > STALE_SOURCE_HOURS * 3_600_000;
}

/** The value, or a word that says it was not given. */
export function orUnknown(value: string | null | undefined, fallback = "Unknown"): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** "1 source", "3 sources". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Runtimes as people say them. Anything unrecognised is shown as reported. */
const RUNTIME_LABELS: Record<string, string> = {
  laptop: "Laptop",
  ci: "CI",
  server: "Server",
  cloud_sandbox: "Cloud sandbox",
  browser: "Browser",
  unknown: "Unknown",
};

export function runtimeLabel(runtime: string | null | undefined): string {
  if (!runtime) return "Unknown";
  return RUNTIME_LABELS[runtime] ?? runtime;
}
