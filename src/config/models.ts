// The one list of Claude models the app offers (design decision 13). Adding a model is a one-line change here.
// Prices are Anthropic's first-party list prices in US dollars per million tokens, used to cost every call
// (γ4 orientation Q7). Cache writes use the 5-minute TTL rate (1.25x input).
export const PRICES_CHECKED = "2026-10-06";

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", price: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 } },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", price: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 } },
  // Haiku 5.5's price applies to prompts up to 100k tokens; a pack and a post stay well under that. Its cache
  // read price is the standard 0.1x of input.
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", price: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 } },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && MODELS.some((model) => model.id === value);
}

export function modelLabel(id: string): string {
  return MODELS.find((model) => model.id === id)?.label ?? id;
}

export type TokenUsage = { inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number };

// The cost of one call. Anthropic reports cached input separately from input_tokens, so each part is priced
// on its own. An unknown model costs nothing rather than guessing; the call record keeps its tokens.
export function callCost(model: string, usage: TokenUsage): number {
  const entry = MODELS.find((item) => item.id === model);
  if (!entry) return 0;
  const { price } = entry;
  const dollars =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheWriteTokens * price.cacheWrite +
      usage.cacheReadTokens * price.cacheRead) /
    1_000_000;
  return Math.round(dollars * 1_000_000) / 1_000_000;
}
