import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database, Executor } from "@/db/client";
import {
  batches,
  criticVerdicts,
  postDrafts,
  postGenerations,
  posts,
  postSpecs,
  postVersions,
  projectPillars,
  type CriticIssue,
} from "@/db/schema";
import type { GenerationStep, PostStatus } from "@/config/post-status";
import { AiClient, ModelOutputError, ModelRefusal, type CallRequest, type Effort, type Transport } from "@/lib/ai/client";
import { channelRules, loadPack, withChannelRules, type LoadedPack } from "@/lib/ai/pack";
import { parseAllowedLinks, parseBannedPhrases, runChecks, type CheckResult } from "@/lib/checks";
import { composeMarkdown } from "@/lib/review-rules";
import { listSitePages } from "@/lib/sitemap";
import { MAX_ROUNDS } from "./generation-limits";

export { MAX_ROUNDS };
import * as criticPrompt from "@/prompts/critic";
import * as specPrompt from "@/prompts/spec";
import * as writerPrompt from "@/prompts/writer";
import type { SpecForPrompt } from "@/prompts/shared";

// What the Trigger.dev tasks run (γ4 orientation Q6). Every step saves its result before the next starts, so
// a retried run picks up from the last saved step instead of paying for a call again. Statuses follow Q4:
// a run moves the post to generating, a critic pass to in_review, two failed fix rounds to flagged, and a
// run that could not finish puts it back to spec_confirmed with the error on its generation row.

export const EFFORT: Record<"spec" | "writer" | "critic", Effort> = { spec: "medium", writer: "high", critic: "high" };
export const MAX_TOKENS = { spec: 16000, writer: 32000, critic: 16000 } as const;

export type GenerationDeps = { db: Database; transport: Transport };

// Errors a retry cannot fix: a refusal, a reply in the wrong shape, and API errors other than rate limits,
// overload and server errors. These fail the post at once.
export function isRetryable(error: unknown): boolean {
  if (error instanceof ModelRefusal || error instanceof ModelOutputError) return false;
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
  }
  return true;
}

export function failureMessage(error: unknown): string {
  if (error instanceof ModelRefusal || error instanceof ModelOutputError) return error.message;
  if (error instanceof Anthropic.AuthenticationError) return "The Anthropic API key was refused. Check it in Trigger.dev.";
  if (error instanceof Anthropic.APIError) return `The Anthropic API returned an error${error.status ? ` (${error.status})` : ""}: ${error.message}`;
  if (error instanceof Error) return error.message;
  // Trigger.dev hands onFailure a serialised error.
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : "The run stopped with an unknown error.";
}

async function setPost(db: Executor, postId: string, status: PostStatus, step: GenerationStep | null): Promise<void> {
  await db
    .update(posts)
    .set({
      status,
      generationStep: step,
      statusChangedAt: sql`case when ${posts.status} = ${status} then ${posts.statusChangedAt} else now() end`,
      updatedAt: sql`now()`,
    })
    .where(eq(posts.id, postId));
}

async function pillarLabel(db: Database, pillarId: string | null): Promise<string | null> {
  if (!pillarId) return null;
  const [row] = await db.select({ label: projectPillars.label }).from(projectPillars).where(eq(projectPillars.id, pillarId));
  return row?.label ?? null;
}

async function loadPost(db: Database, postId: string, batchId: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId));
  if (!post || !batch) throw new Error("The post or its batch no longer exists.");
  return { post, batch, pillar: await pillarLabel(db, post.pillarId ?? batch.defaultPillarId) };
}

// ---- Specs ----

export type SpecStep = { specId: string; request: CallRequest; faqMode: "useful" | "always" | "never"; pack: LoadedPack };

// The spec call for one version still drafting, or null when it has already run (Phase 2 A4: the batch path sends the
// same request).
export async function specStep(specId: string, db: Database): Promise<SpecStep | null> {
  const [spec] = await db.select().from(postSpecs).where(eq(postSpecs.id, specId));
  if (!spec || spec.status !== "drafting") return null;
  const { post, batch, pillar } = await loadPost(db, spec.postId, spec.batchId);
  const pack = await loadPack(post.projectId, db);
  const pages = await listSitePages(post.projectId, db);
  const previous = spec.version > 1 ? await previousSpec(db, spec.postId, spec.version) : null;
  return {
    specId,
    faqMode: batch.faqMode,
    pack,
    request: {
      purpose: "spec",
      model: batch.writerModel,
      promptVersion: specPrompt.PROMPT_VERSION,
      effort: EFFORT.spec,
      maxTokens: MAX_TOKENS.spec,
      pack: pack.text,
      instructions: withChannelRules(specPrompt.INSTRUCTIONS, channelRules(pack, "blog")),
      user: specPrompt.specUserMessage({
        topic: post.topic ?? "",
        slotDate: post.slotDate,
        lengthMin: spec.lengthMin,
        lengthMax: spec.lengthMax,
        cta: spec.cta,
        pillar,
        notes: spec.notes,
        faqMode: batch.faqMode,
        pages: pages.map((page) => ({ path: page.path, title: page.title })),
        redraft: previous && spec.redraftNote ? { note: spec.redraftNote, previous } : null,
      }),
      batchId: batch.id,
      postId: post.id,
    },
  };
}

