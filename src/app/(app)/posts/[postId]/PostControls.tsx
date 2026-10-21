"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField, type SelectOption } from "@/components/ui/Field";
import type { DetailsState, ReviewActionResult } from "./actions";

// Slug and pillar tag, ready for γ6's publish (γ5 orientation, item 9). The slug starts from the title.
export function DetailsForm({
  action,
  slug,
  slugSaved,
  pillarId,
  pillars,
  locked,
}: {
  action: (state: DetailsState, formData: FormData) => Promise<DetailsState>;
  slug: string;
  slugSaved: boolean;
  pillarId: string | null;
  pillars: SelectOption[];
  locked: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="app-stack">
      <Field
        label="Slug"
        name="slug"
        defaultValue={slug}
        disabled={locked}
        error={state.error}
        help={slugSaved ? "The address of the post on the client's blog." : "Suggested from the title. Saved when you save these details or approve the post."}
      />
      <SelectField
        label="Pillar tag"
        name="pillarId"
        defaultValue={pillarId ?? ""}
        disabled={locked}
        options={[{ value: "", label: "None" }, ...pillars]}
        help="Places the post on the matching resources page."
      />
      {!locked ? (
        <div className="app-review-buttons">
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            Save details
          </Button>
        </div>
      ) : null}
      {state.message ? (
        <p className="small app-text-success" role="status" style={{ margin: 0 }}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

// Reopen for editing (orientation approval): only before the post is published.
export function ReopenButton({ action }: { action: () => Promise<ReviewActionResult> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="app-stack" style={{ alignItems: "end" }}>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action();
            setError(result.ok ? null : result.message);
          })
        }
      >
        Reopen for editing
      </Button>
      {error ? (
        <p className="small app-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// Regenerate with a note from a post that is not open in the editor, such as a rejected one (γ5 orientation Q4).
export function RegenerateForm({ action }: { action: (note: string, input: null) => Promise<ReviewActionResult> }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="app-stack">
      <TextAreaField
        label="Regenerate with a note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        help="The writer starts from the current text and your note, then the checks and the critic run again. About $0.15 to $0.70."
      />
      <div className="app-review-buttons">
        <Button
          variant="secondary"
          disabled={pending || !note.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await action(note, null);
              setError(result.ok ? null : result.message);
            })
          }
        >
          Regenerate post
        </Button>
      </div>
      {error ? (
        <p className="small app-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StopWaitingButton({ action }: { action: () => Promise<ReviewActionResult> }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="app-review-buttons">
      <Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => void (await action()))}>
        Stop waiting
      </Button>
    </div>
  );
}
