"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { keepValuesOnSubmit } from "@/components/ui/keepValues";
import { SPEC_LINES } from "@/config/post-status";
import { SPEC_FROM_PLAN } from "@/config/run-status";
import type { SpecStatus } from "@/db/schema";
import type { SpecActionState } from "../actions";

type SpecView = {
  status: SpecStatus;
  version: number;
  keyword: string | null;
  postType: string | null;
  location: string | null;
  angle: string | null;
  outline: string[];
  facts: string[];
  links: string[];
  faq: boolean | null;
  lengthMin: number;
  lengthMax: number;
  cta: string;
  error: string | null;
  // Phase 2 A4: drafted from the approved plan and confirmed with no step from Amir.
  auto?: boolean;
};

type Props = {
  number: number;
  topic: string;
  date: string;
  pillar: string | null;
  // The post is being written or is past writing, so its spec can no longer change.
  locked: boolean;
  spec: SpecView;
  editAction: (state: SpecActionState, formData: FormData) => Promise<SpecActionState>;
  redraftAction: (state: SpecActionState, formData: FormData) => Promise<SpecActionState>;
  confirmAction: () => Promise<void>;
};

// One post's spec on the batch page: read it, edit it, redraft it with a note, or confirm it (decision 14).
export function SpecCard({ number, topic, date, pillar, locked, spec, editAction, redraftAction, confirmAction }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "redraft">("view");
  const line = SPEC_LINES[spec.status];
  const ready = spec.status === "proposed" || spec.status === "confirmed";
  return (
    <section className="bfm-card app-spec" aria-labelledby={`spec-${number}`}>
      <div className="app-card-head">
        <div>
          <p className="label app-muted" style={{ margin: 0 }}>
            Post {number}
            {spec.postType ? ` · ${spec.postType}` : ""} · {date}
          </p>
          <h2 id={`spec-${number}`} className="heading" style={{ margin: "4px 0 0" }}>
            {topic}
          </h2>
          {spec.auto ? (
            <p className="small app-muted" style={{ margin: "4px 0 0" }}>
              {SPEC_FROM_PLAN}
            </p>
          ) : null}
          {ready ? (
            <p className="small app-muted" style={{ margin: "4px 0 0" }}>
              Keyword: {spec.keyword} · {spec.lengthMin} to {spec.lengthMax} words · FAQ: {spec.faq ? "yes" : "no"}
              {spec.location ? ` · ${spec.location}` : ""}
              {pillar ? ` · ${pillar}` : ""}
            </p>
          ) : null}
        </div>
        <Badge tone={line.tone}>{line.label}</Badge>
      </div>

      {spec.status === "drafting" ? (
        <p className="body app-muted">The writer is drafting this spec. It appears here when it is ready, usually within a minute or two.</p>
      ) : null}
      {spec.status === "failed" ? (
        <p className="small app-form-error" role="alert">
          {spec.error ?? "The spec could not be drafted."}
        </p>
      ) : null}

      {ready && mode === "view" ? <SpecBody spec={spec} /> : null}
      {ready && mode === "edit" ? <SpecEditForm spec={spec} action={editAction} onDone={() => setMode("view")} /> : null}
      {mode === "redraft" ? <RedraftForm action={redraftAction} onDone={() => setMode("view")} /> : null}

      {locked || spec.status === "drafting" || mode !== "view" ? null : (
        <div className="app-form-actions">
          {ready ? (
            <Button variant="secondary" onClick={() => setMode("edit")}>
              Edit spec
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setMode("redraft")}>
            {spec.status === "failed" ? "Redraft spec" : "Redraft with a note"}
          </Button>
          {spec.status === "proposed" ? (
            <form action={confirmAction}>
              <Button type="submit">Confirm spec</Button>
            </form>
          ) : null}
        </div>
      )}
    </section>
  );
}

function SpecBody({ spec }: { spec: SpecView }) {
  return (
    <div className="app-spec-body">
      <div>
        <p className="label app-muted">Angle</p>
        <p className="body">{spec.angle}</p>
      </div>
      <div>
        <p className="label app-muted">Outline</p>
        <ol className="body">
          {spec.outline.map((heading, index) => (
            <li key={`${index}-${heading}`}>{heading}</li>
          ))}
        </ol>
      </div>
      <div>
        <p className="label app-muted">Facts from the pack</p>
        {spec.facts.length > 0 ? (
          <ul className="body">
            {spec.facts.map((fact, index) => (
              <li key={`${index}-${fact}`}>{fact}</li>
            ))}
          </ul>
        ) : (
          <p className="body app-muted">None chosen.</p>
        )}
      </div>
      <div>
        <p className="label app-muted">Internal links</p>
        <p className="body">{spec.links.length > 0 ? spec.links.join(", ") : "None chosen."}</p>
      </div>
    </div>
  );
}

function SpecEditForm({ spec, action, onDone }: { spec: SpecView; action: Props["editAction"]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (previous: SpecActionState, formData: FormData) => {
    const next = await action(previous, formData);
    if (next.saved) onDone();
    return next;
  }, {});
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="app-form" noValidate>
      {state.message ? (
        <p className="small app-form-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="app-form-grid">
        <Field label="Primary keyword" name="keyword" defaultValue={spec.keyword ?? ""} error={state.errors?.keyword} />
        <Field label="Post type" name="postType" defaultValue={spec.postType ?? ""} error={state.errors?.postType} />
        <Field label="Location" name="location" defaultValue={spec.location ?? ""} placeholder="Optional" />
        <SelectField
          label="FAQ section"
          name="faq"
          defaultValue={spec.faq ? "yes" : "no"}
          options={[
            { value: "yes", label: "Include an FAQ" },
            { value: "no", label: "No FAQ" },
          ]}
        />
      </div>
      <TextAreaField label="Angle and opening" name="angle" rows={3} defaultValue={spec.angle ?? ""} error={state.errors?.angle} />
      <TextAreaField label="Outline" name="outline" rows={6} defaultValue={spec.outline.join("\n")} help="One H2 heading per line." error={state.errors?.outline} />
      <TextAreaField label="Facts from the pack" name="facts" rows={4} defaultValue={spec.facts.join("\n")} help="One per line." />
      <TextAreaField label="Internal links" name="links" rows={3} defaultValue={spec.links.join("\n")} help="One path per line, such as /contact." error={state.errors?.links} />
      <p className="small app-form-note">Saving puts the spec back to be confirmed.</p>
      <div className="app-form-actions">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save spec"}
        </Button>
      </div>
    </form>
  );
}

function RedraftForm({ action, onDone }: { action: Props["redraftAction"]; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (previous: SpecActionState, formData: FormData) => {
    const next = await action(previous, formData);
    if (next.saved) onDone();
    return next;
  }, {});
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="app-form" noValidate>
      {state.message ? (
        <p className="small app-form-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <TextAreaField label="Note for the writer" name="note" rows={3} placeholder="e.g. Focus on Loughton, and lead with the price range." />
      <div className="app-form-actions">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending" : "Redraft spec"}
        </Button>
      </div>
    </form>
  );
}