export async function saveSpec(step: SpecStep, value: specPrompt.SpecReply, aiCallId: string, db: Database): Promise<void> {
  const faq = step.faqMode === "always" ? true : step.faqMode === "never" ? false : value.faq;
  await db
    .update(postSpecs)
    .set({
      status: "proposed",
      keyword: value.keyword,
      postType: value.postType,
      location: value.location,
      angle: value.angle,
      outline: value.outline,
      facts: value.facts,
      links: value.links,
      faq,
      error: null,
      aiCallId,
      agencyVersionId: step.pack.agencyVersionId,
      clientVersionId: step.pack.clientVersionId,
      projectVersionId: step.pack.projectVersionId,
    })
    .where(and(eq(postSpecs.id, step.specId), eq(postSpecs.status, "drafting")));
}

// Drafts one spec version that is in drafting. Any other status means it already ran.
export async function draftSpec(specId: string, deps: GenerationDeps): Promise<void> {
  const step = await specStep(specId, deps.db);
  if (!step) return;
  const { value, call } = await new AiClient(deps.db, deps.transport).parsed(step.request, specPrompt.SpecReply);
  await saveSpec(step, value, call.id, deps.db);
}

async function previousSpec(db: Database, postId: string, version: number): Promise<specPrompt.SpecReply | null> {
  const [row] = await db
    .select()
    .from(postSpecs)
    .where(and(eq(postSpecs.postId, postId), eq(postSpecs.version, version - 1)));
  if (!row?.keyword) return null;
  return {
    keyword: row.keyword,
    postType: row.postType ?? "",
    location: row.location,
    angle: row.angle ?? "",
    outline: row.outline ?? [],
    facts: row.facts ?? [],
    links: row.links ?? [],
    faq: row.faq ?? false,
  };
}

export async function failSpec(specId: string, error: unknown, db: Database): Promise<void> {
  await db
    .update(postSpecs)
    .set({ status: "failed", error: failureMessage(error) })
    .where(and(eq(postSpecs.id, specId), eq(postSpecs.status, "drafting")));
}

// ---- Generation ----

type Draft = typeof postDrafts.$inferSelect;
type Verdict = typeof criticVerdicts.$inferSelect;

const FINISHED = ["in_review", "flagged", "failed"] as const;

export type GenerationOutcome = "in_review" | "flagged" | "already_finished";

export type GenerationContext = {
  generationId: string;
  generation: typeof postGenerations.$inferSelect;
  postId: string;
  pack: LoadedPack;
  forPrompt: SpecForPrompt;
  batch: typeof batches.$inferSelect;
  blogRules: string;
  regenerate: writerPrompt.WriterRegenerate | null;
};

// What a generation needs for its calls, and the generation marked running. "already_finished" when there is nothing to do.
export async function generationContext(generationId: string, db: Database): Promise<GenerationContext | "already_finished"> {
  const [generation] = await db.select().from(postGenerations).where(eq(postGenerations.id, generationId));
  if (!generation) throw new Error("That generation no longer exists.");
  if ((FINISHED as readonly string[]).includes(generation.status)) return "already_finished";

  const [spec] = await db.select().from(postSpecs).where(eq(postSpecs.id, generation.specId));
  if (!spec || spec.status !== "confirmed") throw new ModelOutputError("The post's spec is not confirmed.");
  const { post, batch, pillar } = await loadPost(db, generation.postId, generation.batchId);
  const pack = await loadPack(post.projectId, db);

  if (generation.status === "queued") {
    await db
      .update(postGenerations)
      .set({
        status: "running",
        startedAt: sql`coalesce(${postGenerations.startedAt}, now())`,
        agencyVersionId: pack.agencyVersionId,
        clientVersionId: pack.clientVersionId,
        projectVersionId: pack.projectVersionId,
        updatedAt: sql`now()`,
      })
      .where(eq(postGenerations.id, generationId));
  }

  const forPrompt: SpecForPrompt = {
    topic: post.topic ?? "",
    keyword: spec.keyword ?? "",
    postType: spec.postType ?? "",
    location: spec.location,
    angle: spec.angle ?? "",
    outline: spec.outline ?? [],
    facts: spec.facts ?? [],
    links: spec.links ?? [],
    faq: spec.faq ?? false,
    lengthMin: spec.lengthMin,
    lengthMax: spec.lengthMax,
    cta: spec.cta,
    pillar,
    notes: spec.notes,
  };
  // The blog's own rules and voice follow the instructions, outside the cached pack (γ7 orientation Q1).
  return { generationId, generation, postId: post.id, pack, forPrompt, batch, blogRules: channelRules(pack, "blog"), regenerate: await regenerateFrom(db, generation) };
}

