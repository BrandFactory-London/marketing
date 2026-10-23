import { describe, expect, it } from "vitest";
import { defaultAmount, matchingDays, placeDerived, runEnd, seoCadenceDates } from "./cadence";
import { weekday } from "./dates";

describe("the cadence engine (Phase 2 A1, orientation Q4)", () => {
  it("ends a run the day before the same date the given months later, clamped to short months", () => {
    expect(runEnd("2026-11-18", 3)).toBe("2027-02-17");
    expect(runEnd("2026-11-01", 1)).toBe("2026-11-30");
    expect(runEnd("2026-11-30", 3)).toBe("2027-02-27");
    expect(runEnd("2027-01-31", 1)).toBe("2027-02-27");
  });

  it("lists the rule's weekdays inside the dates", () => {
    const days = matchingDays("2026-11-18", "2026-11-30", [1, 3, 5]);
    expect(days).toEqual(["2026-11-18", "2026-11-20", "2026-11-23", "2026-11-25", "2026-11-27", "2026-11-30"]);
    expect(days.every((day) => [1, 3, 5].includes(weekday(day)))).toBe(true);
  });

  it("stops at the amount and skips days that kept slots already hold", () => {
    const base = { startsOn: "2026-11-18", endsOn: "2027-02-17", weekdays: [2, 4] };
    expect(seoCadenceDates({ ...base, amount: 3, kept: 0, taken: new Set() })).toEqual(["2026-11-19", "2026-11-24", "2026-11-26"]);
    expect(seoCadenceDates({ ...base, amount: 3, kept: 1, taken: new Set(["2026-11-19"]) })).toEqual(["2026-11-24", "2026-11-26"]);
    expect(seoCadenceDates({ ...base, amount: 1, kept: 2, taken: new Set() })).toEqual([]);
  });

  const parents = [
    { id: "a", slotDate: "2026-11-19" },
    { id: "b", slotDate: "2026-11-24" },
    { id: "c", slotDate: "2026-11-30" },
  ];

  it("puts a 'days after' slot after each SEO post, never past the run's end", () => {
    expect(placeDerived({ parents, cadence: { after: 1 }, amount: 3, startsOn: "2026-11-18", endsOn: "2026-11-30" })).toEqual([
      { parentId: "a", date: "2026-11-20" },
      { parentId: "b", date: "2026-11-25" },
    ]);
    expect(placeDerived({ parents, cadence: { after: 0 }, amount: 2, startsOn: "2026-11-18", endsOn: "2026-11-30" })).toHaveLength(2);
  });

  it("gives each set day to the latest SEO post on or before it that has none yet", () => {
    // "GBP Wed and Sun": Wed 25 Nov goes to b (24 Nov), Sun 22 Nov to a, Sun 29 Nov has no free post before it.
    expect(placeDerived({ parents, cadence: { weekdays: [0, 3] }, amount: 5, startsOn: "2026-11-18", endsOn: "2026-11-30" })).toEqual([
      { parentId: "a", date: "2026-11-22" },
      { parentId: "b", date: "2026-11-25" },
    ]);
    // A day before any SEO post gets nothing.
    expect(placeDerived({ parents, cadence: { weekdays: [3] }, amount: 5, startsOn: "2026-11-18", endsOn: "2026-11-19" })).toEqual([]);
  });

  it("prefills every matching day for SEO and one per SEO post for derived channels", () => {
    expect(defaultAmount({ weekdays: [2] }, "2026-11-18", "2027-02-17", 0)).toBe(13);
    expect(defaultAmount({ after: 1 }, "2026-11-18", "2027-02-17", 13)).toBe(13);
    expect(defaultAmount({ weekdays: [1, 3, 5] }, "2026-11-18", "2027-02-17", 13)).toBe(13);
  });
});
