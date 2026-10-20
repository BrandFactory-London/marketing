import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MODELS, isModelId } from "./models";

describe("model config", () => {
  it("lists the three Phase 1 models with Opus 5.5 as the default", () => {
    expect(MODELS.map((model) => model.id)).toEqual(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
    expect(DEFAULT_MODEL).toBe("claude-opus-5-5");
  });

  it("recognises only listed model IDs", () => {
    expect(isModelId("claude-sonnet-5-5")).toBe(true);
    expect(isModelId("claude-opus-4")).toBe(false);
    expect(isModelId(undefined)).toBe(false);
  });
});
