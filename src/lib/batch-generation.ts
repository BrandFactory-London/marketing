import { and, asc, desc, eq, gte, inArray, isNull, lte, max, sql } from "drizzle-orm";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { getDb, type Database } from "@/db/client";
import { batches, generationBatches, postGenerations, posts, postSpecs, runs, type BatchRequestRef } from "@/db/schema";
import * as criticPrompt from "@/prompts/critic";
import * as specPrompt from "@/prompts/spec";
import { AiClient, buildParams, parsedParams, type CallRequest, type Transport } from "./ai/client";
import type { BatchRequest, BatchTransport } from "./ai/batch";
import { loadPack } from "./ai/pack";
import { confirmSpecs, defaultCta, queueGenerations } from "./batches";
import { longDate } from "./dates";
import { nextAfter, windowEnd } from "./fortnight";
import {
  beginStep,
  failGeneration,
  failSpec,
  failureMessage,
  finishGeneration,
  generationContext,
  nextGenerationStep,
  saveCriticStep,
  saveSpec,
  saveWriterStep,
  specStep,
  type LoopStep,
} from "./generation";
import { getModelSettings } from "./settings";

// Fortnightly generation (Phase 2 A4, orientation Q7). On a run's generation day every planned SEO post dated up to 27
// days ahead joins one batch with a spec drafted from its approved title and excerpt. Then rounds: each round collects
// every post's next call (spec, writer or critic, from the same step function as the real-time path), submits them as
// one Anthropic message batch at half price, waits for it to end, and saves each result as the real-time path does. A
// post needs at most seven rounds. A request that comes back errored or expired goes into the next round once more;
// a second failure, or a request Anthropic refuses, fails that post only.

export const POLL_MINUTES = 5;
// A request that has not come back twice fails its post.
export const MAX_ATTEMPTS = 2;

export type BatchDeps = { db: Database; batch: BatchTransport };
type Round = typeof generationBatches.$inferSelect;

export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

// ---- Generation days ----

// The run's posts a generation on `today` covers: planned (topic set from the approved plan), in no batch, dated from
// today up to 27 days ahead.
export async function duePosts(runId: string, today: string, db: Database) {
  return db
    .select()
    .from(posts)
    .where(and(eq(posts.runId, runId), eq(posts.status, "topic_set"), isNull(posts.batchId), gte(posts.slotDate, today), lte(posts.slotDate, windowEnd(today))))
    .orderBy(asc(posts.slotDate), asc(posts.createdAt));
}

function autoNotes(excerpt: string | null): string | null {
  return excerpt ? `Planned excerpt, from the approved plan: ${excerpt}` : null;
}

// One batch for these posts, with a spec each drafted from the plan and confirmed with no step from Amir.
async function batchFor(db: Database, run: typeof runs.$inferSelect, name: string, chosen: { id: string; plannedExcerpt: string | null }[]): Promise<{ batchId: string; specIds: string[] }> {
  const settings = await getModelSettings(db);
  const pack = await loadPack(run.projectId, db);
  const cta = run.cta?.trim() || defaultCta(pack.project?.cta) || "Get in touch.";
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batches)
      .values({
        projectId: run.projectId,
        runId: run.id,
        name,
        lengthMin: run.lengthMin,
        lengthMax: run.lengthMax,
        cta,
        faqMode: run.faqMode,
        writerModel: run.writerModel,
        criticModel: run.criticModel,
        derivativeModel: settings.derivativeModel,
      })
      .returning({ id: batches.id });
    const specIds: string[] = [];
    for (const post of chosen) {
      const [taken] = await tx
        .update(posts)
        .set({ batchId: batch.id, updatedAt: sql`now()` })
        .where(and(eq(posts.id, post.id), eq(posts.status, "topic_set"), isNull(posts.batchId)))
        .returning({ id: posts.id });
      if (!taken) continue;
      const [spec] = await tx
        .insert(postSpecs)
        .values({ postId: post.id, batchId: batch.id, version: 1, status: "drafting", auto: true, lengthMin: run.lengthMin, lengthMax: run.lengthMax, cta, notes: autoNotes(post.plannedExcerpt) })
        .returning({ id: postSpecs.id });
      specIds.push(spec.id);
    }
    return { batchId: batch.id, specIds };
  });
}

// A generation day: the batch for the posts it covers (if any), and the run's next day a fortnight on.
export async function startFortnight(runId: string, today: string, db: Database = getDb()): Promise<{ batchId: string | null; posts: number }> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run || run.status !== "active") throw new GenerationError("Only an active run is generated.");
  const due = await duePosts(runId, today, db);
  await db.update(runs).set({ nextGenerationOn: nextAfter(today), updatedAt: sql`now()` }).where(eq(runs.id, runId));
  if (due.length === 0) return { batchId: null, posts: 0 };
  const { batchId, specIds } = await batchFor(db, run, `${run.name}, from ${longDate(today)}`, due);
  return { batchId: specIds.length ? batchId : null, posts: specIds.length };
}

