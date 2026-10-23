import { CONTENT_TYPE_KEYS, type ContentType } from "@/config/content-types";
import { isModelId } from "@/config/models";
import { RUN_MONTHS, isRunPreset, presetCadence, type Cadence, type RunPresetKey } from "@/config/run-presets";
import { defaultAmount, runEnd } from "./cadence";
import { isIsoDate } from "./dates";
import { optionalText, type FormInput } from "./validation";

// A run's configuration (Phase 2 A1, orientation Q1, Q4): reading the form, and what a preset prefills. Pure, so the
// run form previews in the browser with the same rules the server applies.

export const PRIORITY_NOTES_MAX = 2000;
export const MAX_SEO_PER_RUN = 92;

// ---- Configuration input ----

export type ChannelInput = { contentType: ContentType; amount: number; cadence: Cadence };
export type RunInput = {
  preset: RunPresetKey;
  startsOn: string;
  months: number;
  priorityNotes: string | null;
  channels: ChannelInput[];
  lengthMin: number;
  lengthMax: number;
  cta: string | null;
  faqMode: "useful" | "always" | "never";
  writerModel: string;
  criticModel: string;
};

function weekdaysOf(input: FormInput, key: string): number[] {
  const raw = input[key];
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return [...new Set(values.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
}

// Reads the run form: one row per content type, each with an amount and either weekdays or "days after its SEO post".
// A run that has already started keeps its start date when it is edited (`currentStart`).
export function parseRunInput(input: FormInput, today: string, options: { currentStart?: string } = {}): { ok: true; value: RunInput } | { ok: false; error: string } {
  const preset = String(input.preset ?? "custom");
  if (!isRunPreset(preset)) return { ok: false, error: "Choose a preset." };
  const startsOn = String(input.startsOn ?? "");
  if (!isIsoDate(startsOn)) return { ok: false, error: "Choose the run's start date." };
  if (startsOn < today && startsOn !== options.currentStart) return { ok: false, error: "Start the run today or later." };
  const months = Number(input.months);
  if (!(RUN_MONTHS as readonly number[]).includes(months)) return { ok: false, error: "A run lasts 1, 2 or 3 months." };
  const priorityNotes = optionalText(input.priorityNotes);
  if (priorityNotes && priorityNotes.length > PRIORITY_NOTES_MAX) return { ok: false, error: "Keep the priority notes under 2,000 characters." };

  const channels: ChannelInput[] = [];
  for (const contentType of CONTENT_TYPE_KEYS) {
    const amount = Number(input[`${contentType}.amount`] ?? 0);
    if (!Number.isInteger(amount) || amount < 0) return { ok: false, error: "Amounts are whole numbers, 0 or more." };
    const mode = String(input[`${contentType}.mode`] ?? (contentType === "seo" ? "weekdays" : "after"));
    let cadence: Cadence;
    if (contentType === "seo" || mode === "weekdays") {
      const weekdays = weekdaysOf(input, `${contentType}.weekdays`);
      if (amount > 0 && weekdays.length === 0) return { ok: false, error: `Choose at least one day for ${contentType === "seo" ? "SEO posts" : "each derived channel you use"}.` };
      cadence = { weekdays };
    } else {
      const after = Number(input[`${contentType}.after`] ?? 1);
      if (!Number.isInteger(after) || after < 0 || after > 14) return { ok: false, error: "Derived posts go 0 to 14 days after their SEO post." };
      cadence = { after };
    }
    channels.push({ contentType, amount, cadence });
  }
  const seo = channels.find((channel) => channel.contentType === "seo")!;
  if (seo.amount < 1) return { ok: false, error: "A run needs at least one SEO post." };
  if (seo.amount > MAX_SEO_PER_RUN) return { ok: false, error: `A run holds at most ${MAX_SEO_PER_RUN} SEO posts.` };
  // Orientation Q2: at most one derived slot per channel per SEO post.
  for (const channel of channels) {
    if (channel.contentType !== "seo" && channel.amount > seo.amount) return { ok: false, error: "A derived channel can have at most as many posts as there are SEO posts." };
  }

  const lengthMin = Number(input.lengthMin ?? 1200);
  const lengthMax = Number(input.lengthMax ?? 1600);
  if (!Number.isInteger(lengthMin) || !Number.isInteger(lengthMax) || lengthMin < 300 || lengthMax > 4000 || lengthMax < lengthMin) {
    return { ok: false, error: "Set a length between 300 and 4,000 words, the maximum at least the minimum." };
  }
  const faqMode = String(input.faqMode ?? "useful");
  if (faqMode !== "useful" && faqMode !== "always" && faqMode !== "never") return { ok: false, error: "Choose when posts get an FAQ." };
  const writerModel = String(input.writerModel ?? "");
  const criticModel = String(input.criticModel ?? "");
  if (!isModelId(writerModel) || !isModelId(criticModel)) return { ok: false, error: "Choose the writer and critic models." };
  return {
    ok: true,
    value: { preset, startsOn, months, priorityNotes, channels, lengthMin, lengthMax, cta: optionalText(input.cta), faqMode, writerModel, criticModel },
  };
}

// The configuration a preset prefills for a run starting on `startsOn` (orientation smaller decisions).
export function presetConfiguration(preset: RunPresetKey, startsOn: string, months: number): ChannelInput[] {
  const cadence = presetCadence(preset === "custom" ? "entry" : preset);
  const endsOn = runEnd(startsOn, months);
  const seoAmount = defaultAmount(cadence.seo, startsOn, endsOn, 0);
  return CONTENT_TYPE_KEYS.map((contentType) => ({
    contentType,
    cadence: cadence[contentType],
    amount: contentType === "seo" ? seoAmount : defaultAmount(cadence[contentType], startsOn, endsOn, seoAmount),
  }));
}

