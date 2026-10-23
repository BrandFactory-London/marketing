"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, parseClientInput, updateClient, type ClientField } from "@/lib/clients";
import { requireUser } from "@/lib/session";
import { formInput, type FieldErrors } from "@/lib/validation";
import { syncCalendarAfter } from "@/lib/calendar-hooks";

export type ClientFormState = { errors?: FieldErrors<ClientField>; message?: string; values?: Record<string, string>; saved?: boolean };

function echo(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter(([key]) => !key.startsWith("$")).map(([key, value]) => [key, String(value)]));
}

export async function createClientAction(_previous: ClientFormState, formData: FormData): Promise<ClientFormState> {
  await requireUser();
  const parsed = parseClientInput(formInput(formData));
  if (!parsed.ok) return { errors: parsed.errors, values: echo(formData) };
  const client = await createClient(parsed.value);
  redirect(`/crm/${client.id}`);
}

export async function updateClientAction(clientId: string, _previous: ClientFormState, formData: FormData): Promise<ClientFormState> {
  await requireUser();
  // The calendar follows once the response has gone (γ8 orientation Q2).
  syncCalendarAfter("action");
  const parsed = parseClientInput(formInput(formData));
  if (!parsed.ok) return { errors: parsed.errors, values: echo(formData) };
  const client = await updateClient(clientId, parsed.value);
  if (!client) return { message: "This client no longer exists.", values: echo(formData) };
  refresh();
  return { saved: true };
}
