"use server";

import { refresh } from "next/cache";
import type { CheckResult } from "@/lib/checks";
import { closeStalledGeneration, markNotStarted } from "@/lib/batches";
import { startCandidates, startDerivative, startGeneration, startLiveCheck } from "@/lib/jobs";
import { latestRegenerateEvent } from "@/lib/learn";
import { copyDerivative, DerivativeError, failDerivative, isChannel, queueDerivative, queueDerivedSlots,
  queueMissingDerivatives, saveDerivativeEdit, setDerivativeRun } from "@/lib/derivatives";
import { CHANNELS, type DerivativeText } from "@/lib/derivative-checks";
import { publishPost, PublishError, restartLiveCheck } from "@/lib/publish";
import { PUBLISH_STEP_LABELS } from "@/lib/publish-steps";
import { approvePost, parsePostText, queueRegeneration, rejectPost, reopenPost, ReviewError, savePublishingDetails, saveVersion } from "@/lib/review";
import { browseCovers, chooseCover, CoverError, type CoverFolderView } from "@/lib/covers";
import { getDb } from "@/db/client";
import { posts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { isUuid, optionalText } from "@/lib/validation";
import { syncCalendarAfter } from "@/lib/calendar-hooks";

export type TextInput = { title: string; excerpt: string; body: string };
export type ReviewActionResult = { ok: true; message?: string; checks?: CheckResult } | { ok: false; message: string };

function failure(error: unknown): ReviewActionResult {
  if (error instanceof ReviewError) return { ok: false, message: error.message };
  throw error;
}

export async function saveDraftAction(postId: string, input: TextInput): Promise<ReviewActionResult> {
  await requireUser();
  try {
    const { saved, checks } = await saveVersion(postId, parsePostText(input));
    refresh();
    return { ok: true, message: saved ? "Draft saved." : "No changes to save.", checks };
  } catch (error) {
    return failure(error);
  }
}

export async function approveAction(postId: string, input: TextInput): Promise<ReviewActionResult> {
  await requireUser();
  // The calendar follows once the response has gone (γ8 orientation Q2).
  syncCalendarAfter("action");
  let approved: Awaited<ReturnType<typeof approvePost>>;
  try {
    approved = await approvePost(postId, parsePostText(input));
  } catch (error) {
    return failure(error);
  }
  // Candidates are a bonus: if Trigger.dev cannot be reached the approval still stands.
  let message = "Post approved.";
  if (approved.hasEdits) {
    message = (await learnFrom({ reviewEventId: approved.reviewEventId }))
      ? "Post approved. Suggestions from your edits will appear in Settings, BrandFactory rules."
      : "Post approved. Suggestions from your edits could not be started, because Trigger.dev could not be reached.";
  }
  // Phase 2 A4: the run's derived posts for it are written now, in real time (orientation Q7).
  try {
    const queued = await queueDerivedSlots(postId);
    const started = await Promise.all(queued.map((row) => startDerivativeRun(row.id)));
    if (queued.length) message += started.every(Boolean) ? ` Writing ${queued.map((row) => CHANNELS[row.channel].label).join(", ")}.` : ` ${RUN_NOT_REACHED}`;
  } catch (error) {
    if (!(error instanceof DerivativeError)) throw error;
    message += ` ${error.message}`;
  }
  refresh();
  return { ok: true, message };
}

// Starts a candidate run for one piece of feedback (γ7 orientation Q2). A failure never blocks what Amir did.
async function learnFrom(source: { reviewEventId: string } | { derivativeId: string }): Promise<boolean> {
  try {
    await startCandidates(source);
    return true;
  } catch (error) {
    console.error("Could not start propose-candidates:", error);
    return false;
  }
}

export async function rejectAction(postId: string, note: string): Promise<ReviewActionResult> {
  await requireUser();
  syncCalendarAfter("action");
  let eventId: string;
  try {
    eventId = await rejectPost(postId, note);
  } catch (error) {
    return failure(error);
  }
  // The note is read for rules and facts straight away (γ7 handoff item 3).
  await learnFrom({ reviewEventId: eventId });
  refresh();
  return { ok: true, message: "Post rejected. Any rule or fact in your note will appear in Settings, BrandFactory rules." };
}

export async function reopenAction(postId: string): Promise<ReviewActionResult> {
  await requireUser();
  syncCalendarAfter("action");
  try {
    await reopenPost(postId);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { ok: true, message: "Post reopened for editing." };
}

const RUN_NOT_STARTED = "Trigger.dev could not be reached, so the regenerate did not start. Your text is saved; try again.";

// Regenerate with a note: saves the text, queues a run that starts from it, and starts the run.
export async function regenerateAction(postId: string, note: string, input: TextInput | null): Promise<ReviewActionResult> {
  await requireUser();
  syncCalendarAfter("action");
  let generationId: string;
  try {
    generationId = await queueRegeneration(postId, note, input ? parsePostText(input) : null);
  } catch (error) {
    return failure(error);
  }
  try {
    await startGeneration(generationId);
  } catch (error) {
    console.error("Could not start generate-post:", error);
    await markNotStarted(generationId, RUN_NOT_STARTED);
    refresh();
    return { ok: false, message: RUN_NOT_STARTED };
  }
  // Rules and facts the note holds are proposed alongside the regenerate (γ7 handoff item 3); a failure never blocks it.
  const eventId = await latestRegenerateEvent(postId);
  if (eventId) await learnFrom({ reviewEventId: eventId });
  refresh();
  return { ok: true, message: "The writer is working on a new version." };
}

// A regenerate that stopped reporting progress is closed, so the post goes back to Needs review.
export async function stopWaitingAction(postId: string): Promise<ReviewActionResult> {
  await requireUser();
  syncCalendarAfter("action");
  if (!isUuid(postId)) return { ok: false, message: "This post no longer exists." };
  await closeStalledGeneration(postId);
  refresh();
  return { ok: true };
}

export type DetailsState = { message?: string; error?: string; saved?: boolean };

export async function detailsAction(postId: string, _previous: DetailsState, formData: FormData): Promise<DetailsState> {
  await requireUser();
  const pillar = optionalText(formData.get("pillarId"));
  try {
    await savePublishingDetails(postId, { slug: String(formData.get("slug") ?? ""), pillarId: pillar && isUuid(pillar) ? pillar : null });
  } catch (error) {
    if (error instanceof ReviewError) return { error: error.message };
    throw error;
  }
  refresh();
  return { saved: true, message: "Publishing details saved." };
}

export type BrowseResult = { ok: true; view: CoverFolderView } | { ok: false; message: string };

// The cover picker (γ5 orientation Q6): one folder page at a time, inside the project's Drive folder.
export async function browseCoversAction(postId: string, folderId: string | null, pageToken: string | null): Promise<BrowseResult> {
  const user = await requireUser();
  if (!isUuid(postId)) return { ok: false, message: "This post no longer exists." };
  const [post] = await getDb().select({ projectId: posts.projectId }).from(posts).where(eq(posts.id, postId));
  if (!post) return { ok: false, message: "This post no longer exists." };
  try {
    return { ok: true, view: await browseCovers(user.id, post.projectId, folderId, pageToken) };
  } catch (error) {
    if (error instanceof CoverError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function chooseCoverAction(postId: string, fileId: string): Promise<ReviewActionResult> {
  const user = await requireUser();
  try {
    await chooseCover(user.id, postId, fileId);
  } catch (error) {
    if (error instanceof CoverError) return { ok: false, message: error.message };
    return failure(error);
  }
  refresh();
  return { ok: true, message: "Cover chosen." };
}

// ---- Publish (γ6 orientation Q3 to Q5) ----

export type PublishActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function publishAction(postId: string): Promise<PublishActionResult> {
  const user = await requireUser();
  syncCalendarAfter("action");
  try {
    const outcome = await publishPost(postId, user.id, { startLiveCheck });
    refresh();
    return outcome.ok
      ? { ok: true, message: "Wix accepted the post. Checking the live page now." }
      : { ok: false, message: `Publishing stopped at the ${PUBLISH_STEP_LABELS[outcome.step ?? "cover"].toLowerCase()} step: ${outcome.message}` };
  } catch (error) {
    if (error instanceof PublishError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function checkAgainAction(postId: string): Promise<PublishActionResult> {
  await requireUser();
  syncCalendarAfter("action");
  try {
    await restartLiveCheck(postId, { startLiveCheck });
    refresh();
    return { ok: true, message: "Checking the live page again." };
  } catch (error) {
    if (error instanceof PublishError) return { ok: false, message: error.message };
    throw error;
  }
}

// ---- Derivative copy (γ6 orientation Q6, γ7 orientation Q2, Q3, Q5) ----

export type DerivativeActionResult = { ok: true; message: string } | { ok: false; message: string };

const RUN_NOT_REACHED = "Trigger.dev could not be reached, so the run did not start.";

async function startDerivativeRun(derivativeId: string): Promise<boolean> {
  try {
    await setDerivativeRun(derivativeId, await startDerivative(derivativeId));
    return true;
  } catch (error) {
    console.error("Could not start the derivative run:", error);
    await failDerivative(derivativeId, new Error(RUN_NOT_REACHED));
    return false;
  }
}

export async function generateDerivativeAction(postId: string, channel: string, note: string | null): Promise<DerivativeActionResult> {
  await requireUser();
  if (!isChannel(channel)) return { ok: false, message: "Unknown channel." };
  let derivativeId: string;
  try {
    derivativeId = await queueDerivative(postId, channel, note);
  } catch (error) {
    if (error instanceof DerivativeError) return { ok: false, message: error.message };
    throw error;
  }
  const started = await startDerivativeRun(derivativeId);
  // What was wrong with the last version is read for rules and facts (γ7 handoff item 2).
  if (started && note?.trim()) await learnFrom({ derivativeId });
  refresh();
  return started ? { ok: true, message: "Writing." } : { ok: false, message: RUN_NOT_REACHED };
}

// Generate all (γ7 handoff item 8): every channel with no version yet.
export async function generateAllDerivativesAction(postId: string): Promise<DerivativeActionResult> {
  await requireUser();
  let queued: Awaited<ReturnType<typeof queueMissingDerivatives>>;
  try {
    queued = await queueMissingDerivatives(postId);
  } catch (error) {
    if (error instanceof DerivativeError) return { ok: false, message: error.message };
    throw error;
  }
  const started = await Promise.all(queued.map((row) => startDerivativeRun(row.id)));
  refresh();
  return started.every(Boolean) ? { ok: true, message: "Writing." } : { ok: false, message: RUN_NOT_REACHED };
}

export async function saveDerivativeAction(postId: string, channel: string, text: DerivativeText): Promise<DerivativeActionResult> {
  await requireUser();
  if (!isChannel(channel)) return { ok: false, message: "Unknown channel." };
  try {
    await saveDerivativeEdit(postId, channel, text);
  } catch (error) {
    if (error instanceof DerivativeError) return { ok: false, message: error.message };
    throw error;
  }
  refresh();
  return { ok: true, message: "Edit saved." };
}

// Copy (γ7 orientation Q3): unsaved changes are saved first, and an edited version is read for rules and facts once.
// The browser copies the text itself; this records what was posted.
export async function copyDerivativeAction(postId: string, channel: string, text: DerivativeText): Promise<DerivativeActionResult> {
  await requireUser();
  if (!isChannel(channel)) return { ok: false, message: "Unknown channel." };
  let copied: Awaited<ReturnType<typeof copyDerivative>>;
  try {
    copied = await copyDerivative(postId, channel, text);
  } catch (error) {
    if (error instanceof DerivativeError) return { ok: false, message: error.message };
    throw error;
  }
  if (copied.isEdit && copied.derivativeId) await learnFrom({ derivativeId: copied.derivativeId });
  refresh();
  return { ok: true, message: "Copied." };
}
