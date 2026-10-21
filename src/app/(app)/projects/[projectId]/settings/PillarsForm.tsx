"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { PillarState } from "./actions";

type Props = {
  pillars: { id: string; label: string; slug: string }[];
  action: (state: PillarState, formData: FormData) => Promise<PillarState>;
  removeAction: (pillarId: string) => Promise<void>;
};

// The project's pillar tags (γ4 orientation Q3). Each batch picks a default and each post can override it.
export function PillarsForm({ pillars, action, removeAction }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="bfm-card app-form" aria-labelledby="pillars-heading">
      <div>
        <h2 id="pillars-heading" className="heading app-section-title">
          Pillar tags
        </h2>
        <p className="small app-section-text">Each post carries one pillar. The tag is the Wix Blog tag the post publishes with.</p>
      </div>
      {pillars.length > 0 ? (
        <ul className="app-pillars">
          {pillars.map((pillar) => (
            <li key={pillar.id} className="app-row">
              <span className="body">
                {pillar.label} <span className="small app-muted">{pillar.slug}</span>
              </span>
              <form action={removeAction.bind(null, pillar.id)}>
                <Button type="submit" variant="ghost" size="sm" aria-label={`Remove pillar ${pillar.label}`}>
                  Remove pillar
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="body app-muted" style={{ margin: 0 }}>
          No pillars yet.
        </p>
      )}
      {/* No selects here, so React may reset the form after a save; an error brings the values back. */}
      <form action={formAction} className="app-form" noValidate>
        <div className="app-form-grid">
          <Field label="Pillar name" name="label" defaultValue={state.values?.label ?? ""} placeholder="e.g. Bathroom Renovation" error={state.errors?.label} />
          <Field
            label="Tag"
            name="slug"
            defaultValue={state.values?.slug ?? ""}
            placeholder="e.g. bathroom-renovation"
            help="Leave empty to make it from the name."
            error={state.errors?.slug}
          />
        </div>
        <div className="app-form-actions">
          {state.added && !pending ? (
            <span className="small app-saved" role="status">
              Pillar added: {state.added}
            </span>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Adding" : "Add pillar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
