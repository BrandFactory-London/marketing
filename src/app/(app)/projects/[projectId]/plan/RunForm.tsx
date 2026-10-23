"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { CONTENT_TYPES, type ContentType } from "@/config/content-types";
import { RUN_PRESETS, RUN_MONTHS, WEEKDAY_SHORT, presetLabel, type Cadence, type RunPresetKey } from "@/config/run-presets";
import { matchingDays, placeDerived, runEnd } from "@/lib/cadence";
import { presetConfiguration, type ChannelInput } from "@/lib/run-config";
import type { RunFormState } from "./actions";

export type RunFormValues = {
  preset: RunPresetKey;
  startsOn: string;
  months: number;
  priorityNotes: string;
  channels: ChannelInput[];
  lengthMin: number;
  lengthMax: number;
  cta: string;
  faqMode: string;
  writerModel: string;
  criticModel: string;
};

type Props = {
  initial: RunFormValues;
  today: string;
  models: { value: string; label: string }[];
  submitLabel: string;
  action: (state: RunFormState, formData: FormData) => Promise<RunFormState>;
  onCancel?: () => void;
};

function longDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

// What the run will hold, worked out with the same engine the server uses (orientation Q4).
export function previewLine(startsOn: string, months: number, channels: readonly ChannelInput[]): string {
  const endsOn = runEnd(startsOn, months);
  const seo = channels.find((channel) => channel.contentType === "seo");
  const seoDays = seo && "weekdays" in seo.cadence ? matchingDays(startsOn, endsOn, seo.cadence.weekdays).slice(0, seo.amount) : [];
  const parents = seoDays.map((day, index) => ({ id: String(index), slotDate: day }));
  const parts = [`${seoDays.length} SEO ${seoDays.length === 1 ? "post" : "posts"}${seoDays.length ? ` from ${longDay(seoDays[0])} to ${longDay(seoDays.at(-1)!)}` : ""}`];
  for (const channel of channels) {
    if (channel.contentType === "seo" || channel.amount === 0) continue;
    const placed = placeDerived({ parents, cadence: channel.cadence, amount: channel.amount, startsOn, endsOn });
    parts.push(`${placed.length} ${CONTENT_TYPES[channel.contentType].short}`);
  }
  return `${parts.join("; ")}. The run ends on ${longDay(endsOn)}.`;
}

function WeekdayChips({ name, value, onChange }: { name: string; value: readonly number[]; onChange: (days: number[]) => void }) {
  // Monday first, as the calendar shows weeks.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <fieldset className="app-weekdays">
      <legend className="app-visually-hidden">Days</legend>
      {order.map((day) => (
        <label key={day} className="app-weekday">
          <input
            type="checkbox"
            name={name}
            value={day}
            checked={value.includes(day)}
            onChange={(event) => onChange(event.target.checked ? [...value, day].sort() : value.filter((item) => item !== day))}
          />
          <span>{WEEKDAY_SHORT[day]}</span>
        </label>
      ))}
    </fieldset>
  );
}

