"use server";

import { refresh } from "next/cache";
import { checkAnthropicConnection } from "@/lib/jobs";
import { checkWixConnection, WixSetupError } from "@/lib/wix-credentials";
import { requireUser } from "@/lib/session";
import { syncCalendarAfter } from "@/lib/calendar-hooks";
import { CalendarSetupError, chooseCalendar, resyncCalendar } from "@/lib/calendar-sync";
import { CalendarError } from "@/lib/google-calendar";
import { GoogleReconnectRequired } from "@/lib/google-tokens";

export type AnthropicCheckState = { ok?: boolean; message?: string };

// Runs the check-anthropic task in Trigger.dev, where the key lives, and waits up to 30 seconds.
export async function checkAnthropicAction(): Promise<AnthropicCheckState> {
  await requireUser();
  try {
    const result = await checkAnthropicConnection();
    return result.ok ? { ok: true, message: `Connected. ${result.model} answered.` } : { ok: false, message: result.message };
  } catch (error) {
    console.error("Anthropic check failed to start:", error);
    return { ok: false, message: "Trigger.dev could not be reached, so the check did not run." };
  }
}

export type WixRowCheck = { ok: boolean; message: string };

// Settings > Connections: re-runs a project's Wix check (γ6 orientation Q1).
export async function checkWixRowAction(projectId: string): Promise<WixRowCheck> {
  await requireUser();
  try {
    const result = await checkWixConnection(projectId);
    refresh();
    return result;
  } catch (error) {
    if (error instanceof WixSetupError) return { ok: false, message: error.message };
    console.error("Wix check failed:", error);
    return { ok: false, message: "The check could not run. Try again in a moment." };
  }
}

// ---- Google Calendar (γ8 orientation Q1, Q2, Q4) ----

export type CalendarActionResult = { ok: boolean; message: string; remaining?: number };

export async function chooseCalendarAction(calendarId: string): Promise<CalendarActionResult> {
  const user = await requireUser();
  try {
    const chosen = await chooseCalendar(user.id, calendarId);
    // The new calendar fills straight away, after the response.
    syncCalendarAfter("action");
    refresh();
    return { ok: true, message: `Events now go to ${chosen.name}. Filling it now.` };
  } catch (error) {
    if (error instanceof CalendarSetupError || error instanceof CalendarError || error instanceof GoogleReconnectRequired) return { ok: false, message: error.message };
    throw error;
  }
}

// One resync pass. The button calls it again while anything remains (γ8 orientation Q2).
export async function syncCalendarNowAction(): Promise<CalendarActionResult> {
  await requireUser();
  const result = await resyncCalendar();
  refresh();
  if (result.skipped) return { ok: false, message: result.skipped };
  const done = [
    result.created ? `${result.created} added` : null,
    result.updated ? `${result.updated} updated` : null,
    result.deleted ? `${result.deleted} removed` : null,
  ].filter(Boolean);
  const failed = result.failed ? ` ${result.failed} could not be synced; see the error below.` : "";
  return { ok: result.failed === 0, message: `${done.length ? done.join(", ") : "Nothing to change"}.${failed}`, remaining: result.remaining };
}
