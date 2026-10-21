import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { anthropicTransport } from "@/lib/ai/client";
import { failureMessage, isRetryable } from "@/lib/generation";
import { proposeRuleCandidates } from "@/lib/rules";

export type ProposeRulesPayload = { reviewEventId: string };

// After an approval with edits, Claude proposes rule candidates from the diff (decision 17). The approval is
// already saved, so a failure here only means no candidates; it never touches the post.
export const proposeRules = task({
  id: "propose-rules",
  run: async (payload: ProposeRulesPayload) => {
    try {
      return { candidates: await proposeRuleCandidates(payload.reviewEventId, { db: getDb(), transport: anthropicTransport() }) };
    } catch (error) {
      if (!isRetryable(error)) throw new AbortTaskRunError(failureMessage(error));
      throw error;
    }
  },
});
