"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { keepValuesOnSubmit } from "@/components/ui/keepValues";
import { deleteRunAction, moveDerivedAction, type MoveState, type RunFormState } from "./actions";
import { RunForm, type RunFormValues } from "./RunForm";

type FormProps = {
  initial: RunFormValues;
  today: string;
  models: { value: string; label: string }[];
  action: (state: RunFormState, formData: FormData) => Promise<RunFormState>;
};

// "Edit run" and "Set up the next run": a button that opens the run form in place, closed again once it saves.
export function RunFormToggle({ openLabel, submitLabel, variant = "secondary", ...form }: FormProps & { openLabel: string; submitLabel: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div>
        <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
          {openLabel}
        </Button>
      </div>
    );
  }
  const action = async (state: RunFormState, formData: FormData) => {
    const result = await form.action(state, formData);
    if (result.saved) setOpen(false);
    return result;
  };
  return <RunForm {...form} action={action} submitLabel={submitLabel} onCancel={() => setOpen(false)} />;
}

export function DeleteRunButton({ runId, name }: { runId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="app-stack" style={{ gap: 4 }}>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete ${name} and its empty slots?`)) return;
          start(async () => {
            const result = await deleteRunAction(runId);
            setError(result.error ?? null);
          });
        }}
      >
        {pending ? "Deleting" : "Delete run"}
      </Button>
      {error ? (
        <p className="small app-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// A derived slot's date (orientation Q4): on or after its SEO post, inside the run.
export function DerivedMoveForm({ slotId, slotDate, min, max, label }: { slotId: string; slotDate: string; min: string; max: string; label: string }) {
  const [state, action, pending] = useActionState(moveDerivedAction.bind(null, slotId), {} as MoveState);
  return (
    <form action={action} onSubmit={keepValuesOnSubmit(action)} className="app-form" noValidate>
      <Field label={`Date for the ${label}`} name="slotDate" type="date" min={min} max={max} defaultValue={state.movedTo ?? slotDate} error={state.error} />
      <div className="app-form-actions">
        {state.movedTo && !pending ? (
          <span className="small app-saved" role="status">
            Date saved
          </span>
        ) : null}
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Saving" : "Move slot"}
        </Button>
      </div>
    </form>
  );
}
