import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { knowledgeSections, KNOWLEDGE_TIERS, type KnowledgeTier } from "@/config/knowledge";
import { getDb, type Database } from "@/db/client";
import { posts, reviewEvents, ruleCandidates } from "@/db/schema";
import * as rulesPrompt from "@/prompts/rules";
import { AiClient, type Transport } from "./ai/client";
import { loadPack } from "./ai/pack";
import { candidateKey, pendingCandidateKeys } from "./candidate-keys";
import { getCurrentKnowledge, saveKnowledge, type KnowledgeScope } from "./knowledge";
import { getProject } from "./projects";
import { getModelSettings } from "./settings";
import { isUuid } from "./validation";

// Rule candidates (design decision 17, γ5 orientation Q5): after an approval with edits, Claude proposes rules and
// facts from the diff; Amir accepts each into a knowledge tier, or dismisses it, in Settings.

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

export const RULES_EFFORT = "medium" as const;
export const RULES_MAX_TOKENS = 16000;

export type RuleDeps = { db: Database; transport: Transport };

// Runs in the propose-rules task. Does nothing if the approval had no edits or its candidates already exist,
// so a retried run never pays twice.
export async function proposeRuleCandidates(reviewEventId: string, deps: RuleDeps): Promise<number> {
  const { db } = deps;
  const [event] = await db.select().from(reviewEvents).where(eq(reviewEvents.id, reviewEventId));
  if (!event || event.action !== "approve" || !event.diff || event.diff.length === 0) return 0;
  const [existing] = await db.select({ id: ruleCandidates.id }).from(ruleCandidates).where(eq(ruleCandidates.reviewEventId, reviewEventId)).limit(1);
  if (existing) return 0;
  const [post] = await db.select().from(posts).where(eq(posts.id, event.postId));
  if (!post) return 0;
  const pack = await loadPack(post.projectId, db);
  const notes = await db
    .select({ note: reviewEvents.note })
    .from(reviewEvents)
    .where(and(eq(reviewEvents.postId, post.id), inArray(reviewEvents.action, ["regenerate", "reject"]), isNotNull(reviewEvents.note)));
  const { writerModel } = await getModelSettings(db);
  const title = /^# (.+)$/m.exec(event.diff.map((hunk) => hunk.after).join("\n"))?.[1] ?? post.topic ?? "Untitled";

  const { value, call } = await new AiClient(db, deps.transport).parsed(
    {
      purpose: "rules",
      model: writerModel,
      promptVersion: rulesPrompt.PROMPT_VERSION,
      effort: RULES_EFFORT,
      maxTokens: RULES_MAX_TOKENS,
      pack: pack.text,
      instructions: rulesPrompt.INSTRUCTIONS,
      user: rulesPrompt.rulesUserMessage({ title, hunks: event.diff, notes: notes.map((row) => row.note ?? "") }),
      batchId: post.batchId,
      postId: post.id,
    },
    rulesPrompt.RulesReply,
  );
  const candidates = value.candidates
    .filter((candidate) => rulesPrompt.isCandidateTarget(candidate.tier, candidate.section) && candidate.text.trim())
    .slice(0, rulesPrompt.MAX_CANDIDATES);
  // Backlog 21: a rule already waiting in Settings for the same place is not added again.
  const pending = await pendingCandidateKeys(db);
  const fresh = [];
  for (const candidate of candidates) {
    const key = await candidateKey(db, post.id, candidate.tier, candidate.section, candidate.text);
    if (pending.has(key)) continue;
    pending.add(key);
    fresh.push(candidate);
  }
  if (fresh.length === 0) return 0;
  await db.insert(ruleCandidates).values(
    fresh.map((candidate) => ({
      reviewEventId,
      postId: post.id,
      tier: candidate.tier,
      section: candidate.section,
      text: candidate.text.trim(),
      before: candidate.before || null,
      after: candidate.after || null,
      reason: candidate.reason || null,
      aiCallId: call.id,
    })),
  );
  return fresh.length;
}

// Adds the rule as a new list item at the end of the section, leaving every existing line as it was.
export function appendRule(section: string | undefined, rule: string): string {
  const line = `- ${rule.replace(/\s+/g, " ").trim()}`;
  const existing = (section ?? "").replace(/\s+$/, "");
  return existing ? `${existing}\n${line}` : line;
}

