import { describe, expect, it } from "vitest";
import { clientStatus, isPackageKey, PACKAGES, packageOption, packageSummary } from "./packages";

describe("packages", () => {
  it("matches design decision 15: posts a week equals the number of weekdays", () => {
    expect(PACKAGES.map((item) => [item.key, item.postsPerWeek, [...item.weekdays]])).toEqual([
      ["entry", 1, [2]],
      ["mid", 2, [2, 4]],
      ["premium", 3, [1, 3, 5]],
    ]);
    for (const item of PACKAGES) expect(item.weekdays).toHaveLength(item.postsPerWeek);
  });

  it("writes the summaries the cards and selects show", () => {
    expect(packageSummary("entry")).toBe("Entry · 1 post a week");
    expect(packageSummary("premium")).toBe("Premium · 3 posts a week");
    expect(packageOption("mid")).toBe("Mid · 2 SEO posts a week");
  });

  it("recognises only the three keys", () => {
    expect(isPackageKey("entry")).toBe(true);
    expect(isPackageKey("Entry")).toBe(false);
    expect(isPackageKey(undefined)).toBe(false);
  });

  it("derives the client status from its projects", () => {
    expect(clientStatus([])).toBe("setup");
    expect(clientStatus(["paused", "active"])).toBe("active");
    expect(clientStatus(["paused"])).toBe("paused");
  });
});