// A batch for chosen posts of an active run, as a generation day makes one (the real run on Neon dev uses it for two).
export async function startRunBatch(runId: string, postIds: readonly string[], name: string, db: Database = getDb()): Promise<{ batchId: string | null; posts: number }> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run || run.status !== "active") throw new GenerationError("Only an active run is generated.");
  const chosen = await db.select().from(posts).where(and(eq(posts.runId, runId), inArray(posts.id, [...postIds])));
  const { batchId, specIds } = await batchFor(db, run, name, chosen);
  return { batchId: specIds.length ? batchId : null, posts: specIds.length };
}

// Runs whose generation day has come (the morning schedule).
export async function dueRuns(today: string, db: Database = getDb()) {
  return db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.status, "active"), eq(runs.autoGenerate, true), lte(runs.nextGenerationOn, today)));
}

// A run's batch with work left and no round with Anthropic, made over an hour ago: its batch-round run never started
// (Trigger.dev could not be reached) or stopped. The morning schedule starts it again.
export async function stalledBatches(db: Database = getDb()): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    select b.id from ${batches} b
    join ${runs} r on r.id = b.run_id and r.status = 'active'
    where b.created_at < now() - interval '1 hour'
      and not exists (select 1 from ${generationBatches} g where g.batch_id = b.id and g.status = 'submitted')
      and (
        exists (select 1 from ${postSpecs} s where s.batch_id = b.id and s.auto and s.status in ('drafting', 'proposed'))
        or exists (select 1 from ${postGenerations} g where g.batch_id = b.id and g.status in ('queued', 'running'))
      )`);
  return rows.rows.map((row) => row.id);
}

// Generate now on one post (orientation Q7): its own batch and spec, then the real-time path at full price.
export async function prepareGenerateNow(postId: string, db: Database = getDb()): Promise<string> {
  const [row] = await db.select({ post: posts, run: runs }).from(posts).innerJoin(runs, eq(runs.id, posts.runId)).where(eq(posts.id, postId));
  if (!row) throw new GenerationError("This post is not in a run.");
  if (row.post.status !== "topic_set" || row.post.batchId) throw new GenerationError("This post is already being written, or has no topic yet.");
  const { specIds } = await batchFor(db, row.run, `${row.run.name}, ${row.post.topic ?? "one post"} now`, [row.post]);
  if (specIds.length === 0) throw new GenerationError("This post is already being written.");
  return specIds[0];
}

// The rest of Generate now, after its spec is drafted: confirm it as the plan's and queue the generation.
export async function confirmAutoSpec(specId: string, db: Database = getDb()): Promise<string | null> {
  const [spec] = await db.select().from(postSpecs).where(eq(postSpecs.id, specId));
  if (!spec || !spec.auto) return null;
  if (spec.status === "proposed") await confirmSpecs([specId], db);
  const [queued] = await queueGenerations(spec.batchId, { postId: spec.postId }, db);
  if (queued) return queued;
  const [running] = await db.select({ id: postGenerations.id }).from(postGenerations).where(and(eq(postGenerations.postId, spec.postId), inArray(postGenerations.status, ["queued", "running"])));
  return running?.id ?? null;
}

// ---- Rounds ----

type Planned =
  | { ref: BatchRequestRef; kind: "spec"; request: CallRequest }
  | { ref: BatchRequestRef; kind: "loop"; request: CallRequest; step: Exclude<LoopStep, { kind: "finish" }> };

export function customIdFor(kind: BatchRequestRef["kind"], round: number, id: string, attempt: number): string {
  return `${kind[0]}${round}a${attempt}-${id}`;
}

// How many times this step has already gone out and not come back.
function attemptOf(history: readonly Round[], kind: BatchRequestRef["kind"], id: string, round: number): number {
  let tries = 0;
  for (const row of history) for (const ref of row.requests) if (ref.kind === kind && ref.id === id && ref.round === round && ref.outcome === "retry") tries++;
  return tries + 1;
}

// Every post's next call. Specs drafted from the plan are confirmed and their generation queued on the way, and posts
// whose loop has finished are closed, so nothing waits on Amir.
export async function collectSteps(batchId: string, db: Database): Promise<Planned[]> {
  const history = await db.select().from(generationBatches).where(eq(generationBatches.batchId, batchId)).orderBy(asc(generationBatches.round));
  const members = await db.select().from(posts).where(eq(posts.batchId, batchId)).orderBy(asc(posts.slotDate));
  const planned: Planned[] = [];
  for (const post of members) {
    const [spec] = await db.select().from(postSpecs).where(eq(postSpecs.postId, post.id)).orderBy(desc(postSpecs.version)).limit(1);
    if (!spec || spec.batchId !== batchId) continue;
    if (spec.status === "drafting") {
      const step = await specStep(spec.id, db);
      if (!step) continue;
      planned.push({ kind: "spec", request: step.request, ref: { customId: "", kind: "spec", id: spec.id, round: 0, attempt: attemptOf(history, "spec", spec.id, 0) } });
      continue;
    }
    if (spec.status === "failed" || spec.status === "superseded") continue;
    if (spec.status === "proposed" && spec.auto) {
      await confirmSpecs([spec.id], db);
      await queueGenerations(batchId, { postId: post.id }, db);
    }
    const [generation] = await db.select().from(postGenerations).where(eq(postGenerations.postId, post.id)).orderBy(desc(postGenerations.createdAt)).limit(1);
    if (!generation || !["queued", "running"].includes(generation.status) || generation.batchId !== batchId) continue;
    const context = await generationContext(generation.id, db);
    if (context === "already_finished") continue;
    const step = await nextGenerationStep(context, db);
    if (step.kind === "finish") {
      await finishGeneration(generation.id, post.id, step.outcome, db);
      continue;
    }
    planned.push({ kind: "loop", request: step.request, step, ref: { customId: "", kind: step.kind, id: generation.id, round: step.round, attempt: attemptOf(history, step.kind, generation.id, step.round) } });
  }
  // A step that has not come back twice fails its post rather than going out a third time.
  const out: Planned[] = [];
  for (const item of planned) {
    if (item.ref.attempt > MAX_ATTEMPTS) {
      await failStep(db, item.ref, "This step did not come back from the half-price batch twice. Try again, or use Generate now.");
      continue;
    }
    item.ref.customId = customIdFor(item.ref.kind, item.ref.round, item.ref.id, item.ref.attempt);
    out.push(item);
  }
  return out;
}

async function failStep(db: Database, ref: BatchRequestRef, message: string): Promise<void> {
  if (ref.kind === "spec") await failSpec(ref.id, new Error(message), db);
  else await failGeneration(ref.id, new Error(message), db);
}

export async function openRound(batchId: string, db: Database): Promise<Round | null> {
  const [row] = await db.select().from(generationBatches).where(and(eq(generationBatches.batchId, batchId), eq(generationBatches.status, "submitted"))).limit(1);
  return row ?? null;
}

// Submits the next round, or returns null when every post in the batch has finished.
export async function submitRound(batchId: string, deps: BatchDeps): Promise<Round | null> {
  const { db } = deps;
  const open = await openRound(batchId, db);
  if (open) return open;
  const steps = await collectSteps(batchId, db);
  if (steps.length === 0) return null;
  const [batch] = await db.select({ runId: batches.runId }).from(batches).where(eq(batches.id, batchId));
  if (!batch?.runId) throw new GenerationError("This batch is not a run's.");
  const [{ last }] = await db.select({ last: max(generationBatches.round) }).from(generationBatches).where(eq(generationBatches.batchId, batchId));
  // The row is saved before the submission, so a retried task never submits a round twice.
  const [row] = await db
    .insert(generationBatches)
    .values({ runId: batch.runId, batchId, round: (last ?? 0) + 1, requestCount: steps.length, requests: steps.map((item) => item.ref) })
    .returning();
  for (const item of steps) if (item.kind === "loop") await beginStepFor(db, item);
  const requests: BatchRequest[] = steps.map((item) => ({
    custom_id: item.ref.customId,
    params: item.kind === "spec" ? parsedParams(item.request, specPrompt.SpecReply) : item.step.kind === "critic" ? parsedParams(item.request, criticPrompt.CriticReply) : buildParams(item.request),
  }));
  try {
    const created = await deps.batch.create(requests);
    const [updated] = await db.update(generationBatches).set({ anthropicBatchId: created.id, submittedAt: sql`now()` }).where(eq(generationBatches.id, row.id)).returning();
    return updated;
  } catch (error) {
    await db.update(generationBatches).set({ status: "failed", error: failureMessage(error).slice(0, 1000), endedAt: sql`now()` }).where(eq(generationBatches.id, row.id));
    throw error;
  }
}

async function beginStepFor(db: Database, item: Extract<Planned, { kind: "loop" }>): Promise<void> {
  const context = await generationContext(item.ref.id, db);
  if (context !== "already_finished") await beginStep(context, item.step, db);
}

export type PollOutcome = "waiting" | "ended";

// Looks at a submitted round; when it has ended, saves every result and closes the round.
export async function pollRound(roundId: string, deps: BatchDeps): Promise<PollOutcome> {
  const { db } = deps;
  const [row] = await db.select().from(generationBatches).where(eq(generationBatches.id, roundId));
  if (!row || row.status !== "submitted") return "ended";
  if (!row.anthropicBatchId) {
    // The submission never reached Anthropic: close the round so the next one sends the same steps again.
    await db.update(generationBatches).set({ status: "failed", error: "The round was not submitted.", endedAt: sql`now()` }).where(eq(generationBatches.id, roundId));
    return "ended";
  }
  const status = await deps.batch.retrieve(row.anthropicBatchId);
  if (status.processingStatus !== "ended") return "waiting";
  const results = new Map((await deps.batch.results(row.anthropicBatchId)).map((result) => [result.custom_id, result]));
  const ai = new AiClient(db, NO_TRANSPORT);
  const refs: BatchRequestRef[] = [];
  for (const ref of row.requests) refs.push({ ...ref, outcome: await applyResult(db, ai, ref, results.get(ref.customId)) });
  await db.update(generationBatches).set({ status: "ended", requests: refs, endedAt: sql`now()` }).where(eq(generationBatches.id, roundId));
  return "ended";
}

// Results are read, never sent again, so the client here has no way to call the API.
const NO_TRANSPORT: Transport = async () => {
  throw new Error("A batch result is saved, not sent again.");
};

type Result = Awaited<ReturnType<BatchTransport["results"]>>[number] | undefined;

// Saves one result as the real-time path would. A reply that cannot be read fails that post at once, as it does in
// real time; a request Anthropic refused fails it with Anthropic's message; anything else is retried once.
async function applyResult(db: Database, ai: AiClient, ref: BatchRequestRef, result: Result): Promise<BatchRequestRef["outcome"]> {
  const outcome = result?.result;
  if (ref.kind === "spec") {
    const step = await specStep(ref.id, db);
    if (!step) return "ok";
    if (outcome?.type === "succeeded") {
      try {
        const { value, call } = await ai.parsedFromBatch(step.request, specPrompt.SpecReply, outcome.message as Message, outcome.message.id);
        await saveSpec(step, value, call.id, db);
        return "ok";
      } catch (error) {
        await failSpec(ref.id, error, db);
        return "failed";
      }
    }
    return failedResult(db, ai, ref, step.request, outcome);
  }
  const context = await generationContext(ref.id, db).catch(() => "already_finished" as const);
  if (context === "already_finished") return "ok";
  const step = await nextGenerationStep(context, db);
  // The post moved on meanwhile (a retried round): nothing to save.
  if (step.kind !== ref.kind || step.round !== ref.round) return "ok";
  if (outcome?.type === "succeeded") {
    try {
      if (step.kind === "critic") {
        const { value, call } = await ai.parsedFromBatch(step.request, criticPrompt.CriticReply, outcome.message as Message, outcome.message.id);
        await saveCriticStep(step, value, call.id, db);
      } else {
        const { text, call } = await ai.textFromBatch(step.request, outcome.message as Message, outcome.message.id);
        await saveWriterStep(context, step, text, call.id, db);
      }
      return "ok";
    } catch (error) {
      await failGeneration(ref.id, error, db);
      return "failed";
    }
  }
  return failedResult(db, ai, ref, step.request, outcome);
}

async function failedResult(db: Database, ai: AiClient, ref: BatchRequestRef, request: CallRequest, outcome: NonNullable<Result>["result"] | undefined): Promise<BatchRequestRef["outcome"]> {
  const errored = outcome?.type === "errored" ? outcome.error.error : null;
  const message = errored ? `The half-price batch returned an error (${errored.type}): ${errored.message}` : `The request ${outcome?.type ?? "did not come back"} from the half-price batch.`;
  await ai.failedInBatch(request, message);
  if (errored?.type === "invalid_request_error" || ref.attempt >= MAX_ATTEMPTS) {
    await failStep(db, ref, message);
    return "failed";
  }
  return "retry";
}

// ---- The Run plan and the calendar ----

// Whether a round of this batch is with Anthropic now, for the half-price batch line (orientation Q8).
export async function batchesInFlight(batchIds: readonly string[], db: Database = getDb()): Promise<Set<string>> {
  if (batchIds.length === 0) return new Set();
  const rows = await db
    .select({ batchId: generationBatches.batchId })
    .from(generationBatches)
    .where(and(inArray(generationBatches.batchId, [...batchIds]), eq(generationBatches.status, "submitted")));
  return new Set(rows.map((row) => row.batchId));
}