// The run configuration card (orientation, layouts proposed): preset, dates, a row per content type with its amount and
// cadence, priority notes, and the post defaults folded away. A preset only prefills; every row stays editable.
export function RunForm({ initial, today, models, submitLabel, action, onCancel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [preset, setPreset] = useState<RunPresetKey>(initial.preset);
  const [startsOn, setStartsOn] = useState(initial.startsOn);
  const [months, setMonths] = useState(initial.months);
  const [channels, setChannels] = useState<ChannelInput[]>(initial.channels);

  const refill = (nextPreset: RunPresetKey, nextStart: string, nextMonths: number) => {
    if (nextPreset !== "custom" && nextStart) setChannels(presetConfiguration(nextPreset, nextStart, nextMonths));
  };
  const setChannel = (type: ContentType, change: Partial<ChannelInput>) => {
    setPreset("custom");
    setChannels((current) => current.map((channel) => (channel.contentType === type ? { ...channel, ...change } : channel)));
  };
  const preview = useMemo(() => (startsOn ? previewLine(startsOn, months, channels) : ""), [startsOn, months, channels]);

  return (
    <form action={formAction} className="app-form app-run-form" aria-label="Run configuration">
      <div className="app-form-grid">
        <SelectField
          label="Preset"
          name="preset"
          value={preset}
          onChange={(event) => {
            const next = event.target.value as RunPresetKey;
            setPreset(next);
            refill(next, startsOn, months);
          }}
          options={[...RUN_PRESETS.map((item) => ({ value: item.key, label: item.label })), { value: "custom", label: presetLabel("custom") }]}
          help="Fills in the rows below. Change any row and the run becomes Custom."
        />
        <Field
          label="Starts on"
          name="startsOn"
          type="date"
          min={initial.startsOn < today ? initial.startsOn : today}
          value={startsOn}
          onChange={(event) => {
            setStartsOn(event.target.value);
            refill(preset, event.target.value, months);
          }}
        />
        <SelectField
          label="Length"
          name="months"
          value={String(months)}
          onChange={(event) => {
            const next = Number(event.target.value);
            setMonths(next);
            refill(preset, startsOn, next);
          }}
          options={RUN_MONTHS.map((count) => ({ value: String(count), label: `${count} ${count === 1 ? "month" : "months"}` }))}
        />
      </div>

      <div className="app-table-wrap">
        <table className="body app-table app-run-table">
          <thead>
            <tr>
              <th className="label">Content</th>
              <th className="label">How many</th>
              <th className="label">When</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => {
              const type = channel.contentType;
              const weekdays = "weekdays" in channel.cadence ? channel.cadence.weekdays : [];
              const mode = "weekdays" in channel.cadence ? "weekdays" : "after";
              return (
                <tr key={type}>
                  <td data-label="Content">{CONTENT_TYPES[type].label}</td>
                  <td data-label="How many">
                    <input
                      className="bfm-input app-amount"
                      type="number"
                      min={0}
                      name={`${type}.amount`}
                      aria-label={`How many ${CONTENT_TYPES[type].label}s`}
                      value={channel.amount}
                      onChange={(event) => setChannel(type, { amount: Math.max(0, Number(event.target.value) || 0) })}
                    />
                  </td>
                  <td data-label="When">
                    {type === "seo" ? (
                      <WeekdayChips name="seo.weekdays" value={weekdays} onChange={(days) => setChannel(type, { cadence: { weekdays: days } })} />
                    ) : (
                      <div className="app-stack" style={{ gap: 6 }}>
                        <select
                          className="bfm-input"
                          name={`${type}.mode`}
                          aria-label={`When ${CONTENT_TYPES[type].label}s go out`}
                          value={mode}
                          onChange={(event) => setChannel(type, { cadence: (event.target.value === "after" ? { after: 1 } : { weekdays: [3] }) as Cadence })}
                        >
                          <option value="after">Days after its SEO post</option>
                          <option value="weekdays">On set days</option>
                        </select>
                        {"after" in channel.cadence ? (
                          <input
                            className="bfm-input app-amount"
                            type="number"
                            min={0}
                            max={14}
                            name={`${type}.after`}
                            aria-label={`Days after its SEO post for ${CONTENT_TYPES[type].label}s`}
                            value={channel.cadence.after}
                            onChange={(event) => setChannel(type, { cadence: { after: Math.min(14, Math.max(0, Number(event.target.value) || 0)) } })}
                          />
                        ) : (
                          <WeekdayChips name={`${type}.weekdays`} value={weekdays} onChange={(days) => setChannel(type, { cadence: { weekdays: days } })} />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small app-muted" role="status" style={{ margin: 0 }}>
        {preview}
      </p>

      <TextAreaField
        label="Priority notes (optional)"
        name="priorityNotes"
        defaultValue={initial.priorityNotes}
        rows={3}
        help="What this run should push, for example a big SEO push on bathrooms. The planner reads it."
      />
      <details className="app-run-defaults">
        <summary className="small">Post defaults: length, call to action, FAQ and models</summary>
        <div className="app-form-grid">
          <Field label="Shortest post (words)" name="lengthMin" type="number" min={300} max={4000} defaultValue={initial.lengthMin} />
          <Field label="Longest post (words)" name="lengthMax" type="number" min={300} max={4000} defaultValue={initial.lengthMax} />
          <Field label="Call to action (optional)" name="cta" defaultValue={initial.cta} help="Empty uses the project's call to action." />
          <SelectField
            label="FAQ block"
            name="faqMode"
            defaultValue={initial.faqMode}
            options={[
              { value: "useful", label: "Only where useful" },
              { value: "always", label: "Always" },
              { value: "never", label: "Never" },
            ]}
          />
          <SelectField label="Writer model" name="writerModel" defaultValue={initial.writerModel} options={models} />
          <SelectField label="Critic model" name="criticModel" defaultValue={initial.criticModel} options={models} />
        </div>
      </details>
      {state.error ? (
        <p className="small app-form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="app-form-actions">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