// The next step of the writer, checks, critic and fix loop (Phase 2 A4, orientation Q7): given what is saved, the next
// call or the outcome. The real-time task runs it in a loop; the batch path runs it for many posts at once.
export type LoopStep =
  | { kind: "finish"; outcome: "in_review" | "flagged" }
  | { kind: "critic"; round: number; draftId: string; request: CallRequest }
  | { kind: "writer"; round: number; request: CallRequest };

export async function nextGenerationStep(context: GenerationContext, db: Database): Promise<LoopStep> {
  const { generationId, forPrompt, batch, pack, blogRules, generation } = context;
  const drafts = await db.select().from(postDrafts).where(eq(postDrafts.generationId, generationId)).orderBy(asc(postDrafts.round));
  const latest = drafts.at(-1);
  const verdict = latest ? await verdictFor(db, latest.id) : null;
  const call = { batchId: batch.id, postId: context.postId, pack: pack.text };

  // Pass: the post goes to Amir.
  if (latest && verdict?.verdict === "pass") return { kind: "finish", outcome: "in_review" };

  // A draft that passed the checks and has no verdict yet goes to the critic.
  if (latest && latest.checksPassed && !verdict) {
    const checks = latest.checks as CheckResult;
    return {
      kind: "critic",
      round: latest.round,
      draftId: latest.id,
      request: {
        ...call,
        purpose: "critic",
        model: batch.criticModel,
        promptVersion: criticPrompt.PROMPT_VERSION,
        effort: EFFORT.critic,
        maxTokens: MAX_TOKENS.critic,
        instructions: withChannelRules(criticPrompt.INSTRUCTIONS, blogRules),
        user: criticPrompt.criticUserMessage(forPrompt, latest.bodyMd, checks, generation.note),
      },
    };
  }

  // No draft yet, or the last one failed the checks or the critic: write the next round, if one is left.
  if (latest && latest.round >= MAX_ROUNDS) return { kind: "finish", outcome: "flagged" };
  const fix = latest
    ? {
        previousDraft: latest.bodyMd,
        checkIssues: (latest.checks as CheckResult).issues,
        criticIssues: (verdict?.issues ?? []) as CriticIssue[],
      }
    : null;
  return {
    kind: "writer",
    round: (latest?.round ?? 0) + 1,
    request: {
      ...call,
      purpose: "writer",
      model: batch.writerModel,
      promptVersion: writerPrompt.PROMPT_VERSION,
      effort: EFFORT.writer,
      maxTokens: MAX_TOKENS.writer,
      instructions: withChannelRules(writerPrompt.INSTRUCTIONS, blogRules),
      user: writerPrompt.writerUserMessage(forPrompt, fix, context.regenerate),
    },
  };
}

// The post shows what is being written, before the call is made.
export async function beginStep(context: GenerationContext, step: Exclude<LoopStep, { kind: "finish" }>, db: Database): Promise<void> {
  await setPost(db, context.postId, "generating", step.kind);
  await db
    .update(postGenerations)
    .set({ ...(step.kind === "writer" ? { round: step.round } : {}), updatedAt: sql`now()` })
    .where(eq(postGenerations.id, context.generationId));
}

export async function saveCriticStep(step: Extract<LoopStep, { kind: "critic" }>, value: criticPrompt.CriticReply, aiCallId: string, db: Database): Promise<void> {
  await db
    .insert(criticVerdicts)
    .values({
      draftId: step.draftId,
      verdict: criticPrompt.verdictOf(value),
      summary: value.summary,
      issues: value.issues,
      placeholders: value.placeholders,
      scores: value.scores,
      aiCallId,
    })
    .onConflictDoNothing();
}

export async function saveWriterStep(context: GenerationContext, step: Extract<LoopStep, { kind: "writer" }>, text: string, aiCallId: string, db: Database): Promise<void> {
  // A retried batch round can bring a draft already saved; the first stays.
  const [existing] = await db.select({ id: postDrafts.id }).from(postDrafts).where(and(eq(postDrafts.generationId, context.generationId), eq(postDrafts.round, step.round)));
  if (existing) return;
  await saveDraft(db, context.generationId, step.round, text, context.forPrompt, context.pack, aiCallId);
}

