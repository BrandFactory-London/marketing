import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { anthropicTransport } from "@/lib/ai/client";
import { proposeFacts } from "@/lib/facts";
import { failureMessage, isRetryable } from "@/lib/generation";

export type ProposeFactsPayload = { reviewEventId: string };

// After a regenerate with a note, Claude proposes any new fact the note states (γ6 orientation Q7). It runs beside the
// regenerate and never touches it; a failure only means no suggestions.
export const proposeFactsTask = task({
  id: "propose-facts",
  run: async (payload: ProposeFactsPayload) => {
    try {
      return { facts: await proposeFacts(payload.reviewEventId, { db: getDb(), transport: anthropicTransport() }) };
    } catch (error) {
      if (!isRetryable(error)) throw new AbortTaskRunError(failureMessage(error));
      throw error;
    }
  },
});
