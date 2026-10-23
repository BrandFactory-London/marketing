import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, type Database, type Executor } from "@/db/client";
import { postPublications, posts, projectPillars, projects, projectWix, publishEvents, type PublishStep } from "@/db/schema";
import { prepareCover } from "./cover-image";
import { plannedUrl } from "./publish-url";
import { DriveError, downloadFile, pathUnder } from "./drive";
import { getGoogleAccessToken, GoogleReconnectRequired } from "./google-tokens";
import { currentText } from "./review";
import { describeProblem, markdownToRicos, type RicosDocument } from "./ricos";
import { isUuid } from "./validation";
import { WixError } from "./wix";
import { describeWixError, wixClientFor, WixSetupError } from "./wix-credentials";

// Publish post (design decisions 18, 19; γ6 orientation Q3 to Q5). The steps run here, in the app, one after another:
// cover, tag, draft, publish. Every Wix ID is stored as soon as Wix returns it, so "Try again" resumes from the failed
// step and never creates a second post. The post becomes Published only when the live check (confirm-live) sees it.

export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishError";
  }
}

// A step that failed: which one, and what Google, Wix or the app said.
class StepFailure extends Error {
  constructor(
    readonly step: PublishStep,
    message: string,
    readonly httpStatus: number | null = null,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "StepFailure";
  }
}

export const COVER_FOLDER = "/BrandFactory covers";
// A publish that has not reported for this long is taken as stopped, so it can be tried again.
export const STALE_PUBLISH_MS = 3 * 60_000;

export type Publication = typeof postPublications.$inferSelect;

export async function getPublication(postId: string, db: Executor = getDb()): Promise<Publication | null> {
  if (!isUuid(postId)) return null;
  const [row] = await db.select().from(postPublications).where(eq(postPublications.postId, postId));
  return row ?? null;
}

export async function listPublishEvents(publicationId: string, db: Database = getDb()) {
  return db.select().from(publishEvents).where(eq(publishEvents.publicationId, publicationId)).orderBy(asc(publishEvents.createdAt));
}

// Once Wix holds a draft of the post, the post's text and publishing details are fixed: changing them here would not
// reach Wix (γ6 orientation Q4).
export async function hasWixDraft(postId: string, db: Executor = getDb()): Promise<boolean> {
  const publication = await getPublication(postId, db);
  return Boolean(publication?.wixDraftId);
}

export function isStalePublish(publication: Pick<Publication, "state" | "heartbeatAt">, now: Date = new Date()): boolean {
  return publication.state === "running" && (!publication.heartbeatAt || now.getTime() - publication.heartbeatAt.getTime() > STALE_PUBLISH_MS);
}

// ---- What the Publish card shows before the button ----

export type PublishPlan = {
  title: string;
  excerpt: string;
  slug: string | null;
  plannedUrl: string | null;
  pillar: { label: string; slug: string } | null;
  cover: { driveFileId: string; name: string; path: string | null } | null;
  author: string | null;
  // Everything that stops Publish post, in plain words. Empty when the post can be published.
  problems: string[];
  document: RicosDocument | null;
};

export async function publishPlan(postId: string, db: Database = getDb()): Promise<PublishPlan | null> {
  if (!isUuid(postId)) return null;
  const [row] = await db
    .select({ post: posts, siteUrl: projects.siteUrl, pillar: projectPillars, wix: projectWix })
    .from(posts)
    .innerJoin(projects, eq(projects.id, posts.projectId))
    .leftJoin(projectPillars, eq(projectPillars.id, posts.pillarId))
    .leftJoin(projectWix, eq(projectWix.projectId, posts.projectId))
    .where(eq(posts.id, postId));
  if (!row) return null;
  const current = await currentText(postId, db);
  if (!current) return null;
  const { post } = row;
  const problems: string[] = [];
  if (!row.wix) problems.push("This project has no Wix credentials. Add them in the project's Settings.");
  else if (!row.wix.memberId) problems.push("Choose the Wix author in the project's Settings.");
  if (!post.coverDriveFileId) problems.push("Choose a cover first.");
  if (!row.pillar) problems.push("Choose a pillar tag in Publishing details, so the post appears on its resources page.");
  if (!post.slug) problems.push("Save a slug in Publishing details.");
  if (!current.text.excerpt.trim()) problems.push("The post has no excerpt, which becomes its meta description.");
  const conversion = markdownToRicos(current.text.body, { siteUrl: row.siteUrl });
  if (!conversion.ok) problems.push(...conversion.problems.map(describeProblem));
  return {
    title: current.text.title,
    excerpt: current.text.excerpt,
    slug: post.slug,
    plannedUrl: post.slug ? plannedUrl(row.siteUrl, post.slug) : null,
    pillar: row.pillar ? { label: row.pillar.label, slug: row.pillar.slug } : null,
    cover: post.coverDriveFileId ? { driveFileId: post.coverDriveFileId, name: post.coverName ?? "Photo", path: post.coverPath } : null,
    author: row.wix?.memberName ?? null,
    problems,
    document: conversion.ok ? conversion.document : null,
  };
}

