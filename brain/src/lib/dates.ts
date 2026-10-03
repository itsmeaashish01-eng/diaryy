// Calendar-date helpers. Due dates are local calendar days ("2026-10-03"),
// so all arithmetic here works on Y/M/D parts, never on Date instants, which
// keeps a task due "today" from sliding into yesterday across time zones.

import type { Recurrence } from "./types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Today's date in the runtime's local time zone. */
export function localToday(now: Date = new Date()): string {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parts(iso: string): [number, number, number] {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Not a date: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  // Jan 31 + 1 month is Feb 28/29, not Mar 3.
  return toIsoDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * The next due date of a recurring task after it is completed. Advances from
 * the due date (or from today when there is none) and, if the task was
 * overdue, keeps advancing until the date is after today — so finishing a
 * daily task that is a week late does not leave it still overdue.
 */
export function nextOccurrence(dueDate: string | null, rule: Recurrence, today: string): string | null {
  if (rule === "NONE") return null;
  let date = dueDate ?? today;
  const step = (d: string): string => {
    switch (rule) {
      case "DAILY":
        return addDays(d, 1);
      case "WEEKDAYS": {
        let next = addDays(d, 1);
        while (weekday(next) === 0 || weekday(next) === 6) next = addDays(next, 1);
        return next;
      }
      case "WEEKLY":
        return addDays(d, 7);
      case "MONTHLY":
        return addMonths(d, 1);
      case "YEARLY":
        return addMonths(d, 12);
    }
  };
  date = step(date);
  for (let guard = 0; date <= today && guard < 5000; guard++) date = step(date);
  return date;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today", "Tomorrow", "Yesterday", "Fri", "Oct 12", "Oct 12, 2027". */
export function formatDueDate(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const [y, m, d] = parts(iso);
  if (diff > 1 && diff < 7) return WEEKDAYS[weekday(iso)] ?? iso;
  const [ty] = parts(today);
  return y === ty ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "9:30 AM" from "09:30". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "3 min ago", "2 h ago", "Oct 1" — for updated/created timestamps. */
export function formatRelative(isoDateTime: string, now: Date = new Date()): string {
  const then = new Date(isoDateTime);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  const sameYear = then.getFullYear() === now.getFullYear();
  return `${MONTHS[then.getMonth()]} ${then.getDate()}${sameYear ? "" : `, ${then.getFullYear()}`}`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
