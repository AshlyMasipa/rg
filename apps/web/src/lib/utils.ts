import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CommunityNeed, Day } from "shared";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
export const rand = (n: number) => zar.format(n).replace(/ /g, " ");
export const num = (n: number) => new Intl.NumberFormat("en-ZA").format(n).replace(/ /g, " ");

export const DAY_LABEL: Record<Day, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
export const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const daysLabel = (days: Day[]) => days.map((d) => DAY_LABEL[d]).join(", ");

/** Local calendar date as YYYY-MM-DD (not UTC — Johannesburg is UTC+2). */
export function todayLocal(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/**
 * Fields under this confidence are flagged amber for the coach to check.
 * Mirrors CONFIDENCE_THRESHOLD in packages/ai/src/types.ts (not imported so the
 * browser bundle never pulls in the Gemini SDK).
 */
export const CONFIDENCE_THRESHOLD = 0.7;

export const needTitle = (n: CommunityNeed) => `${n.participants} ${n.age_group} ${n.gender}`;
export const needWhen = (n: CommunityNeed) => `${daysLabel(n.days)} ${n.start_time}–${n.end_time}`;
export function needWants(n: CommunityNeed) {
  const w: string[] = [];
  if (n.needs.field) w.push("field");
  if (n.needs.coach) w.push("coach");
  if (n.needs.balls) w.push(`${n.needs.balls} balls`);
  if (n.needs.transport) w.push("transport");
  return w.join(", ") || "—";
}

const DOW: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
/** Planned session dates: from start_date, every matching weekday, weeks × days.length of them. */
export function plannedSessions(startDate: string, days: Day[], weeks: number): string[] {
  const out: string[] = [];
  const total = weeks * days.length;
  const d = new Date(`${startDate}T12:00:00`);
  for (let i = 0; i < 400 && out.length < total; i++) {
    if (days.includes(DOW[d.getDay()])) out.push(todayLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
/** Next date (today or later) that falls on one of the need's days. */
export function nextOccurrence(days: Day[], from = new Date()) {
  const d = new Date(from);
  for (let i = 0; i < 8; i++) {
    if (days.includes(DOW[d.getDay()])) return todayLocal(d);
    d.setDate(d.getDate() + 1);
  }
  return todayLocal(from);
}
