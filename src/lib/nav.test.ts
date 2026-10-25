import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_TAB, isCurrent, mainNav, PROJECT_TAB_REDIRECTS, PROJECT_TABS, projectTabs, settingsNav } from "./nav";

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
  it("are the four Phase 2 tabs, each with a page, opening on the Run plan", () => {
    expect(PROJECT_TABS.map((tab) => tab.label)).toEqual(["Details", "Run plan", "Content and performance", "Knowledge"]);
    for (const tab of PROJECT_TABS) {
      expect(existsSync(path.join(appDir, "projects/[projectId]", tab.segment, "page.tsx")), tab.segment).toBe(true);
    }
    expect(DEFAULT_PROJECT_TAB).toBe("plan");
  });

  it("redirects each folded-in tab to a tab that exists, and the old pages are gone", () => {
    for (const tab of PROJECT_TAB_REDIRECTS) {
      expect(PROJECT_TABS.some((item) => item.segment === tab.to), tab.to).toBe(true);
      expect(existsSync(path.join(appDir, "projects/[projectId]", tab.from)), tab.from).toBe(false);
    }
  });

  it("builds each tab's link from the project id", () => {
    expect(projectTabs("abc")[3]).toEqual({ label: "Knowledge", href: "/projects/abc/knowledge" });
  });
});
