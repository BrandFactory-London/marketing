import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { derivatives, posts, projects } from "@/db/schema";
import * as derivativePrompt from "@/prompts/derivative";
import { AiClient, type Transport } from "./ai/client";
import { loadPack } from "./ai/pack";
import { parseBannedPhrases } from "./checks";
import { checkDerivative, CHANNELS, type DerivativeChannel, type DerivativeChecks } from "./derivative-checks";
import { failureMessage } from "./generation";
import { plannedUrl } from "./publish-url";
import { currentText } from "./review";
import { getModelSettings } from "./settings";
import { isUuid } from "./validation";

// GMB and LinkedIn copy (design decision 20, γ6 orientation Q6). Every generation and every saved edit is a version;
// nothing is overwritten. The model call runs in the write-derivative task, like every model call.

export class DerivativeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DerivativeError";
  }
}

export const DERIVATIVE_EFFORT = "medium" as const;
export const DERIVATIVE_MAX_TOKENS = 4000;
export const DERIVATIVE_TEXT_MAX = 5000;
// A version still "writing" after this long stopped without reporting.
export const STALE_DERIVATIVE_MS = 10 * 60_000;
export const DERIVATIVE_STATUSES = ["approved", "published"] as const;

export function isChannel(value: unknown): value is DerivativeChannel {
  return typeof value === "string" && value in CHANNELS;
}

type Row = typeof derivatives.$inferSelect;

async function nextVersion(db: Database, postId: string, channel: DerivativeChannel): Promise<number> {
  const [row] = await db
    .select({ version: sql<number>`coalesce(max(${derivatives.version}), 0)` })
    .from(derivatives)
    .where(and(eq(derivatives.postId, postId), eq(derivatives.channel, channel)));
  return Number(row.version) + 1;
}

async function loadPost(db: Database, postId: string) {
  if (!isUuid(postId)) throw new DerivativeError("This post no longer exists.");
  const [row] = await db.select({ post: posts, siteUrl: projects.siteUrl }).from(posts).innerJoin(projects, eq(projects.id, posts.projectId)).where(eq(posts.id, postId));
  if (!row) throw new DerivativeError("This post no longer exists.");
  if (!(DERIVATIVE_STATUSES as readonly string[]).includes(row.post.status)) throw new DerivativeError("GMB and LinkedIn posts are written from approved or published posts.");
  return row;
}

// The link the copy points to: the live URL once published, else where the post will be.
export function derivativeLink(post: { liveUrl: string | null; slug: string | null }, siteUrl: string): string | null {
  return post.liveUrl ?? (post.slug ? plannedUrl(siteUrl, post.slug) : null);
}

export function isStaleDerivative(row: Pick<Row, "status" | "createdAt">, now: Date = new Date()): boolean {
  return row.status === "writing" && now.getTime() - row.createdAt.getTime() > STALE_DERIVATIVE_MS;
}

// Queues a model version for one channel. Returns the row the task fills in.
export async function queueDerivative(postId: string, channel: DerivativeChannel, note: string | null, db: Database = getDb()): Promise<string> {
  const { post, siteUrl } = await loadPost(db, postId);
  if (!derivativeLink(post, siteUrl)) throw new DerivativeError("Save a slug in Publishing details first, so the copy can link to the post.");
  const trimmed = note?.trim() || null;
  if (trimmed && trimmed.length > 1000) throw new DerivativeError("Keep the note under 1,000 characters.");
  return db.transaction(async (tx) => {
    await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).for("update");
    const [writing] = await tx
      .select()
      .from(derivatives)
      .where(and(eq(derivatives.postId, postId), eq(derivatives.channel, channel), eq(derivatives.status, "writing")));
    if (writing && !isStaleDerivative(writing)) throw new DerivativeError(`The ${CHANNELS[channel].label} is already being written.`);
    if (writing) await tx.update(derivatives).set({ status: "failed", error: "Stopped reporting.", updatedAt: sql`now()` }).where(eq(derivatives.id, writing.id));
    const [row] = await tx
      .insert(derivatives)
      .values({ postId, channel, version: await nextVersion(tx as unknown as Database, postId, channel), status: "writing", source: "model", note: trimmed })
      .returning({ id: derivatives.id });
    return row.id;
  });
}

export async function setDerivativeRun(derivativeId: string, runId: string, db: Database = getDb()): Promise<void> {
  await db.update(derivatives).set({ triggerRunId: runId, updatedAt: sql`now()` }).where(eq(derivatives.id, derivativeId));
}

