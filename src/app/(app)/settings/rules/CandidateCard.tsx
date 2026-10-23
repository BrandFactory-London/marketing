"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, type SelectOption } from "@/components/ui/Field";
import type { CandidateState } from "./actions";

// One rule candidate: edit the text, choose where it belongs and which channels it applies to, then Accept rule or
// Dismiss (decision 17, γ7 handoff item 5). A fact (γ6 orientation Q7) is triaged the same way, with "Add fact", and
// always applies to every channel.
export function CandidateCard({
  kind = "rule",
  text,
  from,
  channel,
  scope,
  scopes,
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
  // The derivative it came from, or null for the blog post.
  channel: string | null;
  scope: string;
  scopes: SelectOption[];
  before: string | null;
  after: string | null;
  reason: string | null;
  target: string;
  targets: (SelectOption & { scoped: boolean })[];
  acceptAction: (state: CandidateState, formData: FormData) => Promise<CandidateState>;
  dismissAction: () => Promise<CandidateState>;
}) {
  const [state, formAction, pending] = useActionState(acceptAction, {});
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissing, startDismiss] = useTransition();
  const [chosen, setChosen] = useState(target);
  const scoped = kind === "rule" && Boolean(targets.find((item) => item.value === chosen)?.scoped);
  return (
    <form action={formAction} className="app-candidate">
      <TextAreaField label={kind === "fact" ? "Proposed fact" : "Proposed rule"} name="text" defaultValue={text} rows={2} error={state.error} help={reason ?? undefined} />
      <p className="small app-muted app-card-head" style={{ margin: 0, justifyContent: "flex-start" }}>
        {channel ? <Badge tone="brand">{channel}</Badge> : null}
        <span>{from}</span>
      </p>
      {!before && after ? (
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
        <SelectField label="Where it belongs" name="target" value={chosen} onChange={(event) => setChosen(event.target.value)} options={targets} />
        <SelectField
          key={scoped ? "scoped" : "all"}
          label="Applies to"
          name="scope"
          defaultValue={scoped ? scope : "all"}
          disabled={!scoped}
          options={scoped ? scopes : scopes.filter((item) => item.value === "all")}
          help={scoped ? undefined : kind === "fact" ? "Facts apply to every channel." : "Only writing rules and voice can apply to one channel."}
        />
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
