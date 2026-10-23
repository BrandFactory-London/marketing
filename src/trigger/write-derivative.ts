import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { anthropicTransport } from "@/lib/ai/client";
import { failDerivative, writeDerivative } from "@/lib/derivatives";
import { failureMessage, isRetryable } from "@/lib/generation";

export type WriteDerivativePayload = { derivativeId: string };

// Derivative copy from an approved post (design decision 20, γ6 orientation Q6, γ7 orientation Q5). A failure leaves the version
// marked failed with its reason; Regenerate starts another.
export const writeDerivativeTask = task({
  id: "write-derivative",
  run: async (payload: WriteDerivativePayload) => {
    try {
      return { checks: await writeDerivative(payload.derivativeId, { db: getDb(), transport: anthropicTransport() }) };
    } catch (error) {
      if (!isRetryable(error)) throw new AbortTaskRunError(failureMessage(error));
      throw error;
    }
  },
  onFailure: async ({ payload, error }) => {
    await failDerivative(payload.derivativeId, error, getDb());
  },
});