export { plannedUrl };

// ---- Publish post ----

export type PublishDeps = {
  db?: Database;
  // Wix's fetch and Google's fetch, for the fakes in tests.
  wixFetch?: typeof fetch;
  googleFetch?: typeof fetch;
  // Starts the live check once Wix has the post. Returns the Trigger.dev run ID.
  startLiveCheck: (publicationId: string) => Promise<string>;
};

export type PublishOutcome = { ok: true; liveUrl: string } | { ok: false; step: PublishStep | null; message: string };

async function recordEvent(
  db: Database,
  publicationId: string,
  step: PublishStep,
  result: "ok" | "failed",
  extra: { httpStatus?: number | null; message?: string | null; requestId?: string | null; details?: Record<string, unknown> } = {},
) {
  await db.insert(publishEvents).values({
    publicationId,
    step,
    result,
    httpStatus: extra.httpStatus ?? null,
    message: extra.message ?? null,
    requestId: extra.requestId ?? null,
    details: extra.details ?? null,
  });
}

async function update(db: Database, publicationId: string, values: Partial<typeof postPublications.$inferInsert>) {
  await db
    .update(postPublications)
    .set({ ...values, heartbeatAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(postPublications.id, publicationId));
}

function fromWix(step: PublishStep, error: unknown): never {
  if (error instanceof WixError) throw new StepFailure(step, `Wix: ${describeWixError(error)}`, error.status, error.requestId);
  throw error;
}

// Claims the post for one publish run. Refuses while another run is going, and once Wix has the post.
async function claim(postId: string, db: Database): Promise<Publication> {
  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(eq(posts.id, postId)).for("update");
    if (!post) throw new PublishError("This post no longer exists.");
    if (post.status === "published") throw new PublishError("This post is already published.");
    if (post.status !== "approved") throw new PublishError("Only approved posts can be published.");
    const [existing] = await tx.select().from(postPublications).where(eq(postPublications.postId, postId));
    if (existing) {
      if (existing.state === "running" && !isStalePublish(existing)) throw new PublishError("Publishing is already in progress.");
      if (existing.state === "checking") throw new PublishError("Wix has the post. The live check is running.");
      if (existing.state === "not_confirmed") throw new PublishError("Wix has the post. Use Check again to look for it on the live site.");
      if (existing.state === "live") throw new PublishError("This post is already live.");
      const [row] = await tx
        .update(postPublications)
        .set({ state: "running", error: null, heartbeatAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(postPublications.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await tx.insert(postPublications).values({ postId, state: "running", heartbeatAt: new Date() }).returning();
    return row;
  });
}

export async function publishPost(postId: string, userId: string, deps: PublishDeps): Promise<PublishOutcome> {
  const db = deps.db ?? getDb();
  if (!isUuid(postId)) throw new PublishError("This post no longer exists.");
  const plan = await publishPlan(postId, db);
  if (!plan) throw new PublishError("This post no longer exists.");
  if (plan.problems.length > 0) throw new PublishError(plan.problems[0]);
  let publication = await claim(postId, db);
  const [row] = await db
    .select({ post: posts, project: projects, pillar: projectPillars, wix: projectWix })
    .from(posts)
    .innerJoin(projects, eq(projects.id, posts.projectId))
    .innerJoin(projectPillars, eq(projectPillars.id, posts.pillarId))
    .innerJoin(projectWix, eq(projectWix.projectId, posts.projectId))
    .where(eq(posts.id, postId));
  const { post, project, pillar, wix: wixRow } = row;
  const slug = post.slug!;
  const coverId = post.coverDriveFileId!;
  // The step being run, so an unexpected error is still reported against it.
  let step: PublishStep = "cover";

  try {
    const wix = await wixClientFor(project.id, { db, fetchImpl: deps.wixFetch }).catch((error) => {
      if (error instanceof WixSetupError) throw new StepFailure("cover", error.message);
      throw error;
    });

    // 1. Cover: reused when this Drive photo was uploaded already (γ6 orientation Q3).
    let wixFileId = publication.wixFileId;
    if (wixFileId && publication.coverDriveFileId === coverId) {
      await recordEvent(db, publication.id, "cover", "ok", { message: "Reused the cover already uploaded to Wix.", details: { wixFileId } });
    } else {
      let prepared;
      try {
        const { accessToken } = await getGoogleAccessToken(userId, { db, fetchImpl: deps.googleFetch });
        if (!project.driveFolderId) throw new StepFailure("cover", "This project has no Drive folder.");
        const found = await pathUnder(accessToken, coverId, project.driveFolderId, { fetchImpl: deps.googleFetch });
        if (!found) throw new StepFailure("cover", "The cover is no longer inside the project's Drive folder. Choose it again.");
        const download = await downloadFile(accessToken, coverId, { fetchImpl: deps.googleFetch });
        prepared = await prepareCover({ bytes: download.bytes, mimeType: download.mimeType || found.file.mimeType, fileName: found.file.name });
      } catch (error) {
        if (error instanceof StepFailure) throw error;
        if (error instanceof GoogleReconnectRequired) throw new StepFailure("cover", "Google needs you to sign in again before Drive can be read. Sign out, then sign in with Google.");
        if (error instanceof DriveError) throw new StepFailure("cover", `Google Drive: ${error.message}`, error.status);
        if (error instanceof Error) throw new StepFailure("cover", error.message);
        throw error;
      }
      const file = await wix.uploadImage({ bytes: prepared.bytes, mimeType: prepared.mimeType, fileName: prepared.fileName, filePath: COVER_FOLDER }).catch((error) => fromWix("cover", error));
      wixFileId = file.id;
      await update(db, publication.id, { wixFileId, coverDriveFileId: coverId, step: "cover" });
      await recordEvent(db, publication.id, "cover", "ok", {
        message: prepared.downscaled
          ? `Downscaled from ${(prepared.originalBytes / 1_000_000).toFixed(1)} MB to ${(prepared.bytes.byteLength / 1_000_000).toFixed(1)} MB and uploaded to Wix Media.`
          : "Uploaded to Wix Media.",
        details: { wixFileId, fileName: prepared.fileName, bytes: prepared.bytes.byteLength, downscaled: prepared.downscaled },
      });
    }

    step = "tag";
    // 2. Tag: the pillar's tag, looked up by slug every time. Tags are never created on Wix.
    const tags = await wix.queryTagsBySlug([pillar.slug]).catch((error) => fromWix("tag", error));
    const tag = tags.find((item) => item.slug === pillar.slug);
    if (!tag) throw new StepFailure("tag", `Wix has no tag with the slug ${pillar.slug}. Add it in the Wix Blog, or change the pillar.`);
    await update(db, publication.id, { wixTagId: tag.id, step: "tag" });
    await recordEvent(db, publication.id, "tag", "ok", { message: `${tag.label} (${tag.slug}).`, details: { wixTagId: tag.id } });

    step = "draft";
    // 3. Draft: created once. Its ID is stored before anything is public (γ6 orientation Q4).
    let draftId = publication.wixDraftId;
    if (draftId) {
      await recordEvent(db, publication.id, "draft", "ok", { message: "The Wix draft already exists.", details: { wixDraftId: draftId } });
    } else {
      const taken = await wix.getPostBySlug(slug).catch((error) => fromWix("draft", error));
      if (taken && taken.id !== publication.wixPostId) {
        throw new StepFailure("draft", `A post at /blog/${slug} already exists on Wix ("${taken.title}"). Change the slug in Publishing details, or check the Wix Blog.`);
      }
      // A draft Wix made while its reply was lost: same title and slug, not yet published.
      const drafts = await wix.queryDraftsByTitle(plan.title).catch((error) => fromWix("draft", error));
      const lost = drafts.find((draft) => draft.seoSlug === slug && draft.status !== "PUBLISHED");
      if (lost) {
        draftId = lost.id;
        await update(db, publication.id, { wixDraftId: draftId, step: "draft" });
        await recordEvent(db, publication.id, "draft", "ok", { message: "Found the draft from the earlier attempt on Wix.", details: { wixDraftId: draftId } });
      } else {
        const draft = await wix
          .createDraft({ title: plan.title, memberId: wixRow.memberId!, tagIds: [tag.id], excerpt: plan.excerpt, seoSlug: slug, richContent: plan.document, coverFileId: wixFileId! })
          .catch((error) => fromWix("draft", error));
        draftId = draft.id;
        await update(db, publication.id, { wixDraftId: draftId, step: "draft" });
        await recordEvent(db, publication.id, "draft", "ok", { message: "Draft created on Wix.", details: { wixDraftId: draftId } });
      }
    }

    step = "publish";
    // 4. Publish. Publishing a draft again updates the same post, so a retry here is safe.
    const wixPostId = await wix.publishDraft(draftId).catch((error) => fromWix("publish", error));
    await update(db, publication.id, { wixPostId, step: "publish" });
    const published = await wix.getPost(wixPostId).catch((error) => fromWix("publish", error));
    const wixSlug = published.slug || slug;
    const liveUrl = plannedUrl(project.siteUrl, wixSlug);
    await update(db, publication.id, { wixSlug, liveUrl, state: "checking", step: "live", checkStartedAt: new Date(), error: null });
    await recordEvent(db, publication.id, "publish", "ok", {
      message: wixSlug === slug ? "Wix published the post." : `Wix published the post at /blog/${wixSlug}, not /blog/${slug}.`,
      details: { wixPostId, wixSlug, wixUrl: published.url ?? null },
    });
    publication = (await getPublication(postId, db))!;

    // 5. The live check runs in Trigger.dev, so Amir can leave the page.
    try {
      const runId = await deps.startLiveCheck(publication.id);
      await update(db, publication.id, { triggerRunId: runId });
    } catch (error) {
      console.error("Could not start the live check:", error);
      await update(db, publication.id, { state: "not_confirmed", error: "Wix accepted the post, but the live check could not start. Use Check again." });
      await recordEvent(db, publication.id, "live", "failed", { message: "The live check could not start in Trigger.dev." });
    }
    return { ok: true, liveUrl };
  } catch (error) {
    const failure = error instanceof StepFailure ? error : new StepFailure(step, error instanceof Error ? error.message : String(error));
    if (!(error instanceof StepFailure)) console.error("Publish failed unexpectedly:", error);
    await update(db, publication.id, { state: "failed", step: failure.step, error: failure.message });
    await recordEvent(db, publication.id, failure.step, "failed", { httpStatus: failure.httpStatus, message: failure.message, requestId: failure.requestId });
    return { ok: false, step: failure.step, message: failure.message };
  }
}

// ---- Check again (γ6 orientation Q5) ----

export async function restartLiveCheck(postId: string, deps: Pick<PublishDeps, "db" | "startLiveCheck">): Promise<void> {
  const db = deps.db ?? getDb();
  const publication = await getPublication(postId, db);
  if (!publication || !publication.wixPostId) throw new PublishError("Wix does not have this post yet. Publish it first.");
  if (publication.state === "live") throw new PublishError("This post is already confirmed live.");
  if (publication.state === "checking" && !isStaleCheck(publication)) throw new PublishError("The live check is already running.");
  await update(db, publication.id, { state: "checking", step: "live", checkStartedAt: new Date(), error: null });
  try {
    const runId = await deps.startLiveCheck(publication.id);
    await update(db, publication.id, { triggerRunId: runId });
  } catch (error) {
    console.error("Could not start the live check:", error);
    await update(db, publication.id, { state: "not_confirmed", error: "The live check could not start. Try again in a moment." });
    throw new PublishError("The live check could not start. Try again in a moment.");
  }
}

// A check that has run far past its 5 minutes stopped without reporting (no worker, or a crash).
export const STALE_CHECK_MS = 10 * 60_000;

export function isStaleCheck(publication: Pick<Publication, "state" | "checkStartedAt">, now: Date = new Date()): boolean {
  return publication.state === "checking" && (!publication.checkStartedAt || now.getTime() - publication.checkStartedAt.getTime() > STALE_CHECK_MS);
}

export async function latestPublishFailure(publicationId: string, db: Database = getDb()) {
  const [row] = await db
    .select()
    .from(publishEvents)
    .where(eq(publishEvents.publicationId, publicationId))
    .orderBy(desc(publishEvents.createdAt))
    .limit(1);
  return row?.result === "failed" ? row : null;
}
