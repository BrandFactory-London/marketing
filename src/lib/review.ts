import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, type Database, type Executor } from "@/db/client";
import { criticVerdicts, postDrafts, postGenerations, postPublications, posts, postSpecs, postVersions, projectPillars, reviewEvents, sitePages, type CriticPlaceholder } from "@/db/schema";
import type { PostStatus } from "@/config/post-status";
import { loadPack } from "./ai/pack";
import { parseAllowedLinks, parseBannedPhrases, runChecks, type CheckInput, type CheckResult } from "./checks";
import { editHunks } from "./edit-diff";
import { approvalState, composeMarkdown, sameText, slugFormatProblem, slugify, splitDraft, type PostText } from "./review-rules";
import { isUuid } from "./validation";

// Review (design decision 17, γ5 orientation Q1, Q2, Q7). Amir's saves become post_versions; the writer's drafts
// are never changed. A post's current text is the newest saved version of its newest run, or else that run's
// last draft.

export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewError";
  }
}

// Statuses in which the text can be edited and the post approved or rejected.
export const EDITABLE_STATUSES: readonly PostStatus[] = ["in_review", "flagged"];
// Publishing details stay editable after approval, until γ6 publishes.
export const DETAILS_STATUSES: readonly PostStatus[] = ["in_review", "flagged", "approved"];

export const NOTE_MAX = 2000;
export const TITLE_MAX = 200;

type Draft = typeof postDrafts.$inferSelect;
type Version = typeof postVersions.$inferSelect;

export type CurrentText = {
  text: PostText;
  // Where the current text came from: Amir's saved version, or the writer's draft.
  source: { kind: "version"; version: Version } | { kind: "draft"; draft: Draft };
  writerDraft: Draft;
  generationId: string;
};

async function latestGenerationId(db: Executor, postId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: postGenerations.id })
    .from(postGenerations)
    .where(eq(postGenerations.postId, postId))
    .orderBy(desc(postGenerations.createdAt))
    .limit(1);
  return row?.id ?? null;
}

// The newest run that produced a draft (a running regenerate has none yet, so Review shows the one before it).
async function draftedGeneration(db: Executor, postId: string): Promise<{ generationId: string; draft: Draft } | null> {
  const [row] = await db
    .select({ draft: postDrafts })
    .from(postDrafts)
    .innerJoin(postGenerations, eq(postGenerations.id, postDrafts.generationId))
    .where(eq(postGenerations.postId, postId))
    .orderBy(desc(postGenerations.createdAt), desc(postDrafts.round))
    .limit(1);
  return row ? { generationId: row.draft.generationId, draft: row.draft } : null;
}

export async function currentText(postId: string, db: Executor = getDb()): Promise<CurrentText | null> {
  const drafted = await draftedGeneration(db, postId);
  if (!drafted) return null;
  const [version] = await db
    .select()
    .from(postVersions)
    .where(and(eq(postVersions.postId, postId), eq(postVersions.generationId, drafted.generationId)))
    .orderBy(desc(postVersions.version))
    .limit(1);
  if (version) {
    return {
      text: { title: version.title, excerpt: version.excerpt ?? "", body: version.bodyMd },
      source: { kind: "version", version },
      writerDraft: drafted.draft,
      generationId: drafted.generationId,
    };
  }
  return { text: splitDraft(drafted.draft.bodyMd), source: { kind: "draft", draft: drafted.draft }, writerDraft: drafted.draft, generationId: drafted.generationId };
}

// What the checks need for this post, from its spec and the current knowledge. Passed to the browser too, so the
// editor runs the same checks live.
export async function checkInputFor(postId: string, db: Database = getDb()): Promise<Omit<CheckInput, "markdown">> {
  const [row] = await db
    .select({ spec: postSpecs, projectId: posts.projectId })
    .from(postGenerations)
    .innerJoin(postSpecs, eq(postSpecs.id, postGenerations.specId))
    .innerJoin(posts, eq(posts.id, postGenerations.postId))
    .where(eq(postGenerations.postId, postId))
    .orderBy(desc(postGenerations.createdAt))
    .limit(1);
  if (!row) throw new ReviewError("This post has not been drafted yet.");
  const pack = await loadPack(row.projectId, db);
  let siteHost: string | undefined;
  try {
    siteHost = new URL(pack.siteUrl).host;
  } catch {
    siteHost = undefined;
  }
  return {
    lengthMin: row.spec.lengthMin,
    lengthMax: row.spec.lengthMax,
    faq: row.spec.faq ?? false,
    allowedLinks: parseAllowedLinks(pack.project?.allowed_links ?? ""),
    bannedPhrases: parseBannedPhrases(pack.agency?.banned_phrases ?? ""),
    siteHost,
    examples: [pack.client?.examples ?? "", pack.client?.counter_examples ?? ""],
  };
}

