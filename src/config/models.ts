// The one list of Claude models the app offers (design decision 13). Adding a model is a one-line change here.
export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && MODELS.some((model) => model.id === value);
}
