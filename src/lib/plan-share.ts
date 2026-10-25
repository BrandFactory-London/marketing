import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { clients, planFeedback, planItems, planShares, posts, projects, runChannels, runs, derivedSlots } from "@/db/schema";
import { CONTENT_TYPES, DERIVED_TYPES, type DerivedType } from "@/config/content-types";
import { CLIENT_LINES } from "@/config/run-status";
import { currentItems, NOTE_MAX } from "./planner";
import { isUuid } from "./validation";

// The client link (Phase 2 A3, orientation Q6). The token is shown once; only its SHA-256 is stored. A link lasts 60
// days, a new link revokes the old one, and an unknown, revoked or expired token gets the same page, so nothing can be
// learnt by guessing. The client sees titles, excerpts and dates only: never reasons, costs, models or notes.

export const SHARE_DAYS = 60;
export const PER_HOUR = 30;
export const PER_LINK = 200;
export const NAME_MAX = 80;

export class ShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareError";
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// A hash of the client's address, salted, so repeat abuse can be seen without storing the address.
export function hashIp(ip: string | null, secret: string = process.env.AUTH_SECRET ?? "bfm"): string | null {
  return ip ? createHash("sha256").update(`${secret}:${ip}`).digest("hex").slice(0, 32) : null;
}

function isToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export async function createShare(runId: string, db: Database = getDb(), now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  if (!isUuid(runId)) throw new ShareError("This run no longer exists.");
  const [run] = await db.select({ id: runs.id, imported: runs.imported }).from(runs).where(eq(runs.id, runId));
  if (!run) throw new ShareError("This run no longer exists.");
  const items = await currentItems(db, runId);
  if (items.length === 0) throw new ShareError("Plan the run before sharing it.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SHARE_DAYS * 86_400_000);
  await db.transaction(async (tx) => {
    await tx.update(planShares).set({ revokedAt: now }).where(and(eq(planShares.runId, runId), isNull(planShares.revokedAt)));
    await tx.insert(planShares).values({ runId, tokenHash: hashToken(token), expiresAt });
  });
  return { token, expiresAt };
}

export async function revokeShares(runId: string, db: Database = getDb()): Promise<void> {
  if (!isUuid(runId)) return;
  await db.update(planShares).set({ revokedAt: sql`now()` }).where(and(eq(planShares.runId, runId), isNull(planShares.revokedAt)));
}

type Share = typeof planShares.$inferSelect;

// The link's share while it is active, or null.
export async function activeShare(token: unknown, db: Database = getDb(), now: Date = new Date()): Promise<Share | null> {
  if (!isToken(token)) return null;
  const [share] = await db
    .select()
    .from(planShares)
    .where(and(eq(planShares.tokenHash, hashToken(token)), isNull(planShares.revokedAt), gt(planShares.expiresAt, now)));
  return share ?? null;
}

export type PublicPlan = {
  clientName: string;
  projectName: string;
  runName: string;
  startsOn: string;
  endsOn: string;
  items: { id: string; date: string; title: string; excerpt: string }[];
  derived: { label: string; count: number }[];
  approvedBy: string | null;
  approvedAt: Date | null;
  // After activation the link still shows the plan but takes no more feedback.
  open: boolean;
  expiresAt: Date;
};

// What the client sees. Records the visit.
export async function publicPlan(token: unknown, db: Database = getDb(), now: Date = new Date()): Promise<PublicPlan | null> {
  const share = await activeShare(token, db, now);
  if (!share) return null;
  await db.update(planShares).set({ lastViewedAt: now }).where(eq(planShares.id, share.id));
  const [row] = await db
    .select({ run: runs, projectName: projects.name, clientName: clients.name })
    .from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(runs.id, share.runId));
  if (!row) return null;
  const items = await currentItems(db, share.runId);
  const dates = items.length
    ? await db.select({ id: posts.id, slotDate: posts.slotDate }).from(posts).where(eq(posts.runId, share.runId))
    : [];
  const channels = await db.select().from(runChannels).where(eq(runChannels.runId, share.runId));
  const slots = await db.select({ contentType: derivedSlots.contentType, n: count() }).from(derivedSlots).where(eq(derivedSlots.runId, share.runId)).groupBy(derivedSlots.contentType);
  return {
    clientName: row.clientName,
    projectName: row.projectName,
    runName: row.run.name,
    startsOn: row.run.startsOn,
    endsOn: row.run.endsOn,
    items: items
      .map((item) => ({ id: item.id, date: dates.find((post) => post.id === item.postId)?.slotDate ?? "", title: item.title, excerpt: item.excerpt }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    derived: DERIVED_TYPES.filter((type) => channels.some((channel) => channel.contentType === type))
      .map((type) => ({ label: CONTENT_TYPES[type as DerivedType].label, count: Number(slots.find((slot) => slot.contentType === type)?.n ?? 0) }))
      .filter((item) => item.count > 0),
    approvedBy: row.run.clientApprovedBy,
    approvedAt: row.run.clientApprovedAt,
    open: row.run.status !== "active",
    expiresAt: share.expiresAt,
  };
}

export type FeedbackInput = { kind: unknown; itemId?: unknown; name: unknown; body?: unknown; website?: unknown };
export type FeedbackResult = { feedbackId: string | null; kind: "comment" | "suggest" | "approve" };

// A comment, a suggestion or the approval, through the link. The honeypot ("website") is a field people never see; a
// submission that fills it is answered as if saved and stored nowhere.
export async function submitFeedback(token: unknown, input: FeedbackInput, ip: string | null, db: Database = getDb(), now: Date = new Date()): Promise<FeedbackResult> {
  const share = await activeShare(token, db, now);
  if (!share) throw new ShareError("This link is not active.");
  const kind = input.kind === "approve" || input.kind === "suggest" ? input.kind : input.kind === "comment" ? "comment" : null;
  if (!kind) throw new ShareError("Choose what you want to send.");
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new ShareError("Enter your name.");
  if (name.length > NAME_MAX) throw new ShareError("Keep your name under 80 characters.");
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (kind !== "approve" && !body) throw new ShareError(kind === "suggest" ? "Write your suggestion." : "Write your comment.");
  if (body.length > NOTE_MAX) throw new ShareError("Keep it under 2,000 characters.");
  if (typeof input.website === "string" && input.website.trim()) return { feedbackId: null, kind };

  const [run] = await db.select().from(runs).where(eq(runs.id, share.runId));
  if (!run || run.status === "active") throw new ShareError("This plan is final, so it takes no more comments. Contact BrandFactory London directly.");
  const [{ hour }] = await db
    .select({ hour: count() })
    .from(planFeedback)
    .where(and(eq(planFeedback.shareId, share.id), gt(planFeedback.createdAt, new Date(now.getTime() - 3_600_000))));
  if (hour >= PER_HOUR) throw new ShareError("Too many messages in the last hour. Try again later.");
  const [{ all }] = await db.select({ all: count() }).from(planFeedback).where(eq(planFeedback.shareId, share.id));
  if (all >= PER_LINK) throw new ShareError("This link has taken all the messages it can. Contact BrandFactory London directly.");

  let item: { id: string; postId: string } | null = null;
  if (kind !== "approve" && input.itemId) {
    if (!isUuid(input.itemId)) throw new ShareError("That planned post is no longer in the plan.");
    const current = await currentItems(db, share.runId);
    const found = current.find((row) => row.id === input.itemId);
    if (!found) throw new ShareError("That planned post has changed since you opened the plan. Reload the page.");
    item = { id: found.id, postId: found.postId };
  }
  const [row] = await db
    .insert(planFeedback)
    .values({ runId: share.runId, shareId: share.id, planItemId: item?.id ?? null, postId: item?.postId ?? null, kind, name, body: body || null, ipHash: hashIp(ip) })
    .returning({ id: planFeedback.id });
  if (kind === "approve") await db.update(runs).set({ clientApprovedAt: now, clientApprovedBy: name, updatedAt: sql`now()` }).where(eq(runs.id, share.runId));
  return { feedbackId: row.id, kind };
}

// ---- For Amir, on the Run plan tab ----

export type ClientFeedback = typeof planFeedback.$inferSelect & { itemTitle: string | null };

export async function clientFeedback(runId: string, db: Database = getDb()): Promise<ClientFeedback[]> {
  if (!isUuid(runId)) return [];
  return db
    .select({ feedback: planFeedback, itemTitle: planItems.title })
    .from(planFeedback)
    .leftJoin(planItems, eq(planItems.id, planFeedback.planItemId))
    .where(and(eq(planFeedback.runId, runId), ne(planFeedback.kind, "note")))
    .orderBy(asc(planFeedback.createdAt))
    .then((rows) => rows.map((row) => ({ ...row.feedback, itemTitle: row.itemTitle })));
}

export async function unseenCount(projectId: string, db: Database = getDb()): Promise<number> {
  if (!isUuid(projectId)) return 0;
  const [{ n }] = await db
    .select({ n: count() })
    .from(planFeedback)
    .innerJoin(runs, eq(runs.id, planFeedback.runId))
    .where(and(eq(runs.projectId, projectId), ne(planFeedback.kind, "note"), isNull(planFeedback.seenAt)));
  return Number(n);
}

export async function markSeen(runId: string, db: Database = getDb()): Promise<void> {
  if (!isUuid(runId)) return;
  await db.update(planFeedback).set({ seenAt: sql`now()` }).where(and(eq(planFeedback.runId, runId), isNull(planFeedback.seenAt), ne(planFeedback.kind, "note")));
}

export type ShareState = { line: (typeof CLIENT_LINES)[keyof typeof CLIENT_LINES]; expiresAt: Date | null; lastViewedAt: Date | null };

// The client line on the run header (orientation Q8).
export async function shareState(runId: string, db: Database = getDb(), now: Date = new Date()): Promise<ShareState> {
  const [run] = await db.select({ clientApprovedAt: runs.clientApprovedAt }).from(runs).where(eq(runs.id, runId));
  const [share] = await db.select().from(planShares).where(eq(planShares.runId, runId)).orderBy(desc(planShares.createdAt)).limit(1);
  const live = share && !share.revokedAt && share.expiresAt > now ? share : null;
  const feedback = await clientFeedback(runId, db);
  const line = run?.clientApprovedAt
    ? CLIENT_LINES.approved
    : feedback.length > 0
      ? CLIENT_LINES.commented
      : live?.lastViewedAt
        ? CLIENT_LINES.viewed
        : live
          ? CLIENT_LINES.sent
          : CLIENT_LINES.notSent;
  return { line, expiresAt: live?.expiresAt ?? null, lastViewedAt: live?.lastViewedAt ?? null };
}

