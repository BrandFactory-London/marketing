import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isMissed, LISTED_STATUSES, POST_STATUSES, postStatusLabel } from "./post-status";

describe("post statuses", () => {
  it("has decision 16's nine states with the approved display words", () => {
    expect(POST_STATUSES.map((item) => [item.key, item.label, item.tone])).toEqual([
      ["planned", "Planned", "neutral"],
      ["topic_set", "Topic set", "neutral"],
      ["spec_confirmed", "Spec ready", "brand"],
      ["generating", "Writing", "brand"],
      ["in_review", "Needs review", "warning"],
      ["approved", "Approved", "brand"],
      ["published", "Published", "success"],
      ["flagged", "Failed", "danger"],
      ["rejected", "Rejected", "neutral"],
    ]);
  });

  it("matches the design system README's status words", () => {
    const readme = readFileSync(path.join(process.cwd(), "design/system/README.md"), "utf8");
    const line = readme.split("\n").find((text) => text.includes("Status words are fixed"))!;
    const words = [...POST_STATUSES.map((item) => item.label), "Checking"];
    for (const word of words) expect(line, word).toContain(word);
  });

  it("shows the generation step for generating", () => {
    expect(postStatusLabel("generating", "writer")).toBe("Writing");
    expect(postStatusLabel("generating", "critic")).toBe("Checking");
    expect(postStatusLabel("flagged")).toBe("Failed");
  });

  it("lists every status on the Posts page except planned", () => {
    expect(LISTED_STATUSES).not.toContain("planned");
    expect(LISTED_STATUSES).toHaveLength(8);
  });

  it("marks only pre-writing slots in the past as missed", () => {
    expect(isMissed("planned", "2026-10-20", "2026-10-21")).toBe(true);
    expect(isMissed("topic_set", "2026-10-20", "2026-10-21")).toBe(true);
    expect(isMissed("topic_set", "2026-10-21", "2026-10-21")).toBe(false);
    expect(isMissed("published", "2026-10-01", "2026-10-21")).toBe(false);
  });

  // D.3.1: no other file may spell a status word as a string or JSX text, so the words cannot drift.
  it("is the only place in src/ that spells a status word", () => {
    const words = ["Planned", "Topic set", "Spec ready", "Writing", "Checking", "Needs review", "Approved", "Published", "Failed", "Rejected", "Missed", "Needs another pass", "Could not finish", "Needs your input"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) walk(file);
        else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts") && !file.endsWith(path.join("config", "post-status.ts"))) {
          const text = readFileSync(file, "utf8");
          for (const word of words) {
            if (new RegExp(`["'\`>]${word}["'\`<]`).test(text)) offenders.push(`${path.relative(process.cwd(), file)}: ${word}`);
          }
        }
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
