import type { Cadence } from "@/config/run-presets";
import { addDays, weekday } from "./dates";

// The cadence engine (Phase 2 A1, orientation Q4). Pure: given a run's dates and rules, which days its slots fall on.
// Weekdays use JavaScript's numbering (0 is Sunday). The database work around it is in src/lib/runs.ts.

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

// The last day of a run that starts on `start` and lasts `months` months: the day before the same date months later.
export function runEnd(start: string, months: number): string {
  const [year, month, day] = start.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastOfMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastOfMonth)));
  return addDays(end.toISOString().slice(0, 10), -1);
}

export function matchingDays(from: string, to: string, weekdays: readonly number[]): string[] {
  const wanted = new Set(weekdays);
  return daysBetween(from, to).filter((day) => wanted.has(weekday(day)));
}

// SEO cadence dates: the rule's weekdays in order, skipping days already taken by slots that stay, until `amount` slots
// exist in all (`kept` of them already).
export function seoCadenceDates(input: { startsOn: string; endsOn: string; weekdays: readonly number[]; amount: number; kept: number; taken: ReadonlySet<string> }): string[] {
  const chosen: string[] = [];
  let count = input.kept;
  for (const day of matchingDays(input.startsOn, input.endsOn, input.weekdays)) {
    if (count >= input.amount) break;
    if (input.taken.has(day)) continue;
    chosen.push(day);
    count++;
  }
  return chosen;
}

export type ParentSlot = { id: string; slotDate: string };
export type DerivedPlacement = { parentId: string; date: string };

// Where a derived channel's slots go (orientation Q4): one per SEO post at most, never before its parent, inside the run.
// "after": the SEO posts in date order, each n days later. "weekdays": each matching day in order, given to the latest
// SEO post on or before it that has no slot of this channel yet.
export function placeDerived(input: { parents: readonly ParentSlot[]; cadence: Cadence; amount: number; startsOn: string; endsOn: string }): DerivedPlacement[] {
  const parents = [...input.parents].sort((a, b) => a.slotDate.localeCompare(b.slotDate));
  const placed: DerivedPlacement[] = [];
  if (input.amount <= 0) return placed;
  if ("after" in input.cadence) {
    for (const parent of parents) {
      if (placed.length >= input.amount) break;
      const date = addDays(parent.slotDate, input.cadence.after);
      if (date > input.endsOn || date < input.startsOn) continue;
      placed.push({ parentId: parent.id, date });
    }
    return placed;
  }
  const used = new Set<string>();
  for (const day of matchingDays(input.startsOn, input.endsOn, input.cadence.weekdays)) {
    if (placed.length >= input.amount) break;
    const parent = parents.filter((item) => item.slotDate <= day && !used.has(item.id)).at(-1);
    if (!parent) continue;
    used.add(parent.id);
    placed.push({ parentId: parent.id, date: day });
  }
  return placed;
}

// The prefilled amount for a rule over a run: every matching day for SEO, one per SEO post for derived channels.
export function defaultAmount(cadence: Cadence, startsOn: string, endsOn: string, seoAmount: number): number {
  if ("weekdays" in cadence) {
    const days = matchingDays(startsOn, endsOn, cadence.weekdays).length;
    return seoAmount ? Math.min(days, seoAmount) : days;
  }
  return seoAmount;
}