export function parsePostText(input: { title?: unknown; excerpt?: unknown; body?: unknown }): PostText {
  const text = {
    title: typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "",
    excerpt: typeof input.excerpt === "string" ? input.excerpt.replace(/\s+/g, " ").trim() : "",
    body: typeof input.body === "string" ? input.body.replace(/\r\n?/g, "\n").trim() : "",
  };
  if (!text.title) throw new ReviewError("Enter a title.");
  if (text.title.length > TITLE_MAX) throw new ReviewError(`Keep the title under ${TITLE_MAX} characters.`);
  if (!text.body) throw new ReviewError("The body is empty.");
  return text;
}

// Once Wix holds a draft of the post, its text and publishing details are fixed (γ6 orientation Q4).
export const WIX_HAS_IT = "Wix already has this post, so it can no longer be changed here. Change it in the Wix Blog.";

export async function wixHasDraft(tx: Executor, postId: string): Promise<boolean> {
  const [row] = await tx.select({ draftId: postPublications.wixDraftId }).from(postPublications).where(eq(postPublications.postId, postId));
  return Boolean(row?.draftId);
}

async function lockPost(tx: Executor, postId: string) {
  const [post] = await tx.select().from(posts).where(eq(posts.id, postId)).for("update");
  if (!post) throw new ReviewError("This post no longer exists.");
  return post;
}

async function insertVersion(tx: Executor, postId: string, generationId: string, text: PostText, checks: CheckResult): Promise<Version> {
  const [newest] = await tx
    .select({ version: sql<number>`coalesce(max(${postVersions.version}), 0)` })
    .from(postVersions)
    .where(eq(postVersions.postId, postId));
  const [row] = await tx
    .insert(postVersions)
    .values({
      postId,
      generationId,
      version: Number(newest.version) + 1,
      title: text.title,
      excerpt: text.excerpt || null,
      bodyMd: text.body,
      wordCount: checks.wordCount,
      checks,
    })
    .returning();
  return row;
}

// Saves Amir's edits as a new version, unless nothing changed. Returns the post's current version afterwards.
export async function saveVersion(postId: string, input: PostText, db: Database = getDb()): Promise<{ saved: boolean; checks: CheckResult }> {
  if (!isUuid(postId)) throw new ReviewError("This post no longer exists.");
  const checkInput = await checkInputFor(postId, db);
  return db.transaction(async (tx) => {
    const post = await lockPost(tx, postId);
    if (!EDITABLE_STATUSES.includes(post.status)) throw new ReviewError(lockedMessage(post.status));
    const current = await currentText(postId, tx);
    if (!current) throw new ReviewError("This post has not been drafted yet.");
    const checks = runChecks({ ...checkInput, markdown: composeMarkdown(input) });
    if (sameText(current.text, input)) return { saved: false, checks };
    await insertVersion(tx, postId, current.generationId, input, checks);
    await tx.update(posts).set({ updatedAt: sql`now()` }).where(eq(posts.id, postId));
    return { saved: true, checks };
  });
}

function lockedMessage(status: PostStatus): string {
  if (status === "approved") return "This post is approved. Reopen it for editing first.";
  if (status === "generating") return "The writer is working on this post. Wait for it to finish.";
  if (status === "published") return "This post is published and can no longer be edited here.";
  return "This post can no longer be edited.";
}

async function setStatus(tx: Executor, postId: string, status: PostStatus, extra: Partial<typeof posts.$inferInsert> = {}) {
  await tx
    .update(posts)
    .set({ status, generationStep: null, statusChangedAt: sql`now()`, updatedAt: sql`now()`, ...extra })
    .where(eq(posts.id, postId));
}

export type ApproveResult = { reviewEventId: string; hasEdits: boolean };

