import { DEFAULT_MODEL } from "@/config/models";
import type { RunPresetKey } from "@/config/run-presets";
import { presetConfiguration, type ChannelInput, type RunInput } from "@/lib/run-config";

// A run's configuration as the form would send it, for tests: a preset's rows unless channels are given.
export function runInput(preset: RunPresetKey, startsOn: string, months = 1, overrides: Partial<RunInput> & { channels?: ChannelInput[] } = {}): RunInput {
  return {
    preset,
    startsOn,
    months,
    priorityNotes: null,
    channels: presetConfiguration(preset === "custom" ? "mid" : preset, startsOn, months),
    lengthMin: 1200,
    lengthMax: 1600,
    cta: null,
    faqMode: "useful",
    writerModel: DEFAULT_MODEL,
    criticModel: DEFAULT_MODEL,
    ...overrides,
  };
}
