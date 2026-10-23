import type { ContentType } from "./content-types";

// Entry, Mid and Premium as run presets (Phase 2 session A, orientation Q1 and smaller decisions). A preset only prefills a
// run's configuration; the run keeps its own amounts and cadence. Weekdays use JavaScript's numbering: 0 is Sunday,
// 1 is Monday.

// SEO posts on fixed weekdays; a derived channel either the day after its SEO post, or on fixed weekdays.
export type Cadence = { weekdays: number[] } | { after: number };

export const RUN_PRESETS = [
  { key: "entry", label: "Entry", seoWeekdays: [2] },
  { key: "mid", label: "Mid", seoWeekdays: [2, 4] },
  { key: "premium", label: "Premium", seoWeekdays: [1, 3, 5] },
] as const;

export type RunPresetKey = (typeof RUN_PRESETS)[number]["key"] | "custom";
export const RUN_PRESET_KEYS: [RunPresetKey, ...RunPresetKey[]] = ["entry", "mid", "premium", "custom"];

export function isRunPreset(value: unknown): value is RunPresetKey {
  return typeof value === "string" && (RUN_PRESET_KEYS as readonly string[]).includes(value);
}

export function presetLabel(key: RunPresetKey): string {
  return key === "custom" ? "Custom" : RUN_PRESETS.find((item) => item.key === key)!.label;
}

// A preset's cadence per content type: its SEO weekdays, and every derived channel the day after its SEO post.
export function presetCadence(key: RunPresetKey): Record<ContentType, Cadence> {
  const preset = RUN_PRESETS.find((item) => item.key === key) ?? RUN_PRESETS[0];
  return {
    seo: { weekdays: [...preset.seoWeekdays] },
    gmb: { after: 1 },
    linkedin: { after: 1 },
    facebook: { after: 1 },
    pinterest: { after: 1 },
  };
}

export const RUN_MONTHS = [1, 2, 3] as const;
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