// Approve post: saves the text if it changed, refuses while placeholders, dashes or banned phrases remain,
// makes sure the post has a valid slug, and records the diff from the writer's last draft (decision 17).
export async function approvePost(postId: string, input: PostText, db: Database = getDb()): Promise<ApproveResult> {
  if (!isUuid(postId)) throw new ReviewError("This post no longer exists.");
  const checkInput = await checkInputFor(postId, db);
  return db.transaction(async (tx) => {
    const post = await lockPost(tx, postId);
    if (!EDITABLE_STATUSES.includes(post.status)) throw new ReviewError(lockedMessage(post.status));
    const current = await currentText(postId, tx);
    if (!current) throw new ReviewError("This post has not been drafted yet.");
    const markdown = composeMarkdown(input);
    const checks = runChecks({ ...checkInput, markdown });
    const state = approvalState(markdown, checks);
    if (!state.canApprove) throw new ReviewError(state.reason ?? "This post cannot be approved yet.");

    const version = sameText(current.text, input) && current.source.kind === "version" ? current.source.version : await insertVersion(tx, postId, current.generationId, input, checks);
    const slug = post.slug ?? (await freeSlug(tx, post.projectId, postId, slugify(input.title)));
    const writerMarkdown = composeMarkdown(splitDraft(current.writerDraft.bodyMd));
    const hunks = editHunks(writerMarkdown, markdown);
    await setStatus(tx, postId, "approved", { approvedAt: new Date(), slug });
    const [event] = await tx
      .insert(reviewEvents)
      .values({
        postId,
        action: "approve",
        versionId: version.id,
        draftId: current.writerDraft.id,
        diff: hunks,
        warnings: state.warnings.map((issue) => ({ check: issue.check, message: issue.message })),
      })
      .returning({ id: reviewEvents.id });
    return { reviewEventId: event.id, hasEdits: hunks.length > 0 };
  });
}

export async function rejectPost(postId: string, note: string, db: Database = getDb()): Promise<void> {
  const trimmed = note.trim();
  if (!trimmed) throw new ReviewError("Say why you are rejecting this post.");
  if (trimmed.length > NOTE_MAX) throw new ReviewError(`Keep the note under ${NOTE_MAX} characters.`);
  if (!isUuid(postId)) throw new ReviewError("This post no longer exists.");
  await db.transaction(async (tx) => {
    const post = await lockPost(tx, postId);
    if (!EDITABLE_STATUSES.includes(post.status)) throw new ReviewError(lockedMessage(post.status));
    await setStatus(tx, postId, "rejected");
    await tx.insert(reviewEvents).values({ postId, action: "reject", note: trimmed });
  });
}

// Reopen for editing (orientation approval): an approved post that is not yet published goes back to Needs review.
export async function reopenPost(postId: string, db: Database = getDb()): Promise<void> {
  if (!isUuid(postId)) throw new ReviewError("This post no longer exists.");
  await db.transaction(async (tx) => {
    const post = await lockPost(tx, postId);
    if (post.status !== "approved") throw new ReviewError(post.status === "published" ? "Published posts cannot be reopened." : "Only approved posts can be reopened.");
    if (await wixHasDraft(tx, postId)) throw new ReviewError(WIX_HAS_IT);
    await setStatus(tx, postId, "in_review", { approvedAt: null });
    await tx.insert(reviewEvents).values({ postId, action: "reopen" });
  });
}

// ---- Regenerate with a note (γ5 orientation Q4) ----

// Statuses a post can be regenerated from. A rejected post can come back this way.
export const REGENERATE_STATUSES: readonly PostStatus[] = ["in_review", "flagged", "rejected"];

