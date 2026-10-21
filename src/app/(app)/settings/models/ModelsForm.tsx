"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { keepValuesOnSubmit } from "@/components/ui/keepValues";
import { MODELS } from "@/config/models";
import type { ModelSettings } from "@/lib/settings";
import { saveModelsAction } from "./actions";

const options = MODELS.map((model) => ({ value: model.id, label: model.label }));

export function ModelsForm({ current }: { current: ModelSettings }) {
  const [state, formAction, pending] = useActionState(saveModelsAction, {});
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="bfm-card app-form" aria-labelledby="models-heading">
      <h2 id="models-heading" className="heading app-section-title">
        AI models
      </h2>
      {state.error ? (
        <p className="small app-form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="app-form-grid">
        <SelectField label="Writer" name="writerModel" defaultValue={current.writerModel} options={options} help="Drafts each SEO post." />
        <SelectField label="Critic" name="criticModel" defaultValue={current.criticModel} options={options} help="Checks drafts against the rules and knowledge." />
        <SelectField label="Derivatives" name="derivativeModel" defaultValue={current.derivativeModel} options={options} help="Writes the GMB and LinkedIn versions." />
      </div>
      <p className="small app-form-note">
        Opus 5.5 is the default for all three, chosen after the model test. Each batch can override these. A post that fails the critic twice
        comes to you flagged.
      </p>
      <div className="app-form-actions">
        {state.saved && !pending ? (
          <span className="small app-saved" role="status">
            Models saved
          </span>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save models"}
        </Button>
      </div>
    </form>
  );
}
