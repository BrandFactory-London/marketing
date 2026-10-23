"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { keepValuesOnSubmit } from "@/components/ui/keepValues";
import { Field, SelectField } from "@/components/ui/Field";
import { PACKAGES, PROJECT_STATUSES, PUBLISHING_TARGETS, packageOption } from "@/config/packages";
import type { ProjectSettingsState } from "./actions";

type Props = {
  clients: { id: string; name: string }[];
  project: { clientId: string; name: string; siteUrl: string; package: string; status: string; publishingTarget: string };
  action: (state: ProjectSettingsState, formData: FormData) => Promise<ProjectSettingsState>;
};

export function ProjectSettingsForm({ clients, project, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (key: keyof Props["project"]) => state.values?.[key] ?? project[key];
  return (
    <form action={formAction} onSubmit={keepValuesOnSubmit(formAction)} className="bfm-card app-form" noValidate aria-labelledby="project-settings">
      <h2 id="project-settings" className="heading app-section-title">
        Project settings
      </h2>
      {state.message ? (
        <p className="small app-form-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="app-form-grid">
        <Field label="Project name" name="name" defaultValue={value("name")} error={state.errors?.name} />
        <SelectField
          label="Client"
          name="clientId"
          defaultValue={value("clientId")}
          options={clients.map((client) => ({ value: client.id, label: client.name }))}
          error={state.errors?.clientId}
        />
        <SelectField
          label="Status"
          name="status"
          defaultValue={value("status")}
          options={PROJECT_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
          help="Only active projects get planned slots."
          error={state.errors?.status}
        />
        <SelectField
          label="Marketing package"
          name="package"
          defaultValue={value("package")}
          options={PACKAGES.map((item) => ({ value: item.key, label: packageOption(item.key) }))}
          help="Sets how many planned slots appear in the calendar each week."
          error={state.errors?.package}
        />
        <Field label="Website URL" name="siteUrl" defaultValue={value("siteUrl")} error={state.errors?.siteUrl} help="The sitemap is read from here." />
        <SelectField
          label="Publishing target"
          name="publishingTarget"
          defaultValue={value("publishingTarget")}
          options={PUBLISHING_TARGETS.map((item) => ({ value: item.key, label: item.label }))}
          help="Wix credentials and the author are set under Wix Blog publishing, below."
          error={state.errors?.publishingTarget}
        />
      </div>
      <div className="app-form-actions">
        {state.saved && !pending ? (
          <span className="small app-saved" role="status">
            Settings saved
          </span>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
