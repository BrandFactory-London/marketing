import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { derivatives, derivedSlots, posts, projects } from "@/db/schema";
import * as derivativePrompt from "@/prompts/derivative";
import { AiClient, type Transport } from "./ai/client";
import { channelRules, loadPack, withChannelRules } from "./ai/pack";
import { parseBannedPhrases } from "./checks";
import { checkDerivative, CHANNELS, DERIVATIVE_CHANNELS, parsePin, pinText, type DerivativeChannel, type DerivativeChecks, type DerivativeText } from "./derivative-checks";
import { failureMessage } from "./generation";
import { plannedUrl } from "./publish-url";
import { currentText } from "./review";
import { getModelSettings } from "./settings";
import { isUuid } from "./validation";

// Derivative copy: GBP, LinkedIn, Facebook and Pinterest (design decision 20, γ6 orientation Q6, γ7 orientation Q5).
// Every generation and every saved edit is a version; nothing is overwritten. The model call runs in the
// write-derivative task, like every model call.

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
export const NOTE_MAX = 1000;

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
  if (!(DERIVATIVE_STATUSES as readonly string[]).includes(row.post.status)) throw new DerivativeError("Derivatives are written from approved or published posts.");
  return row;
}

// The link the copy points to: the live URL once published, else where the post will be.
export function derivativeLink(post: { liveUrl: string | null; slug: string | null }, siteUrl: string): string | null {
  return post.liveUrl ?? (post.slug ? plannedUrl(siteUrl, post.slug) : null);
}

export function isStaleDerivative(row: Pick<Row, "status" | "createdAt">, now: Date = new Date()): boolean {
  return row.status === "writing" && now.getTime() - row.createdAt.getTime() > STALE_DERIVATIVE_MS;
}

// Queues a model version for one channel. Returns the row the task fills in. Once the channel has text, a regenerate
// must say what was wrong with it (γ7 handoff item 1); a first generation, or a retry after a run that wrote nothing,
// needs no note.
export async function queueDerivative(postId: string, channel: DerivativeChannel, note: string | null, db: Database = getDb()): Promise<string> {
  const { post, siteUrl } = await loadPost(db, postId);
  if (!derivativeLink(post, siteUrl)) throw new DerivativeError("Save a slug in Publishing details first, so the copy can link to the post.");
  const trimmed = note?.trim() || null;
  if (trimmed && trimmed.length > NOTE_MAX) throw new DerivativeError("Keep the note under 1,000 characters.");
  return db.transaction(async (tx) => {
    await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).for("update");
    const [writing] = await tx
      .select()
      .from(derivatives)
      .where(and(eq(derivatives.postId, postId), eq(derivatives.channel, channel), eq(derivatives.status, "writing")));
    if (writing && !isStaleDerivative(writing)) throw new DerivativeError(`The ${CHANNELS[channel].label} is already being written.`);
    if (!trimmed) {
      const [written] = await tx
        .select({ id: derivatives.id })
        .from(derivatives)
        .where(and(eq(derivatives.postId, postId), eq(derivatives.channel, channel), isNotNull(derivatives.body)))
        .limit(1);
      if (written) throw new DerivativeError("Say what was wrong with this version.");
    }
    if (writing) await tx.update(derivatives).set({ status: "failed", error: "Stopped reporting.", updatedAt: sql`now()` }).where(eq(derivatives.id, writing.id));
    const [row] = await tx
      .insert(derivatives)
      .values({ postId, channel, version: await nextVersion(tx as unknown as Database, postId, channel), status: "writing", source: "model", note: trimmed })
      .returning({ id: derivatives.id });
    return row.id;
  });
}

// Generate all (γ7 handoff item 8): queues every channel that has no version yet. Returns the rows to start.
export async function queueMissingDerivatives(postId: string, db: Database = getDb()): Promise<{ channel: DerivativeChannel; id: string }[]> {
  await loadPost(db, postId);
  const rows = await db.select({ channel: derivatives.channel }).from(derivatives).where(eq(derivatives.postId, postId));
  const missing = DERIVATIVE_CHANNELS.filter((channel) => !rows.some((row) => row.channel === channel));
  if (missing.length === 0) throw new DerivativeError("Every channel has a version already.");
  const queued = [];
  for (const channel of missing) queued.push({ channel, id: await queueDerivative(postId, channel, null, db) });
  return queued;
}

