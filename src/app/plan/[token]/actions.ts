"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { startCandidates } from "@/lib/jobs";
import { ShareError, submitFeedback } from "@/lib/plan-share";

export type ClientFormState = { error?: string; sent?: "comment" | "suggest" | "approve" };

// The client's comment, suggestion or approval through the plan link (Phase 2 A3, orientation Q6). Public: the token
// is the only key, checked in submitFeedback. Comments and suggestions start a suggestion run for Amir in Settings.
export async function sendFeedbackAction(token: string, itemId: string | null, _previous: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const list = await headers();
  const ip = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || null;
  try {
    const result = await submitFeedback(
      token,
      { kind: formData.get("kind"), itemId, name: formData.get("name"), body: formData.get("body"), website: formData.get("website") },
      ip,
    );
    if (result.feedbackId && result.kind !== "approve") {
      try {
        await startCandidates({ planFeedbackId: result.feedbackId });
      } catch (error) {
        // The message is saved either way; only the suggestion run is missed.
        console.error("Could not start propose-candidates for client feedback:", error);
      }
    }
    refresh();
    return { sent: result.kind };
  } catch (error) {
    if (error instanceof ShareError) return { error: error.message };
    throw error;
  }
}
