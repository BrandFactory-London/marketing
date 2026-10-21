"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import {
  BatchError,
  confirmAllSpecs,
  confirmSpecs,
  createBatch,
  editSpec,
  getBatch,
  markNotStarted,
  markSpecNotStarted,
  parseBatchInput,
  parseSpecEdit,
  queueGenerations,
  redraftSpec,
  type BatchField,
  type SpecField,
} from "@/lib/batches";
import { startGeneration, startSpec } from "@/lib/jobs";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { formInput, optionalText, type FieldErrors } from "@/lib/validation";

const SPEC_NOT_STARTED = "Trigger.dev could not be reached, so this spec was not started. Redraft the spec to try again.";
const RUN_NOT_STARTED = "Trigger.dev could not be reached, so this post was not started. Retry the post.";

function echo(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter(([key]) => !key.startsWith("$")).map(([key, value]) => [key, String(value)]));
}

async function start(specIds: readonly string[]) {
  for (const id of specIds) {
    try {
      await startSpec(id);
    } catch (error) {
      console.error("Could not start draft-spec:", error);
      await markSpecNotStarted(id, SPEC_NOT_STARTED);
    }
  }
}

export type BatchFormState = { errors?: FieldErrors<BatchField>; message?: string; values?: Record<string, string>; chosen?: string[] };

export async function createBatchAction(projectId: string, _previous: BatchFormState, formData: FormData): Promise<BatchFormState> {
  await requireUser();
  const chosen = formData.getAll("postIds").map(String);
  const parsed = parseBatchInput(formInput(formData), chosen);
  if (!parsed.ok) return { errors: parsed.errors, values: echo(formData), chosen };
  if (!(await getProject(projectId))) return { message: "This project no longer exists.", values: echo(formData), chosen };
  let batchId: string;
  try {
    const { batch, specIds } = await createBatch(projectId, parsed.value);
    batchId = batch.id;
    await start(specIds);
  } catch (error) {
    if (error instanceof BatchError) return { message: error.message, values: echo(formData), chosen };
    throw error;
  }
  redirect(`/batches/${batchId}`);
}

export type SpecActionState = { errors?: FieldErrors<SpecField>; message?: string; saved?: boolean };

export async function editSpecAction(specId: string, _previous: SpecActionState, formData: FormData): Promise<SpecActionState> {
  await requireUser();
  const parsed = parseSpecEdit(formInput(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    await editSpec(specId, parsed.value);
  } catch (error) {
    if (error instanceof BatchError) return { message: error.message };
    throw error;
  }
  refresh();
  return { saved: true };
}

export async function redraftSpecAction(specId: string, _previous: SpecActionState, formData: FormData): Promise<SpecActionState> {
  await requireUser();
  let newId: string;
  try {
    newId = await redraftSpec(specId, optionalText(formData.get("note")));
  } catch (error) {
    if (error instanceof BatchError) return { message: error.message };
    throw error;
  }
  await start([newId]);
  refresh();
  return { saved: true };
}

export async function confirmSpecAction(specId: string): Promise<void> {
  await requireUser();
  await confirmSpecs([specId]);
  refresh();
}

export async function confirmAllAction(batchId: string): Promise<void> {
  await requireUser();
  await confirmAllSpecs(batchId);
  refresh();
}

async function startRuns(generationIds: readonly string[]) {
  for (const id of generationIds) {
    try {
      await startGeneration(id);
    } catch (error) {
      console.error("Could not start generate-post:", error);
      await markNotStarted(id, RUN_NOT_STARTED);
    }
  }
}

export async function generateBatchAction(batchId: string): Promise<void> {
  await requireUser();
  if (!(await getBatch(batchId))) return;
  await startRuns(await queueGenerations(batchId));
  redirect(`/batches/${batchId}/generating`);
}

export async function retryPostAction(batchId: string, postId: string): Promise<void> {
  await requireUser();
  await startRuns(await queueGenerations(batchId, { postId }));
  refresh();
}
