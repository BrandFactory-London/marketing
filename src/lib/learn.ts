import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import { hasChannelSections, type Channel, type RuleScope } from "@/config/knowledge";
import { getDb, type Database } from "@/db/client";
import { aiCalls, derivatives, postDrafts, posts, postVersions, reviewEvents, ruleCandidates, type EditHunk, type UnstoredReply } from "@/db/schema";
import * as learnPrompt from "@/prompts/learn";
import { AiClient, type Transport } from "./ai/client";
import { allChannelRules, loadPack } from "./ai/pack";
import { candidateKey, pendingCandidateKeys } from "./candidate-keys";
import { pinText } from "./derivative-checks";
import { changedWords, editHunks } from "./edit-diff";
import { composeMarkdown, splitDraft } from "./review-rules";
import { getModelSettings } from "./settings";

// Rule and fact candidates from Amir's feedback, on any channel (γ7 orientation Q2 to Q4). One run per piece of
// feedback, started as soon as it is saved: a blog regenerate or reject note, the edits when approving, a derivative
// regenerate note, or a derivative edit when it is copied. Candidates are triaged in Settings as before.

export const LEARN_EFFORT = "medium" as const;
export const LEARN_MAX_TOKENS = 16000;
// An edit that changes fewer words than this proposes nothing and costs nothing (γ7 orientation Q3).
export const MIN_CHANGED_WORDS = 4;

export type CandidateSource = { reviewEventId: string } | { derivativeId: string };
export type LearnDeps = { db: Database; transport: Transport };

type Feedback = { postId: string; input: Omit<learnPrompt.LearnInput, "channelRules"> };

function versionText(row: { channel: string; title: string | null; body: string | null }): string {
  return row.channel === "pinterest" ? pinText({ title: row.title, body: row.body ?? "" }) : (row.body ?? "");
}

async function blogFeedback(db: Database, reviewEventId: string): Promise<Feedback | null> {
  const [event] = await db.select().from(reviewEvents).where(eq(reviewEvents.id, reviewEventId));
  if (!event) return null;
  const [post] = await db.select({ topic: posts.topic }).from(posts).where(eq(posts.id, event.postId));
  const title = post?.topic ?? "Untitled";
  if (event.action === "approve") {
    if (!event.diff || event.diff.length === 0) return null;
    const approvedTitle = /^# (.+)$/m.exec(event.diff.map((hunk) => hunk.after).join("\n"))?.[1] ?? title;
    return { postId: event.postId, input: { source: "blog_approve", channel: "blog", title: approvedTitle, hunks: event.diff } };
  }
  if (event.action !== "regenerate" && event.action !== "reject") return null;
  if (!event.note?.trim()) return null;
  // A regenerate starts from the text as Amir left it; any edits he made first are part of what he said.
  let hunks: EditHunk[] = [];
  if (event.action === "regenerate" && event.versionId && event.draftId) {
    const [version] = await db.select().from(postVersions).where(eq(postVersions.id, event.versionId));
    const [draft] = await db.select().from(postDrafts).where(eq(postDrafts.id, event.draftId));
    if (version && draft) {
      const edited = composeMarkdown({ title: version.title, excerpt: version.excerpt ?? "", body: version.bodyMd });
      const written = composeMarkdown(splitDraft(draft.bodyMd));
      if (changedWords(written, edited) >= MIN_CHANGED_WORDS) hunks = editHunks(written, edited);
    }
  }
  return { postId: event.postId, input: { source: event.action === "regenerate" ? "blog_regenerate" : "blog_reject", channel: "blog", title, note: event.note, hunks } };
}

async function derivativeFeedback(db: Database, derivativeId: string): Promise<Feedback | null> {
  const [row] = await db.select().from(derivatives).where(eq(derivatives.id, derivativeId));
  if (!row) return null;
  const [post] = await db.select({ topic: posts.topic }).from(posts).where(eq(posts.id, row.postId));
  const title = post?.topic ?? "Untitled";
  const channel = row.channel as Channel;
  // The newest earlier version with text: what a note is about, or what an edit was made from.
  const earlier = (source?: "model") =>
    db
      .select()
      .from(derivatives)
      .where(
        and(
          eq(derivatives.postId, row.postId),
          eq(derivatives.channel, row.channel),
          isNotNull(derivatives.body),
          lt(derivatives.version, row.version),
          ...(source ? [eq(derivatives.source, source)] : []),
        ),
      )
      .orderBy(desc(derivatives.version))
      .limit(1);
  if (row.source === "model") {
    if (!row.note?.trim()) return null;
    const [previous] = await earlier();
    return { postId: row.postId, input: { source: "derivative_note", channel, title, note: row.note, version: previous ? versionText(previous) : null } };
  }
  if (!row.body) return null;
  const [model] = await earlier("model");
  if (!model) return null;
  const before = versionText(model);
  const after = versionText(row);
  if (changedWords(before, after) < MIN_CHANGED_WORDS) return null;
  return { postId: row.postId, input: { source: "derivative_edit", channel, title, hunks: editHunks(before, after) } };
}

