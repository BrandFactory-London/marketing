"use server";

import { refresh } from "next/cache";
import { checkAnthropicConnection } from "@/lib/jobs";
import { checkWixConnection, WixSetupError } from "@/lib/wix-credentials";
import { requireUser } from "@/lib/session";

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
