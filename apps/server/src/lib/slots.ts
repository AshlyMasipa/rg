import type { Day } from "shared";

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

interface Slot { days: Day[]; start_time: string; end_time: string }

/** True if the two weekly slots share a day and their times overlap. */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  const sharedDay = a.days.some((d) => b.days.includes(d));
  return sharedDay && minutes(a.start_time) < minutes(b.end_time) && minutes(b.start_time) < minutes(a.end_time);
}
