import "server-only";
import { runs, tasks } from "@trigger.dev/sdk";
import { eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { postGenerations } from "@/db/schema";
import type { checkAnthropic, CheckAnthropicResult } from "@/trigger/check-anthropic";
import type { confirmLive } from "@/trigger/confirm-live";
import type { writeDerivativeTask } from "@/trigger/write-derivative";
import type { draftSpec } from "@/trigger/draft-spec";
import type { generatePost } from "@/trigger/generate-post";
import type { proposeRules } from "@/trigger/propose-rules";

// The app's only way into Trigger.dev (γ4 orientation Q1). It reads TRIGGER_SECRET_KEY, and TRIGGER_API_URL
// when set (Playwright points it at a local stand-in). The Anthropic key never reaches the app.

// The spec or generation id is the idempotency key, so a double click never starts two runs for one row.
export async function startSpec(specId: string): Promise<string> {
  const handle = await tasks.trigger<typeof draftSpec>("draft-spec", { specId }, { idempotencyKey: `spec-${specId}`, tags: [`spec_${specId}`] });
  return handle.id;
}

export async function startGeneration(generationId: string, db: Database = getDb()): Promise<string> {
  const handle = await tasks.trigger<typeof generatePost>(
    "generate-post",
    { generationId },
    { idempotencyKey: `generation-${generationId}`, tags: [`generation_${generationId}`] },
  );
  await db.update(postGenerations).set({ triggerRunId: handle.id, updatedAt: sql`now()` }).where(eq(postGenerations.id, generationId));
  return handle.id;
}

// Rule candidates from an approval's edits (decision 17). One run per approval.
export async function startRuleCandidates(reviewEventId: string): Promise<string> {
  const handle = await tasks.trigger<typeof proposeRules>("propose-rules", { reviewEventId }, { idempotencyKey: `rules-${reviewEventId}`, tags: [`review_${reviewEventId}`] });
  return handle.id;
}

// GMB or LinkedIn copy (decision 20). One run per version.
export async function startDerivative(derivativeId: string): Promise<string> {
  const handle = await tasks.trigger<typeof writeDerivativeTask>("write-derivative", { derivativeId }, { idempotencyKey: `derivative-${derivativeId}`, tags: [`derivative_${derivativeId}`] });
  return handle.id;
}

// The live check after a publish (decision 19). Each look ("Check again" starts another) gets its own key.
export async function startLiveCheck(publicationId: string): Promise<string> {
  const handle = await tasks.trigger<typeof confirmLive>(
    "confirm-live",
    { publicationId },
    { idempotencyKey: `live-${publicationId}-${Date.now()}`, tags: [`publication_${publicationId}`] },
  );
  return handle.id;
}

const CHECK_BUDGET_MS = 30_000;
const POLL_MS = 1_000;

// Settings > Connections. Waits up to 30 seconds for the check run to finish.
export async function checkAnthropicConnection(options: { budgetMs?: number; pollMs?: number } = {}): Promise<CheckAnthropicResult> {
  const budget = options.budgetMs ?? CHECK_BUDGET_MS;
  const poll = options.pollMs ?? POLL_MS;
  const handle = await tasks.trigger<typeof checkAnthropic>("check-anthropic", undefined);
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    let run;
    try {
      run = await runs.retrieve<typeof checkAnthropic>(handle.id);
    } catch (error) {
      console.error("Could not read the check run:", error);
      return { ok: false, message: "The check started, but its result could not be read from Trigger.dev." };
    }
    if (run.isCompleted && run.output) return run.output;
    if (run.isFailed || run.isCancelled) return { ok: false, message: "The check run failed in Trigger.dev." };
    await new Promise((resolve) => setTimeout(resolve, poll));
  }
  return { ok: false, message: "The check did not finish within 30 seconds. Trigger.dev may have no worker running." };
}
