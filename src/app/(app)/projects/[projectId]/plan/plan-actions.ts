"use server";

import { refresh } from "next/cache";
import { syncCalendarAfter } from "@/lib/calendar-hooks";
import { startCandidates, startPlanDraft } from "@/lib/jobs";
import { createShare, revokeShares, ShareError } from "@/lib/plan-share";
import { activateRun, approvePlan, failPlanDraft, PlanError, requestItem, requestPlan, setPlanDraftRun, type PlanRequest } from "@/lib/planner";
import { requireUser } from "@/lib/session";

// The planner's actions on the Run plan tab (Phase 2 A3). Each request is saved first, then the draft-plan run starts;
// if Trigger.dev cannot be reached, the draft is marked failed with that reason so the tab never waits forever.

export type PlanActionState = { error?: string; message?: string; link?: string };

const RUN_NOT_REACHED = "Trigger.dev could not be reached, so the plan was not drafted. Try again.";

async function start(request: PlanRequest): Promise<PlanActionState> {
  try {
    await setPlanDraftRun(request.planDraftId, await startPlanDraft(request.planDraftId));
  } catch (error) {
    console.error("Could not start draft-plan:", error);
    await failPlanDraft(request.planDraftId, new Error(RUN_NOT_REACHED));
    return { error: RUN_NOT_REACHED };
  }
  // A note is feedback like any other: the learning loop reads it (orientation Q5).
  if (request.noteFeedbackId) {
    try {
      await startCandidates({ planFeedbackId: request.noteFeedbackId });
    } catch (error) {
      console.error("Could not start propose-candidates for a plan note:", error);
    }
  }
  return { message: "Drafting the plan." };
}

function failure(error: unknown): PlanActionState {
  if (error instanceof PlanError || error instanceof ShareError) return { error: error.message };
  throw error;
}

export async function planRunAction(runId: string, _previous: PlanActionState, formData: FormData): Promise<PlanActionState> {
  await requireUser();
  let request: PlanRequest;
  try {
    request = await requestPlan(runId, { note: formData.get("note") });
  } catch (error) {
    return failure(error);
  }
  const result = await start(request);
  refresh();
  return result;
}

export async function regenerateItemAction(runId: string, postId: string, _previous: PlanActionState, formData: FormData): Promise<PlanActionState> {
  await requireUser();
  let request: PlanRequest;
  try {
    request = await requestItem(runId, postId, { note: formData.get("note") });
  } catch (error) {
    return failure(error);
  }
  const result = await start(request);
  refresh();
  return result;
}

export async function approvePlanAction(runId: string): Promise<PlanActionState> {
  await requireUser();
  // Each approved title becomes its post's topic, so the calendar events change.
  syncCalendarAfter("action");
  try {
    const count = await approvePlan(runId);
    refresh();
    return { message: `Plan approved. ${count} ${count === 1 ? "post has" : "posts have"} a topic.` };
  } catch (error) {
    return failure(error);
  }
}

export async function activateRunAction(runId: string): Promise<PlanActionState> {
  await requireUser();
  try {
    await activateRun(runId);
    refresh();
    return { message: "Run active." };
  } catch (error) {
    return failure(error);
  }
}

export async function shareAction(runId: string, origin: string): Promise<PlanActionState> {
  await requireUser();
  try {
    const { token } = await createShare(runId);
    refresh();
    return { link: `${origin.replace(/\/+$/, "")}/plan/${token}` };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeShareAction(runId: string): Promise<PlanActionState> {
  await requireUser();
  await revokeShares(runId);
  refresh();
  return { message: "Link turned off." };
}
