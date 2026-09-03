import type { Venue } from "../types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidCutoffTime(value: string): boolean {
  return TIME_RE.test(value);
}

export const MAX_DAYS_AHEAD = 14;

/** Server-local "today" as YYYY-MM-DD, matching how dates are stored/compared. */
export function today(now: Date = new Date()): string {
  return toDateKey(now);
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The exact server-local instant a venue stops taking orders for a given date. */
export function cutoffInstant(venue: Pick<Venue, "cutoff_time">, date: string): Date {
  if (!DATE_RE.test(date)) throw new Error(`Invalid date: ${date}`);
  if (!TIME_RE.test(venue.cutoff_time)) {
    throw new Error(`Invalid cutoff_time: ${venue.cutoff_time}`);
  }
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = venue.cutoff_time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}

export function isPastCutoff(
  venue: Pick<Venue, "cutoff_time">,
  date: string,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= cutoffInstant(venue, date).getTime();
}

/**
 * Whether `date` is a day employees are allowed to order for at all: not in
 * the past, and not further out than MAX_DAYS_AHEAD (an arbitrary, generous
 * planning horizon — see SPEC non-goals).
 */
export function isDateSelectable(date: string, now: Date = new Date()): boolean {
  if (!DATE_RE.test(date)) return false;
  const todayKey = today(now);
  if (date < todayKey) return false;
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);
  return date <= toDateKey(maxDate);
}
