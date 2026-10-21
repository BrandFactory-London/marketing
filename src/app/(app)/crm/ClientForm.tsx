"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { keepValuesOnSubmit } from "@/components/ui/keepValues";
import { Field } from "@/components/ui/Field";
import type { ClientFormState } from "./actions";

type ClientValues = { name: string; mainContact: string; email: string; phone: string };

type Props = {
  title: string;
  submitLabel: string;
  action: (state: ClientFormState, formData: FormData) => Promise<ClientFormState>;
  initial?: Partial<ClientValues>;
  onDone: () => void;
};

export function ClientForm({ title, submitLabel, action, initial = {}, onDone }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state.saved) onDone();
  }, [state, onDone]);
  const value = (key: keyof ClientValues) => state.values?.[key] ?? initial[key] ?? "";

  return (
    <section className="bfm-card bfm-reveal">
      <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="app-form" noValidate>
        <h2 className="heading app-section-title">{title}</h2>
        {state.message ? (
          <p className="small app-form-error" role="alert">
            {state.message}
          </p>
        ) : null}
        <div className="app-form-grid">
          <Field label="Client name" name="name" placeholder="Business name" defaultValue={value("name")} error={state.errors?.name} required />
          <Field label="Main contact" name="mainContact" placeholder="Name" defaultValue={value("mainContact")} />
          <Field label="Email" name="email" type="email" placeholder="name@business.com" defaultValue={value("email")} error={state.errors?.email} />
          <Field label="Phone" name="phone" type="tel" placeholder="Number" defaultValue={value("phone")} />
        </div>
        <div className="app-form-actions">
          <Button variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving" : submitLabel}
          </Button>
        </div>
      </form>
    </section>
  );
}
