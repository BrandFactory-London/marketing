import { describe, expect, it } from "vitest";
import { callCost, DEFAULT_MODEL, isModelId, MODELS, modelLabel } from "./models";

describe("models", () => {
  it("offers the three current models with Opus 5.5 as the default", () => {
    expect(MODELS.map((model) => model.id)).toEqual(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
    expect(DEFAULT_MODEL).toBe("claude-opus-5-5");
  });

  it("recognises only listed model IDs", () => {
    expect(isModelId("claude-sonnet-5-5")).toBe(true);
    expect(isModelId("claude-opus-5-5-20260401")).toBe(false);
    expect(isModelId(undefined)).toBe(false);
  });

  it("labels models, falling back to the ID", () => {
    expect(modelLabel("claude-haiku-5-5")).toBe("Claude Haiku 5.5");
    expect(modelLabel("something-else")).toBe("something-else");
  });

  it("prices each part of a call at its own rate", () => {
    // 7,000 fresh input, 8,000 output, 1,200 written to cache, 0 read: a first writer call on Opus 5.5.
    expect(callCost("claude-opus-5-5", { inputTokens: 7000, outputTokens: 8000, cacheWriteTokens: 1200, cacheReadTokens: 0 })).toBe(0.194);
    // The same call with the pack read from cache instead.
    expect(callCost("claude-opus-5-5", { inputTokens: 5800, outputTokens: 8000, cacheWriteTokens: 0, cacheReadTokens: 1200 })).toBe(0.18344);
    expect(callCost("claude-sonnet-5-5", { inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 })).toBe(2);
    expect(callCost("unknown-model", { inputTokens: 1000, outputTokens: 1000, cacheWriteTokens: 0, cacheReadTokens: 0 })).toBe(0);
  });
});
