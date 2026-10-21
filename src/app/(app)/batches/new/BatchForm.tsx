"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField, type SelectOption } from "@/components/ui/Field";
import { keepValuesOnSubmit } from "@/components/ui/keepValues";
import type { BatchFormState } from "../actions";

type Props = {
  projectChoice: ReactNode;
  defaults: { name: string; lengthMin: number; lengthMax: number; cta: string; writerModel: string; criticModel: string };
  slots: { id: string; date: string; topic: string; pillarId: string | null; chosen: boolean }[];
  pillars: SelectOption[];
  models: SelectOption[];
  faqModes: readonly SelectOption[];
  action: (state: BatchFormState, formData: FormData) => Promise<BatchFormState>;
};

// The batch form (γ4 orientation Q3): batch-wide choices, then the posts. The writer proposes each post's
// keyword, type, location, angle and outline in the spec, which comes next.
export function BatchForm({ projectChoice, defaults, slots, pillars, models, faqModes, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (name: string, fallback: string | number) => state.values?.[name] ?? String(fallback);
  const chosen = (id: string, fallback: boolean) => (state.chosen ? state.chosen.includes(id) : fallback);
  const pillarOptions = [{ value: "", label: "No pillar" }, ...pillars];
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="app-stack" noValidate>
      {state.message ? (
        <p className="small app-form-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <section className="bfm-card app-form" aria-labelledby="batch-settings">
        <div>
          <h2 id="batch-settings" className="heading app-section-title">
            Batch settings
          </h2>
          <p className="small app-section-text">These apply to every post unless a post overrides them below.</p>
        </div>
        <div className="app-form-grid">
          {projectChoice}
          <Field label="Batch name" name="name" defaultValue={value("name", defaults.name)} error={state.errors?.name} />
          <div className={["bfm-field", state.errors?.length ? "bfm-field-error" : ""].filter(Boolean).join(" ")}>
            <span className="bfm-label" id="length-label">
              Length (words)
            </span>
            <div className="app-row app-length">
              <input
                className="bfm-input"
                name="lengthMin"
                inputMode="numeric"
                aria-label="Fewest words"
                defaultValue={value("lengthMin", defaults.lengthMin)}
              />
              <span className="small">to</span>
              <input
                className="bfm-input"
                name="lengthMax"
                inputMode="numeric"
                aria-label="Most words"
                defaultValue={value("lengthMax", defaults.lengthMax)}
              />
            </div>
            {state.errors?.length ? <span className="bfm-help">{state.errors.length}</span> : null}
          </div>
          <Field
            label="Call to action"
            name="cta"
            defaultValue={value("cta", defaults.cta)}
            help="From the project's knowledge. Change it for this batch only."
            error={state.errors?.cta}
          />
          <SelectField label="FAQ block" name="faqMode" defaultValue={value("faqMode", "useful")} options={faqModes} error={state.errors?.faqMode} />
          <SelectField
            label="Pillar"
            name="defaultPillarId"
            defaultValue={value("defaultPillarId", "")}
            options={pillarOptions}
            help={pillars.length === 0 ? "Add pillar tags in the project's Settings." : "Each post can override it below."}
            error={state.errors?.defaultPillarId}
          />
        </div>
        <TextAreaField label="Notes for the writer" name="notes" rows={3} defaultValue={value("notes", "")} error={state.errors?.notes} />
      </section>

      <section className="bfm-card app-form" aria-labelledby="batch-models">
        <h2 id="batch-models" className="heading app-section-title">
          AI models
        </h2>
        <div className="app-form-grid">
          <SelectField
            label="Writer model"
            name="writerModel"
            defaultValue={value("writerModel", defaults.writerModel)}
            options={models}
            help="Drafts each spec and post."
            error={state.errors?.writerModel}
          />
          <SelectField
            label="Critic model"
            name="criticModel"
            defaultValue={value("criticModel", defaults.criticModel)}
            options={models}
            help="Checks each draft against the knowledge pack."
            error={state.errors?.criticModel}
          />
        </div>
      </section>

      <section className="bfm-card app-form" aria-labelledby="batch-posts">
        <div>
          <h2 id="batch-posts" className="heading app-section-title">
            Posts ({slots.length})
          </h2>
          <p className="small app-section-text">Slots with a topic that are not in another batch.</p>
        </div>
        {state.errors?.posts ? (
          <p className="small app-form-error" role="alert">
            {state.errors.posts}
          </p>
        ) : null}
        <ul className="app-batch-posts">
          {slots.map((slot) => (
            <li key={slot.id} className="app-batch-post">
              <label className="app-check">
                <input type="checkbox" name="postIds" value={slot.id} defaultChecked={chosen(slot.id, slot.chosen)} />
                <span>
                  <span className="body">{slot.topic}</span>
                  <span className="small app-muted"> · {slot.date}</span>
                </span>
              </label>
              <div className="app-form-grid">
                <SelectField
                  label="Pillar for this post"
                  name={`pillar_${slot.id}`}
                  defaultValue={value(`pillar_${slot.id}`, slot.pillarId ?? "")}
                  options={[{ value: "", label: "Batch pillar" }, ...pillars]}
                />
                <Field label="Note for this post" name={`note_${slot.id}`} defaultValue={value(`note_${slot.id}`, "")} placeholder="Optional" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="app-form-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Drafting" : "Draft the specs"}
        </Button>
      </div>
    </form>
  );
}
