import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { anthropicTransport } from "@/lib/ai/client";
import { failureMessage, isRetryable } from "@/lib/generation";
import { proposeCandidates, type CandidateSource } from "@/lib/learn";

export type ProposeCandidatesPayload = CandidateSource;

// After any note or edit from Amir, on the blog post or a derivative, Claude proposes rules and facts from it (γ7
// orientation Q2). The feedback is already saved, so a failure here only means no candidates; it never touches the post.
export const proposeCandidatesTask = task({
  id: "propose-candidates",
  run: async (payload: ProposeCandidatesPayload) => {
    try {
      return { candidates: await proposeCandidates(payload, { db: getDb(), transport: anthropicTransport() }) };
    } catch (error) {
      if (!isRetryable(error)) throw new AbortTaskRunError(failureMessage(error));
      throw error;
    }
  },
});
