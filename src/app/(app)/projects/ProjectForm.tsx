"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { keepValuesOnSubmit } from "@/components/ui/keepValues";
import { Field, SelectField } from "@/components/ui/Field";
import { PROJECT_STATUSES, PUBLISHING_TARGETS } from "@/config/projects";
import type { ProjectFormState } from "./actions";

type Props = {
  clients: { id: string; name: string }[];
  clientId?: string;
  action: (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  onCancel: () => void;
};

// Add a project (Projects prototype). GA4 and Search Console arrive in Phase 2; the Drive folder is set
// on the project's Details tab, where it can be checked.
export function ProjectForm({ clients, clientId, action, onCancel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (key: string, fallback = "") => state.values?.[key] ?? fallback;

  if (clients.length === 0) {
    return (
      <section className="bfm-card bfm-reveal app-form">
        <h2 className="heading app-section-title">Add a project</h2>
        <p className="body app-form-note">
          Every project belongs to a client. <Link href="/crm">Add a client in the CRM</Link> first.
        </p>
      </section>
    );
  }

  return (
    <section className="bfm-card bfm-reveal">
      <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="app-form" noValidate>
        <h2 className="heading app-section-title">Add a project</h2>
        <div className="app-form-grid">
          <SelectField
            label="Client"
            name="clientId"
            defaultValue={value("clientId", clientId ?? clients[0].id)}
            options={clients.map((client) => ({ value: client.id, label: client.name }))}
            help="Client facts and voice are shared by all of a client's projects."
            error={state.errors?.clientId}
          />
          <SelectField
            label="Status"
            name="status"
            defaultValue={value("status", "active")}
            options={PROJECT_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
            help="Slots come from the project's runs: set up the first run on its Run plan tab."
            error={state.errors?.status}
          />
          <Field label="Project name" name="name" placeholder="e.g. Migss Interiors website" defaultValue={value("name")} error={state.errors?.name} />
          <Field
            label="Website URL"
            name="siteUrl"
            placeholder="https://"
            defaultValue={value("siteUrl")}
            help="The sitemap is read from here for the page list."
            error={state.errors?.siteUrl}
          />
          <SelectField
            label="Publishing target"
            name="publishingTarget"
            defaultValue={value("publishingTarget", "wix_blog")}
            options={PUBLISHING_TARGETS.map((item) => ({ value: item.key, label: item.label }))}
            error={state.errors?.publishingTarget}
          />
        </div>
        <div className="app-form-actions">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving" : "Save project"}
          </Button>
        </div>
      </form>
    </section>
  );
}
