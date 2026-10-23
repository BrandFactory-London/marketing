"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, type SelectOption } from "@/components/ui/Field";
import type { CandidateState } from "./actions";

// One rule candidate: edit the text, choose where it belongs, then Accept rule or Dismiss (decision 17). A fact from a
// regenerate note (γ6 orientation Q7) is triaged the same way, with "Add fact".
export function CandidateCard({
  kind = "rule",
  text,
  from,
  before,
  after,
  reason,
  target,
  targets,
  acceptAction,
  dismissAction,
}: {
  kind?: "rule" | "fact";
  text: string;
  from: string;
  before: string | null;
  after: string | null;
  reason: string | null;
  target: string;
  targets: SelectOption[];
  acceptAction: (state: CandidateState, formData: FormData) => Promise<CandidateState>;
  dismissAction: () => Promise<CandidateState>;
}) {
  const [state, formAction, pending] = useActionState(acceptAction, {});
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissing, startDismiss] = useTransition();
  return (
    <form action={formAction} className="app-candidate">
      <TextAreaField label={kind === "fact" ? "Proposed fact" : "Proposed rule"} name="text" defaultValue={text} rows={2} error={state.error} help={reason ?? undefined} />
      <p className="small app-muted" style={{ margin: 0 }}>
        {from}
      </p>
      {kind === "fact" && after ? (
        <p className="small" style={{ margin: 0 }}>
          Your note: <q className="app-quote">{after}</q>
        </p>
      ) : before || after ? (
        <dl className="app-facts small app-candidate-edit">
          <dt>Before</dt>
          <dd>{before || "(nothing)"}</dd>
          <dt>After</dt>
          <dd>{after || "(deleted)"}</dd>
        </dl>
      ) : null}
      <div className="app-review-buttons">
        <SelectField label="Where it belongs" name="target" defaultValue={target} options={targets} />
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || dismissing}
          onClick={() =>
            startDismiss(async () => {
              const result = await dismissAction();
              setDismissError(result.error ?? null);
            })
          }
        >
          Dismiss
        </Button>
        <Button type="submit" size="sm" disabled={pending || dismissing}>
          {kind === "fact" ? "Add fact" : "Accept rule"}
        </Button>
      </div>
      {dismissError ? (
        <p className="small app-form-error" role="alert">
          {dismissError}
        </p>
      ) : null}
    </form>
  );
}