export async function failDerivative(derivativeId: string, error: unknown, db: Database = getDb()): Promise<void> {
  await db
    .update(derivatives)
    .set({ status: "failed", error: failureMessage(error), updatedAt: sql`now()` })
    .where(and(eq(derivatives.id, derivativeId), eq(derivatives.status, "writing")));
}

export type DerivativeDeps = { db: Database; transport: Transport };

// Runs in the write-derivative task: one call, the scripted checks, and one fix round if they fail. A version that
// still fails is shown with its failures as warnings (γ6 orientation Q6). Does nothing if the version is no longer
// being written, so a retried run never pays twice.
export async function writeDerivative(derivativeId: string, deps: DerivativeDeps): Promise<DerivativeChecks | null> {
  const { db } = deps;
  const [row] = await db.select().from(derivatives).where(eq(derivatives.id, derivativeId));
  if (!row || row.status !== "writing" || row.body) return null;
  const { post, siteUrl } = await loadPost(db, row.postId);
  const text = await currentText(post.id, db);
  if (!text) throw new DerivativeError("This post has no text.");
  const postUrl = derivativeLink(post, siteUrl)!;
  const pack = await loadPack(post.projectId, db);
  const bannedPhrases = parseBannedPhrases(pack.agency?.banned_phrases ?? "");
  const { derivativeModel } = await getModelSettings(db);
  const client = new AiClient(db, deps.transport);
  const user = derivativePrompt.derivativeUserMessage({ channel: row.channel, title: text.text.title, excerpt: text.text.excerpt, body: text.text.body, postUrl, note: row.note });
  const request = {
    purpose: "derivative" as const,
    model: derivativeModel,
    promptVersion: derivativePrompt.PROMPT_VERSION,
    effort: DERIVATIVE_EFFORT,
    maxTokens: DERIVATIVE_MAX_TOKENS,
    pack: pack.text,
    instructions: derivativePrompt.INSTRUCTIONS,
    batchId: post.batchId,
    postId: post.id,
  };
  let result = await client.text({ ...request, user });
  let body = result.text.trim();
  let checks = checkDerivative(body, row.channel, { bannedPhrases, postUrl });
  if (!checks.passed) {
    result = await client.text({ ...request, user: `${user}\n\n${derivativePrompt.derivativeFixMessage(body, checks.issues)}` });
    body = result.text.trim();
    checks = checkDerivative(body, row.channel, { bannedPhrases, postUrl });
  }
  await db
    .update(derivatives)
    .set({ status: "ready", body, checks, aiCallId: result.call.id, error: null, updatedAt: sql`now()` })
    .where(and(eq(derivatives.id, derivativeId), eq(derivatives.status, "writing")));
  return checks;
}

// Save edit: Amir's text becomes a new version, checked the same way.
export async function saveDerivativeEdit(postId: string, channel: DerivativeChannel, body: string, db: Database = getDb()): Promise<DerivativeChecks> {
  const { post, siteUrl } = await loadPost(db, postId);
  const text = body.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new DerivativeError("The text is empty.");
  if (text.length > DERIVATIVE_TEXT_MAX) throw new DerivativeError(`Keep it under ${DERIVATIVE_TEXT_MAX.toLocaleString("en-GB")} characters.`);
  const [latest] = await db
    .select()
    .from(derivatives)
    .where(and(eq(derivatives.postId, postId), eq(derivatives.channel, channel)))
    .orderBy(desc(derivatives.version))
    .limit(1);
  if (latest?.status === "writing" && !isStaleDerivative(latest)) throw new DerivativeError(`The ${CHANNELS[channel].label} is being written. Wait for it to finish.`);
  const pack = await loadPack(post.projectId, db);
  const checks = checkDerivative(text, channel, { bannedPhrases: parseBannedPhrases(pack.agency?.banned_phrases ?? ""), postUrl: derivativeLink(post, siteUrl) ?? "" });
  if (latest?.body === text) return checks;
  await db.insert(derivatives).values({ postId, channel, version: await nextVersion(db, postId, channel), status: "ready", source: "edit", body: text, checks });
  return checks;
}

export type DerivativeView = { channel: DerivativeChannel; latest: Row | null; versions: number };

export async function derivativeViews(postId: string, db: Database = getDb()): Promise<DerivativeView[]> {
  if (!isUuid(postId)) return [];
  const rows = await db.select().from(derivatives).where(eq(derivatives.postId, postId)).orderBy(desc(derivatives.version));
  return (Object.keys(CHANNELS) as DerivativeChannel[]).map((channel) => {
    const own = rows.filter((row) => row.channel === channel);
    return { channel, latest: own[0] ?? null, versions: own.length };
  });
}
