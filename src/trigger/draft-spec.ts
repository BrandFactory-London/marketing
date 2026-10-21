import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { anthropicTransport } from "@/lib/ai/client";
import { draftSpec as draft, failSpec, failureMessage, isRetryable } from "@/lib/generation";

export type DraftSpecPayload = { specId: string };

// The writer model proposes one post's spec (decision 14). A failure shows on the spec card with Redraft spec.
export const draftSpec = task({
  id: "draft-spec",
  run: async (payload: DraftSpecPayload) => {
    try {
      await draft(payload.specId, { db: getDb(), transport: anthropicTransport() });
    } catch (error) {
      if (!isRetryable(error)) throw new AbortTaskRunError(failureMessage(error));
      throw error;
    }
  },
  onFailure: async ({ payload, error }) => {
    await failSpec(payload.specId, error, getDb());
  },
});