// Why a candidate in the reply was not stored (backlog 24), in the words the cost table shows.
export const DROP_REASONS = {
  waiting: "already waiting",
  badPlace: "not a place a suggestion can go",
  empty: "empty text",
  overLimit: `over the limit of ${learnPrompt.MAX_CANDIDATES}`,
} as const;

// The regenerate event just recorded for a post, so its note can be read.
export async function latestRegenerateEvent(postId: string, db: Database = getDb()): Promise<string | null> {
  const [row] = await db
    .select({ id: reviewEvents.id })
    .from(reviewEvents)
    .where(and(eq(reviewEvents.postId, postId), eq(reviewEvents.action, "regenerate")))
    .orderBy(desc(reviewEvents.createdAt))
    .limit(1);
  return row?.id ?? null;
}

// The scope a candidate is stored with: only writing rules and voice can belong to one channel, and facts never do.
export function candidateScope(kind: "rule" | "fact", tier: string, section: string, scope: string): RuleScope {
  if (kind === "fact" || scope === "all") return "all";
  if (!hasChannelSections(tier as never, section)) return "all";
  return scope as RuleScope;
}

// Runs in the propose-candidates task. Does nothing when the feedback holds nothing to read, or its candidates already
// exist, so a retried run never pays twice.
export async function proposeCandidates(source: CandidateSource, deps: LearnDeps): Promise<number> {
  const { db } = deps;
  const feedback = "reviewEventId" in source ? await blogFeedback(db, source.reviewEventId) : await derivativeFeedback(db, source.derivativeId);
  if (!feedback) return 0;
  const sourceColumn = "reviewEventId" in source ? eq(ruleCandidates.reviewEventId, source.reviewEventId) : eq(ruleCandidates.derivativeId, source.derivativeId);
  const [existing] = await db.select({ id: ruleCandidates.id }).from(ruleCandidates).where(sourceColumn).limit(1);
  if (existing) return 0;
  const [post] = await db.select().from(posts).where(eq(posts.id, feedback.postId));
  if (!post) return 0;
  const pack = await loadPack(post.projectId, db);
  const { writerModel } = await getModelSettings(db);

  const { value, call } = await new AiClient(db, deps.transport).parsed(
    {
      purpose: "rules",
      model: writerModel,
      promptVersion: learnPrompt.PROMPT_VERSION,
      effort: LEARN_EFFORT,
      maxTokens: LEARN_MAX_TOKENS,
      pack: pack.text,
      instructions: learnPrompt.INSTRUCTIONS,
      user: learnPrompt.learnUserMessage({ ...feedback.input, channelRules: allChannelRules(pack) }),
      batchId: post.batchId,
      postId: post.id,
      keepUnreadable: true,
    },
    learnPrompt.LearnReply,
  );

  // Backlog 21: the same text for the same place, already waiting in Settings, is not added again.
  const pending = await pendingCandidateKeys(db);
  const rows = [];
  // Backlog 24: every candidate the reply held but the run did not store, with the reason, kept on the call.
  const dropped: NonNullable<UnstoredReply["dropped"]> = value.candidates.slice(learnPrompt.MAX_CANDIDATES).map((candidate) => ({ candidate, reason: DROP_REASONS.overLimit }));
  for (const candidate of value.candidates.slice(0, learnPrompt.MAX_CANDIDATES)) {
    const text = candidate.text.replace(/\s+/g, " ").trim();
    if (!text) {
      dropped.push({ candidate, reason: DROP_REASONS.empty });
      continue;
    }
    if (!learnPrompt.isCandidateTarget(candidate.tier, candidate.section)) {
      dropped.push({ candidate, reason: DROP_REASONS.badPlace });
      continue;
    }
    const kind = candidate.kind === "fact" && learnPrompt.FACT_SECTIONS.includes(candidate.section) ? "fact" : "rule";
    const key = await candidateKey(db, post.id, candidate.tier, candidate.section, text);
    if (pending.has(key)) {
      dropped.push({ candidate, reason: DROP_REASONS.waiting, matched: pending.get(key) });
      continue;
    }
    pending.set(key, "this run");
    rows.push({
      ...("reviewEventId" in source ? { reviewEventId: source.reviewEventId } : { derivativeId: source.derivativeId }),
      postId: post.id,
      kind: kind as "rule" | "fact",
      tier: candidate.tier,
      section: candidate.section,
      scope: candidateScope(kind, candidate.tier, candidate.section, candidate.scope),
      text,
      before: candidate.before || null,
      after: candidate.after || null,
      reason: candidate.reason || null,
      aiCallId: call.id,
    });
  }
  if (rows.length > 0) await db.insert(ruleCandidates).values(rows);
  if (dropped.length > 0) await db.update(aiCalls).set({ unstored: { dropped } }).where(eq(aiCalls.id, call.id));
  return rows.length;
}
