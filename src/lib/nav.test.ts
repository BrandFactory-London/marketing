import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_TAB, isCurrent, mainNav, PROJECT_TABS, projectTabs, settingsNav } from "./nav";

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

describe("project tabs", () => {
  it("follow the prototype's order and each has a page", () => {
    expect(PROJECT_TABS.map((tab) => tab.label)).toEqual(["Content and performance", "Sitemap", "Run plan", "Knowledge", "Settings"]);
    for (const tab of PROJECT_TABS) {
      expect(existsSync(path.join(appDir, "projects/[projectId]", tab.segment, "page.tsx")), tab.segment).toBe(true);
    }
    expect(PROJECT_TABS.some((tab) => tab.segment === DEFAULT_PROJECT_TAB)).toBe(true);
  });

  it("builds each tab's link from the project id", () => {
    expect(projectTabs("abc")[3]).toEqual({ label: "Knowledge", href: "/projects/abc/knowledge" });
  });
});
