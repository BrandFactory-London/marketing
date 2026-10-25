import { AbortTaskRunError, task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { anthropicTransport } from "@/lib/ai/client";
import { failureMessage, isRetryable } from "@/lib/generation";
import { draftPlan, failPlanDraft } from "@/lib/planner";

export type DraftPlanPayload = { planDraftId: string };

// The planner (Phase 2 A3, orientation Q5): the whole plan for a run, or one item again. A failure shows on the Run
// plan tab with the reason; Amir asks again.
export const draftPlanTask = task({
  id: "draft-plan",
  run: async (payload: DraftPlanPayload) => {
    try {
      return { items: await draftPlan(payload.planDraftId, { db: getDb(), transport: anthropicTransport() }) };
    } catch (error) {
      if (!isRetryable(error)) throw new AbortTaskRunError(failureMessage(error));
      throw error;
    }
  },
  onFailure: async ({ payload, error }) => {
    await failPlanDraft(payload.planDraftId, error, getDb());
  },
});