// Saves the text as a version (so nothing typed is lost and the writer starts from exactly it), then queues a new
// run with the note. Returns the generation to start.
export async function queueRegeneration(postId: string, note: string, input: PostText | null, db: Database = getDb()): Promise<string> {
  const trimmed = note.trim();
  if (!trimmed) throw new ReviewError("Say what the writer should change.");
  if (trimmed.length > NOTE_MAX) throw new ReviewError(`Keep the note under ${NOTE_MAX} characters.`);
  if (!isUuid(postId)) throw new ReviewError("This post no longer exists.");
  const checkInput = await checkInputFor(postId, db);
  return db.transaction(async (tx) => {
    const post = await lockPost(tx, postId);
    if (!REGENERATE_STATUSES.includes(post.status)) throw new ReviewError(lockedMessage(post.status));
    const current = await currentText(postId, tx);
    if (!current) throw new ReviewError("This post has not been drafted yet.");
    const text = input ?? current.text;
    const base =
      current.source.kind === "version" && sameText(current.text, text)
        ? current.source.version
        : await insertVersion(tx, postId, current.generationId, text, runChecks({ ...checkInput, markdown: composeMarkdown(text) }));
    const [previous] = await tx.select().from(postGenerations).where(eq(postGenerations.id, current.generationId));
    const [generation] = await tx
      .insert(postGenerations)
      .values({ postId, specId: previous.specId, batchId: previous.batchId, note: trimmed, baseVersionId: base.id })
      .returning({ id: postGenerations.id });
    await setStatus(tx, postId, "generating");
    await tx.insert(reviewEvents).values({ postId, action: "regenerate", note: trimmed, versionId: base.id, draftId: current.writerDraft.id });
    return generation.id;
  });
}

// ---- Publishing details ----

export async function slugProblem(tx: Executor, projectId: string, postId: string, slug: string): Promise<string | null> {
  const format = slugFormatProblem(slug);
  if (format) return format;
  const [taken] = await tx
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.projectId, projectId), eq(posts.slug, slug), ne(posts.id, postId)));
  if (taken) return "Another post in this project already uses this slug.";
  const [page] = await tx
    .select({ id: sitePages.id })
    .from(sitePages)
    .where(and(eq(sitePages.projectId, projectId), inArray(sitePages.path, [`/blog/${slug}`, `/${slug}`])));
  if (page) return "A page on the site already uses this address.";
  return null;
}

// The title's slug, or the first free one with a number on the end.
async function freeSlug(tx: Executor, projectId: string, postId: string, base: string): Promise<string> {
  const start = base || "post";
  for (let n = 1; n < 50; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = `${start.slice(0, 80 - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!(await slugProblem(tx, projectId, postId, candidate))) return candidate;
  }
  throw new ReviewError("Could not find a free slug for this post. Enter one by hand.");
}

export type DetailsInput = { slug: string; pillarId: string | null };

export async function savePublishingDetails(postId: string, input: DetailsInput, db: Database = getDb()): Promise<void> {
  if (!isUuid(postId)) throw new ReviewError("This post no longer exists.");
  await db.transaction(async (tx) => {
    const post = await lockPost(tx, postId);
    if (!DETAILS_STATUSES.includes(post.status)) throw new ReviewError("Publishing details can be changed in Review or once approved, before publishing.");
    if (await wixHasDraft(tx, postId)) throw new ReviewError(WIX_HAS_IT);
    const slug = input.slug.trim().toLowerCase();
    const problem = await slugProblem(tx, post.projectId, postId, slug);
    if (problem) throw new ReviewError(problem);
    if (input.pillarId) {
      const [pillar] = await tx
        .select({ id: projectPillars.id })
        .from(projectPillars)
        .where(and(eq(projectPillars.id, input.pillarId), eq(projectPillars.projectId, post.projectId)));
      if (!pillar) throw new ReviewError("That pillar no longer exists. Reload the page.");
    }
    await tx.update(posts).set({ slug, pillarId: input.pillarId, updatedAt: sql`now()` }).where(eq(posts.id, postId));
  });
}

// The slug shown before Amir has saved one: from the title, made unique.
export async function suggestedSlug(postId: string, projectId: string, title: string, db: Database = getDb()): Promise<string> {
  return freeSlug(db, projectId, postId, slugify(title));
}

// ---- What Review shows beside the text ----

export type PlaceholderAsk = CriticPlaceholder;

// The critic's asks for the newest critic verdict on the run, matched to placeholders by their text.
export async function placeholderAsks(generationId: string, db: Database = getDb()): Promise<PlaceholderAsk[]> {
  const [row] = await db
    .select({ placeholders: criticVerdicts.placeholders })
    .from(criticVerdicts)
    .innerJoin(postDrafts, eq(postDrafts.id, criticVerdicts.draftId))
    .where(eq(postDrafts.generationId, generationId))
    .orderBy(desc(postDrafts.round))
    .limit(1);
  return row?.placeholders ?? [];
}

export async function listReviewEvents(postId: string, db: Database = getDb()) {
  return db.select().from(reviewEvents).where(eq(reviewEvents.postId, postId)).orderBy(asc(reviewEvents.createdAt));
}

export { latestGenerationId };