// Phase 2 A4 (orientation Q7): when an SEO post is approved, each channel the run gave it a derived slot for, and that
// has no version yet, is written in real time. Posts outside a run's plan have no derived slots, so nothing changes.
export async function queueDerivedSlots(postId: string, db: Database = getDb()): Promise<{ channel: DerivativeChannel; id: string }[]> {
  const slots = await db.select({ channel: derivedSlots.contentType }).from(derivedSlots).where(eq(derivedSlots.parentPostId, postId));
  if (slots.length === 0) return [];
  const rows = await db.select({ channel: derivatives.channel }).from(derivatives).where(eq(derivatives.postId, postId));
  const queued = [];
  for (const channel of DERIVATIVE_CHANNELS.filter((item) => slots.some((slot) => slot.channel === item) && !rows.some((row) => row.channel === item))) {
    queued.push({ channel, id: await queueDerivative(postId, channel, null, db) });
  }
  return queued;
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

// A model reply as a version's text: a pin is split into its title and description; a reply that cannot be split
// keeps the whole text as the description, and the checks say so.
function replyText(channel: DerivativeChannel, reply: string): { text: DerivativeText; unsplit: boolean } {
  if (channel !== "pinterest") return { text: { body: reply }, unsplit: false };
  const pin = parsePin(reply);
  return pin ? { text: pin, unsplit: false } : { text: { title: null, body: reply }, unsplit: true };
}

function checkReply(channel: DerivativeChannel, reply: string, options: { bannedPhrases: readonly string[]; postUrl: string }) {
  const { text, unsplit } = replyText(channel, reply);
  const checks = checkDerivative(text, channel, options);
  if (unsplit) {
    checks.issues.unshift({ check: "format", message: 'Reply as two lines, "Title:" then "Description:".' });
    checks.passed = false;
  }
  return { text, checks };
}

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
  const options = { bannedPhrases: parseBannedPhrases(pack.agency?.banned_phrases ?? ""), postUrl };
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
    // The channel's own rules and voice follow the instructions, outside the cached pack (γ7 orientation Q1).
    instructions: withChannelRules(derivativePrompt.INSTRUCTIONS, channelRules(pack, row.channel)),
    batchId: post.batchId,
    postId: post.id,
  };
  let result = await client.text({ ...request, user });
  let reply = checkReply(row.channel, result.text.trim(), options);
  if (!reply.checks.passed) {
    const previous = row.channel === "pinterest" && reply.text.title ? pinText(reply.text) : result.text.trim();
    result = await client.text({ ...request, user: `${user}\n\n${derivativePrompt.derivativeFixMessage(previous, reply.checks.issues)}` });
    reply = checkReply(row.channel, result.text.trim(), options);
  }
  await db
    .update(derivatives)
    .set({ status: "ready", title: reply.text.title ?? null, body: reply.text.body, checks: reply.checks, aiCallId: result.call.id, error: null, updatedAt: sql`now()` })
    .where(and(eq(derivatives.id, derivativeId), eq(derivatives.status, "writing")));
  return reply.checks;
}

function cleanText(input: string | DerivativeText, channel: DerivativeChannel): DerivativeText {
  const raw = typeof input === "string" ? { title: null, body: input } : input;
  const body = raw.body.replace(/\r\n?/g, "\n").trim();
  const title = channel === "pinterest" ? (raw.title ?? "").replace(/\s+/g, " ").trim() : null;
  if (!body) throw new DerivativeError(channel === "pinterest" ? "The description is empty." : "The text is empty.");
  if (channel === "pinterest" && !title) throw new DerivativeError("The pin title is empty.");
  if (body.length > DERIVATIVE_TEXT_MAX) throw new DerivativeError(`Keep it under ${DERIVATIVE_TEXT_MAX.toLocaleString("en-GB")} characters.`);
  return { title, body };
}

export type SavedEdit = { checks: DerivativeChecks; derivativeId: string | null; saved: boolean };

// Save edit: Amir's text becomes a new version, checked the same way. Saving the same text again changes nothing.
export async function saveDerivativeEdit(postId: string, channel: DerivativeChannel, input: string | DerivativeText, db: Database = getDb()): Promise<SavedEdit> {
  const { post, siteUrl } = await loadPost(db, postId);
  const text = cleanText(input, channel);
  const [latest] = await db
    .select()
    .from(derivatives)
    .where(and(eq(derivatives.postId, postId), eq(derivatives.channel, channel)))
    .orderBy(desc(derivatives.version))
    .limit(1);
  if (latest?.status === "writing" && !isStaleDerivative(latest)) throw new DerivativeError(`The ${CHANNELS[channel].label} is being written. Wait for it to finish.`);
  const pack = await loadPack(post.projectId, db);
  const checks = checkDerivative(text, channel, { bannedPhrases: parseBannedPhrases(pack.agency?.banned_phrases ?? ""), postUrl: derivativeLink(post, siteUrl) ?? "" });
  if (latest?.body === text.body && (latest.title ?? null) === (text.title ?? null)) return { checks, derivativeId: latest.id, saved: false };
  const [row] = await db
    .insert(derivatives)
    .values({ postId, channel, version: await nextVersion(db, postId, channel), status: "ready", source: "edit", title: text.title, body: text.body, checks })
    .returning({ id: derivatives.id });
  return { checks, derivativeId: row.id, saved: true };
}

// Copy (γ7 orientation Q3): unsaved changes are saved first, so what is posted is always a version. Returns the
// version copied, and whether it is Amir's edit, which is what the candidate run reads.
export async function copyDerivative(postId: string, channel: DerivativeChannel, input: string | DerivativeText, db: Database = getDb()): Promise<{ derivativeId: string | null; isEdit: boolean }> {
  const { derivativeId } = await saveDerivativeEdit(postId, channel, input, db);
  if (!derivativeId) return { derivativeId: null, isEdit: false };
  const [row] = await db.select({ source: derivatives.source }).from(derivatives).where(eq(derivatives.id, derivativeId));
  return { derivativeId, isEdit: row?.source === "edit" };
}

export type DerivativeView = { channel: DerivativeChannel; latest: Row | null; versions: number };

export async function derivativeViews(postId: string, db: Database = getDb()): Promise<DerivativeView[]> {
  if (!isUuid(postId)) return [];
  const rows = await db.select().from(derivatives).where(eq(derivatives.postId, postId)).orderBy(desc(derivatives.version));
  return DERIVATIVE_CHANNELS.map((channel) => {
    const own = rows.filter((row) => row.channel === channel);
    return { channel, latest: own[0] ?? null, versions: own.length };
  });
}
