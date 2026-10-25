import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_LINES, GENERATION_LINES, PLAN_LINES, RUN_FINISHED, RUN_STATUSES } from "./run-status";

describe("run words (Phase 2, orientation Q8)", () => {
  // D.3.1: the run, plan, client and generation words are spelled only in src/config/run-status.ts (or, for words they
  // share with posts, in post-status.ts beside it).
  it("are spelled only in run-status.ts", () => {
    const words = [
      ...RUN_STATUSES.map((item) => item.label),
      RUN_FINISHED.label,
      ...Object.values(PLAN_LINES).map((item) => item.label),
      ...Object.values(CLIENT_LINES).map((item) => item.label),
      ...Object.values(GENERATION_LINES).map((item) => item.label),
    ].filter((word) => !["Approved", "Active", "Planning"].includes(word));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) walk(file);
        else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts") && !file.endsWith(path.join("config", "run-status.ts")) && !file.endsWith(path.join("config", "post-status.ts"))) {
          const text = readFileSync(file, "utf8");
          for (const word of words) if (new RegExp(`["'\`>]${word}["'\`<]`).test(text)) offenders.push(`${path.relative(process.cwd(), file)}: ${word}`);
        }
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