export async function finishGeneration(generationId: string, postId: string, outcome: "in_review" | "flagged", db: Database): Promise<GenerationOutcome> {
  return finish(db, generationId, postId, outcome);
}

// Runs one post from its confirmed spec to Needs review or Failed, resuming from what is already saved.
export async function runGeneration(generationId: string, deps: GenerationDeps): Promise<GenerationOutcome> {
  const { db } = deps;
  const context = await generationContext(generationId, db);
  if (context === "already_finished") return context;
  const ai = new AiClient(db, deps.transport);
  for (;;) {
    const step = await nextGenerationStep(context, db);
    if (step.kind === "finish") return finish(db, generationId, context.postId, step.outcome);
    await beginStep(context, step, db);
    if (step.kind === "critic") {
      const { value, call } = await ai.parsed(step.request, criticPrompt.CriticReply);
      await saveCriticStep(step, value, call.id, db);
    } else {
      const { text, call } = await ai.text(step.request);
      await saveWriterStep(context, step, text, call.id, db);
    }
  }
}

// Regenerate with a note (γ5 orientation Q4): the first writer round starts from the version Amir regenerated.
async function regenerateFrom(db: Database, generation: typeof postGenerations.$inferSelect): Promise<writerPrompt.WriterRegenerate | null> {
  if (!generation.note || !generation.baseVersionId) return null;
  const [version] = await db.select().from(postVersions).where(eq(postVersions.id, generation.baseVersionId));
  if (!version) throw new ModelOutputError("The version to regenerate from no longer exists.");
  return { note: generation.note, current: composeMarkdown({ title: version.title, excerpt: version.excerpt ?? "", body: version.bodyMd }) };
}

// A batch run that cannot finish puts the post back to Spec ready for a retry. A regenerate leaves Amir's
// version in place, so the post goes back to Needs review.
export function statusAfterFailedRun(generation: { note: string | null }): "spec_confirmed" | "in_review" {
  return generation.note ? "in_review" : "spec_confirmed";
}

async function verdictFor(db: Database, draftId: string): Promise<Verdict | null> {
  const [row] = await db.select().from(criticVerdicts).where(eq(criticVerdicts.draftId, draftId));
  return row ?? null;
}

export function checkDraft(markdown: string, spec: SpecForPrompt, pack: Pick<LoadedPack, "agency" | "client" | "project" | "siteUrl">): CheckResult {
  return runChecks({
    examples: [pack.client?.examples ?? "", pack.client?.counter_examples ?? ""],
    markdown,
    lengthMin: spec.lengthMin,
    lengthMax: spec.lengthMax,
    faq: spec.faq,
    allowedLinks: parseAllowedLinks(pack.project?.allowed_links ?? ""),
    bannedPhrases: parseBannedPhrases(pack.agency?.banned_phrases ?? ""),
    siteHost: hostOf(pack.siteUrl),
  });
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

async function saveDraft(
  db: Database,
  generationId: string,
  round: number,
  markdown: string,
  spec: SpecForPrompt,
  pack: LoadedPack,
  aiCallId: string,
): Promise<Draft> {
  const checks = checkDraft(markdown, spec, pack);
  const [row] = await db
    .insert(postDrafts)
    .values({
      generationId,
      round,
      title: checks.title ?? "Untitled draft",
      excerpt: checks.excerpt,
      bodyMd: markdown,
      wordCount: checks.wordCount,
      checks,
      checksPassed: checks.passed,
      aiCallId,
    })
    .returning();
  return row;
}

async function finish(db: Database, generationId: string, postId: string, outcome: "in_review" | "flagged"): Promise<GenerationOutcome> {
  // A run closed meanwhile (stalled, then retried) leaves the post to the newer run.
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(postGenerations)
      .set({ status: outcome, finishedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(postGenerations.id, generationId), inArray(postGenerations.status, ["queued", "running"])))
      .returning({ id: postGenerations.id });
    if (row) await setPost(tx, postId, outcome, null);
  });
  return outcome;
}

// When a run cannot finish: the generation keeps the error and the post goes back to Spec ready for a retry.
export async function failGeneration(generationId: string, error: unknown, db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(postGenerations)
      .set({ status: "failed", error: failureMessage(error), finishedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(postGenerations.id, generationId), inArray(postGenerations.status, ["queued", "running"])))
      .returning({ postId: postGenerations.postId, note: postGenerations.note });
    if (row) await setPost(tx, row.postId, statusAfterFailedRun(row), null);
  });
}

// The newest generation per post, for the Generating screen and Retry.
export async function latestGeneration(postId: string, db: Database) {
  const [row] = await db.select().from(postGenerations).where(eq(postGenerations.postId, postId)).orderBy(desc(postGenerations.createdAt)).limit(1);
  return row ?? null;
}
