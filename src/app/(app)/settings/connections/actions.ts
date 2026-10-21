"use server";

import { checkAnthropicConnection } from "@/lib/jobs";
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
