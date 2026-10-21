import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { anthropicTransport } from "@/lib/ai/client";
import { failGeneration, failureMessage, isRetryable, runGeneration } from "@/lib/generation";

export type GeneratePostPayload = { generationId: string };

// One run per post (γ4 orientation Q6): writer, checks, critic and up to two fix rounds. A retry resumes from
// the last saved step. An error a retry cannot fix ends the run at once; either way the post goes back to
// Spec ready with the error shown as Could not finish.
export const generatePost = task({
  id: "generate-post",
  run: async (payload: GeneratePostPayload) => {
    try {
      return await runGeneration(payload.generationId, { db: getDb(), transport: anthropicTransport() });
    } catch (error) {
      if (!isRetryable(error)) throw new AbortTaskRunError(failureMessage(error));
      throw error;
    }
  },
  onFailure: async ({ payload, error }) => {
    await failGeneration(payload.generationId, error, getDb());
  },
});
