import { addDays } from "./dates";

// When posts are generated (Phase 2 A4, orientation Q7). Pure. An active run with auto generation has a next generation
// day. On that day every planned SEO post dated up to 27 days ahead is generated, and the next day moves 14 days on, so
// 2 to 4 weeks of posts are always ready. A missed day catches up on the next morning's run.

export const HORIZON_DAYS = 27;
export const INTERVAL_DAYS = 14;

// The last slot date a generation on `day` covers.
export function windowEnd(day: string): string {
  return addDays(day, HORIZON_DAYS);
}

// The day after this generation.
export function nextAfter(day: string): string {
  return addDays(day, INTERVAL_DAYS);
}

// The generation day that will cover a post dated `slotDate`, given the run's next generation day: that day, or a
// fortnight after it, and so on. A day already past is today, since the morning run catches up.
export function generatesOn(slotDate: string, nextGenerationOn: string | null, today: string): string | null {
  if (!nextGenerationOn) return null;
  let day = nextGenerationOn < today ? today : nextGenerationOn;
  while (windowEnd(day) < slotDate) day = nextAfter(day);
  return day;
}

export function isDue(run: { status: string; autoGenerate: boolean; nextGenerationOn: string | null }, today: string): boolean {
  return run.status === "active" && run.autoGenerate && run.nextGenerationOn !== null && run.nextGenerationOn <= today;
}
