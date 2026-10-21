"use server";

import { redirect } from "next/navigation";
import { createProject, parseProjectInput, UnknownClient, type ProjectField } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { formInput, type FieldErrors } from "@/lib/validation";

export type ProjectFormState = { errors?: FieldErrors<ProjectField>; message?: string; values?: Record<string, string> };

function echo(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter(([key]) => !key.startsWith("$")).map(([key, value]) => [key, String(value)]));
}

export async function createProjectAction(_previous: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  await requireUser();
  const parsed = parseProjectInput(formInput(formData));
  if (!parsed.ok) return { errors: parsed.errors, values: echo(formData) };
  let projectId: string;
  try {
    projectId = (await createProject(parsed.value)).id;
  } catch (error) {
    if (error instanceof UnknownClient) return { errors: { clientId: error.message }, values: echo(formData) };
    throw error;
  }
  redirect(`/projects/${projectId}`);
}
