import { describe, expect, it } from "vitest";
import { progressLine, progressPercent, STALL_MS } from "./progress";

const now = new Date("2026-10-21T12:00:00Z");
const recent = new Date(now.getTime() - 60_000);
const run = (status: "queued" | "running" | "in_review" | "flagged" | "failed", round = 1, error: string | null = null, updatedAt = recent) => ({
  status,
  round,
  error,
  updatedAt,
});

describe("Generating lines", () => {
  it("follow the run from queued to an outcome", () => {
    expect(progressLine({ status: "spec_confirmed", generationStep: null, generation: null }, now)).toMatchObject({ label: "Spec ready", finished: false });
    expect(progressLine({ status: "generating", generationStep: null, generation: run("queued", 0) }, now)).toMatchObject({ label: "Queued", running: true });
    expect(progressLine({ status: "generating", generationStep: "writer", generation: run("running") }, now)).toMatchObject({ label: "Writing", detail: "Round 1 of 3" });
    expect(progressLine({ status: "generating", generationStep: "critic", generation: run("running") }, now)).toMatchObject({ label: "Checking" });
    expect(progressLine({ status: "generating", generationStep: "writer", generation: run("running", 2) }, now)).toMatchObject({
      label: "Needs another pass",
      tone: "warning",
      detail: "Round 2 of 3, writing",
    });
    expect(progressLine({ status: "in_review", generationStep: null, generation: run("in_review", 2) }, now)).toMatchObject({
      label: "Needs review",
      detail: "Passed the critic in round 2",
      finished: true,
    });
    expect(progressLine({ status: "flagged", generationStep: null, generation: run("flagged", 3) }, now)).toMatchObject({ label: "Failed", canRetry: false });
    expect(progressLine({ status: "spec_confirmed", generationStep: null, generation: run("failed", 1, "Overloaded") }, now)).toMatchObject({
      label: "Could not finish",
      detail: "Overloaded",
      canRetry: true,
    });
  });

  it("call a run with no progress for 20 minutes stopped, with a retry", () => {
    const stale = new Date(now.getTime() - STALL_MS - 1000);
    expect(progressLine({ status: "generating", generationStep: "writer", generation: run("running", 1, null, stale) }, now)).toMatchObject({
      label: "Stopped reporting",
      canRetry: true,
      finished: true,
    });
  });

  it("count finished posts whole and running ones by round", () => {
    const finished = { ...progressLine({ status: "in_review", generationStep: null, generation: run("in_review") }, now), round: 1 };
    const writing = { ...progressLine({ status: "generating", generationStep: "writer", generation: run("running") }, now), round: 1 };
    expect(progressPercent([])).toBe(0);
    expect(progressPercent([finished, writing])).toBe(63);
  });
});
