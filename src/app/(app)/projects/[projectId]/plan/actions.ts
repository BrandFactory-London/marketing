"use server";

import { refresh } from "next/cache";
import { syncCalendarAfter } from "@/lib/calendar-hooks";
import { londonToday } from "@/lib/dates";
import { parseRunInput } from "@/lib/run-config";
import { createRun, deleteRun, getRun, moveDerivedSlot, RunError, updateRun } from "@/lib/runs";
import { requireUser } from "@/lib/session";

export type RunFormState = { error?: string; saved?: boolean };

// The run form's fields, with the weekday chips kept as lists.
function runInput(formData: FormData): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$")) continue;
    input[key] = key.endsWith(".weekdays") ? formData.getAll(key).map(String) : String(formData.get(key) ?? "");
  }
  return input;
}

export async function saveRunAction(projectId: string, runId: string | null, _previous: RunFormState, formData: FormData): Promise<RunFormState> {
  await requireUser();
  // New and removed slots reach the calendar once the response has gone (γ8 orientation Q2).
  syncCalendarAfter("action");
  const current = runId ? await getRun(runId) : null;
  const parsed = parseRunInput(runInput(formData), londonToday(), { currentStart: current?.startsOn });
  if (!parsed.ok) return { error: parsed.error };
  try {
    if (runId) await updateRun(runId, parsed.value);
    else await createRun(projectId, parsed.value);
  } catch (error) {
    if (error instanceof RunError) return { error: error.message };
    throw error;
  }
  refresh();
  return { saved: true };
}

export async function deleteRunAction(runId: string): Promise<RunFormState> {
  await requireUser();
  syncCalendarAfter("action");
  try {
    await deleteRun(runId);
  } catch (error) {
    if (error instanceof RunError) return { error: error.message };
    throw error;
  }
  refresh();
  return { saved: true };
}

export type MoveState = { error?: string; movedTo?: string };

export async function moveDerivedAction(slotId: string, _previous: MoveState, formData: FormData): Promise<MoveState> {
  await requireUser();
  syncCalendarAfter("action");
  try {
    const slot = await moveDerivedSlot(slotId, String(formData.get("slotDate") ?? ""));
    refresh();
    return { movedTo: slot.slotDate };
  } catch (error) {
    if (error instanceof RunError) return { error: error.message };
    throw error;
  }
}
