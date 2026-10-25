import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { anthropicTransport } from "@/lib/ai/client";
import { confirmAutoSpec } from "@/lib/batch-generation";
import { draftSpec, failSpec, failureMessage, isRetryable, runGeneration } from "@/lib/generation";

export type GenerateNowPayload = { specId: string };

// Generate now on one post (orientation Q7): the spec from the approved plan, then the writer loop, at once and at full
// price. Each step is saved, so a retry resumes where it stopped.
export const generateNowTask = task({
  id: "generate-now",
  run: async (payload: GenerateNowPayload) => {
    const deps = { db: getDb(), transport: anthropicTransport() };
    try {
      await draftSpec(payload.specId, deps);
      const generationId = await confirmAutoSpec(payload.specId, deps.db);
      if (!generationId) return { outcome: "spec_not_ready" };
      return { outcome: await runGeneration(generationId, deps) };
    } catch (error) {
      if (!isRetryable(error)) throw new AbortTaskRunError(failureMessage(error));
      throw error;
    }
  },
  onFailure: async ({ payload, error }) => {
    await failSpec(payload.specId, error, getDb());
  },
});
