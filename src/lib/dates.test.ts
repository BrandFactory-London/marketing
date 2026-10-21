import { describe, expect, it } from "vitest";
import { addDays, isIsoDate, londonToday, longDate, monthGrid, monthLabel, shiftMonth, shortDate, weekday } from "./dates";

describe("London dates", () => {
  it("uses the London day, not UTC, during summer time", () => {
    // 23:30 UTC on 24 Oct 2026 is 00:30 on 25 Oct in London (BST).
    expect(londonToday(new Date("2026-10-24T23:30:00Z"))).toBe("2026-10-25");
    expect(londonToday(new Date("2026-10-24T22:59:00Z"))).toBe("2026-10-24");
  });

  it("uses GMT after the clocks go back on 25 Oct 2026", () => {
    expect(londonToday(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-25");
    expect(londonToday(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
  });

  it("adds days across month, year and the BST change", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-21", 55)).toBe("2026-12-15");
  });

  it("numbers weekdays like the packages config (1 is Monday)", () => {
    expect(weekday("2026-10-19")).toBe(1);
    expect(weekday("2026-10-20")).toBe(2);
    expect(weekday("2026-10-25")).toBe(0);
  });

  it("validates dates", () => {
    expect(isIsoDate("2026-10-27")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("27/10/2026")).toBe(false);
  });

  it("builds a six-week, Monday-first month grid", () => {
    const grid = monthGrid("2026-10");
    expect(grid).toHaveLength(6);
    expect(grid[0][0]).toBe("2026-09-28");
    expect(grid[0][3]).toBe("2026-10-01");
    expect(grid[5][6]).toBe("2026-11-08");
    expect(grid.flat().every((day, index, all) => index === 0 || day === addDays(all[index - 1], 1))).toBe(true);
  });

  it("shifts months and formats dates", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(shortDate("2026-10-27")).toBe("27 Oct");
    expect(longDate("2026-10-27")).toBe("Tue 27 Oct 2026");
  });
});
