import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isCurrent, mainNav, settingsNav } from "./nav";

const appDir = path.join(process.cwd(), "src/app/(app)");

describe("navigation", () => {
  it("follows the prototype's order", () => {
    expect(mainNav.map((item) => item.label)).toEqual(["Home", "Calendar", "CRM", "Projects", "Posts", "Review queue"]);
    expect(settingsNav.map((item) => item.label)).toEqual(["BrandFactory rules", "AI models", "Connections"]);
  });

  it("has a page for every item", () => {
    for (const item of [...mainNav, ...settingsNav]) {
      expect(existsSync(path.join(appDir, item.href, "page.tsx")), item.href).toBe(true);
    }
  });

  it("marks Home current only on the root path", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/", "/projects")).toBe(false);
  });

  it("marks a section current on its nested paths but not on lookalike paths", () => {
    expect(isCurrent("/projects", "/projects/migss")).toBe(true);
    expect(isCurrent("/posts", "/postsx")).toBe(false);
  });
});