export function targetLabel(tier: KnowledgeTier, section: string): string {
  const sectionLabel = knowledgeSections(tier).find((item) => item.key === section)?.label ?? section;
  return `${KNOWLEDGE_TIERS[tier].label}: ${sectionLabel}`;
}

async function scopeFor(db: Database, postId: string, tier: KnowledgeTier): Promise<KnowledgeScope> {
  if (tier === "agency") return { tier };
  const [post] = await db.select({ projectId: posts.projectId }).from(posts).where(eq(posts.id, postId));
  const project = post ? await getProject(post.projectId, db) : null;
  if (!project) throw new RuleError("The post this came from no longer exists.");
  return tier === "client" ? { tier, clientId: project.clientId } : { tier, projectId: project.id };
}

export type CandidateDecision = { text: string; tier: string; section: string };

// Accept rule: the (possibly edited) text joins that tier's section as a new version. Nothing else changes.
export async function acceptCandidate(candidateId: string, decision: CandidateDecision, db: Database = getDb()): Promise<{ tier: KnowledgeTier; version: number }> {
  if (!isUuid(candidateId)) throw new RuleError("This candidate no longer exists.");
  const text = decision.text.replace(/\s+/g, " ").trim();
  if (!text) throw new RuleError("Enter the rule's text.");
  if (text.length > 500) throw new RuleError("Keep the rule under 500 characters.");
  if (!rulesPrompt.isCandidateTarget(decision.tier, decision.section)) throw new RuleError("Choose where the rule belongs.");
  const tier = decision.tier;
  const [candidate] = await db.select().from(ruleCandidates).where(eq(ruleCandidates.id, candidateId));
  if (!candidate) throw new RuleError("This candidate no longer exists.");
  if (candidate.status !== "proposed") throw new RuleError("This candidate has already been decided.");
  const scope = await scopeFor(db, candidate.postId, tier);
  const current = await getCurrentKnowledge(scope, db);
  const sections = { ...(current?.sections ?? {}) };
  sections[decision.section] = appendRule(sections[decision.section], text);
  const saved = await saveKnowledge(scope, sections, db);
  if (!saved.version) throw new RuleError("The rule could not be saved.");
  const [updated] = await db
    .update(ruleCandidates)
    .set({ status: "accepted", text, tier, section: decision.section, knowledgeVersionId: saved.version.id, decidedAt: sql`now()` })
    .where(and(eq(ruleCandidates.id, candidateId), eq(ruleCandidates.status, "proposed")))
    .returning({ id: ruleCandidates.id });
  if (!updated) throw new RuleError("This candidate has already been decided.");
  return { tier, version: saved.version.version };
}

export async function dismissCandidate(candidateId: string, db: Database = getDb()): Promise<void> {
  if (!isUuid(candidateId)) throw new RuleError("This candidate no longer exists.");
  const [row] = await db
    .update(ruleCandidates)
    .set({ status: "dismissed", decidedAt: sql`now()` })
    .where(and(eq(ruleCandidates.id, candidateId), eq(ruleCandidates.status, "proposed")))
    .returning({ id: ruleCandidates.id });
  if (!row) throw new RuleError("This candidate has already been decided.");
}

export type CandidateView = typeof ruleCandidates.$inferSelect & { postTitle: string; clientName: string; projectName: string };

// Proposed candidates first, then the most recent decisions.
export async function listCandidates(db: Database = getDb()): Promise<{ proposed: CandidateView[]; decided: CandidateView[] }> {
  const rows = await db.select().from(ruleCandidates).orderBy(desc(ruleCandidates.createdAt)).limit(100);
  const views: CandidateView[] = [];
  for (const row of rows) {
    const [post] = await db.select({ projectId: posts.projectId, topic: posts.topic }).from(posts).where(eq(posts.id, row.postId));
    const project = post ? await getProject(post.projectId, db) : null;
    views.push({ ...row, postTitle: post?.topic ?? "a post", clientName: project?.clientName ?? "", projectName: project?.name ?? "" });
  }
  return { proposed: views.filter((row) => row.status === "proposed"), decided: views.filter((row) => row.status !== "proposed").slice(0, 10) };
}

export async function candidatesForPost(postId: string, db: Database = getDb()) {
  return db.select().from(ruleCandidates).where(eq(ruleCandidates.postId, postId));
}
