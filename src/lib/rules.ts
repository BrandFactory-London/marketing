import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { CHANNELS, hasChannelSections, isRuleScope, knowledgeSections, KNOWLEDGE_TIERS, scopedSection, type Channel, type KnowledgeTier, type RuleScope } from "@/config/knowledge";
import { getDb, type Database } from "@/db/client";
import { derivatives, planFeedback, planItems, posts, reviewEvents, ruleCandidates, runs } from "@/db/schema";
import * as learnPrompt from "@/prompts/learn";
import { getCurrentKnowledge, saveKnowledge, type KnowledgeScope } from "./knowledge";
import { getProject } from "./projects";
import { isUuid } from "./validation";

// Rule and fact candidates (design decision 17, γ5 orientation Q5, γ7 orientation Q1 to Q4). Claude proposes them from
// Amir's notes and edits on any channel (src/lib/learn.ts); Amir accepts each into a knowledge tier, for every channel
// or one, or dismisses it, in Settings.

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

// Adds the rule as a new list item at the end of the section, leaving every existing line as it was.
export function appendRule(section: string | undefined, rule: string): string {
  const line = `- ${rule.replace(/\s+/g, " ").trim()}`;
  const existing = (section ?? "").replace(/\s+$/, "");
  return existing ? `${existing}\n${line}` : line;
}

export function targetLabel(tier: KnowledgeTier, section: string, scope: RuleScope = "all"): string {
  const key = scopedSection(tier, section, scope);
  const sectionLabel = knowledgeSections(tier).find((item) => item.key === key)?.label ?? section;
  return `${KNOWLEDGE_TIERS[tier].label}: ${sectionLabel}`;
}

// The project a candidate is about: its post's, or for feedback on a plan (Phase 2 A3) the plan's run's.
async function candidateProjectId(db: Database, candidate: { postId: string | null; planFeedbackId: string | null }): Promise<string | null> {
  if (candidate.postId) {
    const [post] = await db.select({ projectId: posts.projectId }).from(posts).where(eq(posts.id, candidate.postId));
    return post?.projectId ?? null;
  }
  if (!candidate.planFeedbackId) return null;
  const [row] = await db.select({ projectId: runs.projectId }).from(planFeedback).innerJoin(runs, eq(runs.id, planFeedback.runId)).where(eq(planFeedback.id, candidate.planFeedbackId));
  return row?.projectId ?? null;
}

async function scopeFor(db: Database, candidate: { postId: string | null; planFeedbackId: string | null }, tier: KnowledgeTier): Promise<KnowledgeScope> {
  if (tier === "agency") return { tier };
  const projectId = await candidateProjectId(db, candidate);
  const project = projectId ? await getProject(projectId, db) : null;
  if (!project) throw new RuleError("The post this came from no longer exists.");
  return tier === "client" ? { tier, clientId: project.clientId } : { tier, projectId: project.id };
}

export type CandidateDecision = { text: string; tier: string; section: string; scope?: string };

// Accept rule: the (possibly edited) text joins that tier's section as a new version, in the channel's own section when
// it applies to one channel (γ7 orientation Q1). Nothing else changes.
export async function acceptCandidate(candidateId: string, decision: CandidateDecision, db: Database = getDb()): Promise<{ tier: KnowledgeTier; version: number }> {
  if (!isUuid(candidateId)) throw new RuleError("This candidate no longer exists.");
  const text = decision.text.replace(/\s+/g, " ").trim();
  if (!text) throw new RuleError("Enter the rule's text.");
  if (text.length > 500) throw new RuleError("Keep the rule under 500 characters.");
  if (!learnPrompt.isCandidateTarget(decision.tier, decision.section)) throw new RuleError("Choose where the rule belongs.");
  const tier = decision.tier;
  const scope = decision.scope ?? "all";
  if (!isRuleScope(scope)) throw new RuleError("Choose which channels it applies to.");
  if (scope !== "all" && !hasChannelSections(tier, decision.section)) throw new RuleError("Only writing rules and voice can apply to one channel. Choose All channels.");
  const [candidate] = await db.select().from(ruleCandidates).where(eq(ruleCandidates.id, candidateId));
  if (!candidate) throw new RuleError("This candidate no longer exists.");
  if (candidate.status !== "proposed") throw new RuleError("This candidate has already been decided.");
  const owner = await scopeFor(db, candidate, tier);
  const current = await getCurrentKnowledge(owner, db);
  const sections = { ...(current?.sections ?? {}) };
  const key = scopedSection(tier, decision.section, scope);
  sections[key] = appendRule(sections[key], text);
  const saved = await saveKnowledge(owner, sections, db);
  if (!saved.version) throw new RuleError("The rule could not be saved.");
  const [updated] = await db
    .update(ruleCandidates)
    .set({ status: "accepted", text, tier, section: decision.section, scope, knowledgeVersionId: saved.version.id, decidedAt: sql`now()` })
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

export type CandidateView = typeof ruleCandidates.$inferSelect & { postTitle: string; clientName: string; projectName: string; channel: Channel; from: string };

// Where a candidate from a plan came from (Phase 2 A3): Amir's note, or the client's comment or suggestion, on one
// planned post or on the whole plan.
export function planOrigin(input: { kind: string; itemTitle: string | null; runName: string }): string {
  const what = input.itemTitle ? `"${input.itemTitle}"` : `the plan for ${input.runName}`;
  if (input.kind === "note") return input.itemTitle ? `From your note on ${what} in the plan for ${input.runName}` : `From your note on ${what}`;
  if (input.kind === "suggest") return `From the client's suggestion for ${what}`;
  return `From the client's comment on ${what}`;
}

// Where a candidate came from, in Amir's words (γ7 handoff item 5).
export function candidateOrigin(input: { postTitle: string; channel: Channel; action?: string | null; derivativeSource?: "model" | "edit" | null }): string {
  const post = `"${input.postTitle}"`;
  if (input.channel !== "blog") {
    const what = `the ${CHANNELS[input.channel].label} for ${post}`;
    return input.derivativeSource === "edit" ? `From your edit to ${what}` : `From your note on ${what}`;
  }
  if (input.action === "reject") return `From your reject note on ${post}`;
  if (input.action === "regenerate") return `From your regenerate note on ${post}`;
  return `From your edits when approving ${post}`;
}

// Proposed candidates first, then the most recent decisions.
export async function listCandidates(db: Database = getDb()): Promise<{ proposed: CandidateView[]; decided: CandidateView[] }> {
  const rows = await db.select().from(ruleCandidates).orderBy(desc(ruleCandidates.createdAt)).limit(100);
  const eventIds = rows.map((row) => row.reviewEventId).filter((id): id is string => Boolean(id));
  const derivativeIds = rows.map((row) => row.derivativeId).filter((id): id is string => Boolean(id));
  const events = eventIds.length ? await db.select({ id: reviewEvents.id, action: reviewEvents.action }).from(reviewEvents).where(inArray(reviewEvents.id, eventIds)) : [];
  const versions = derivativeIds.length
    ? await db.select({ id: derivatives.id, channel: derivatives.channel, source: derivatives.source }).from(derivatives).where(inArray(derivatives.id, derivativeIds))
    : [];
  const views: CandidateView[] = [];
  for (const row of rows) {
    const [post] = row.postId ? await db.select({ projectId: posts.projectId, topic: posts.topic }).from(posts).where(eq(posts.id, row.postId)) : [];
    const projectId = post?.projectId ?? (await candidateProjectId(db, row));
    const project = projectId ? await getProject(projectId, db) : null;
    const version = versions.find((item) => item.id === row.derivativeId);
    const channel: Channel = version?.channel ?? "blog";
    let postTitle = post?.topic ?? "a post";
    let from: string;
    if (row.planFeedbackId) {
      const [feedback] = await db
        .select({ kind: planFeedback.kind, itemTitle: planItems.title, runName: runs.name })
        .from(planFeedback)
        .innerJoin(runs, eq(runs.id, planFeedback.runId))
        .leftJoin(planItems, eq(planItems.id, planFeedback.planItemId))
        .where(eq(planFeedback.id, row.planFeedbackId));
      postTitle = feedback?.itemTitle ?? `the plan for ${feedback?.runName ?? "a run"}`;
      from = planOrigin({ kind: feedback?.kind ?? "note", itemTitle: feedback?.itemTitle ?? null, runName: feedback?.runName ?? "a run" });
    } else {
      from = candidateOrigin({ postTitle, channel, action: events.find((item) => item.id === row.reviewEventId)?.action, derivativeSource: version?.source });
    }
    views.push({ ...row, postTitle, clientName: project?.clientName ?? "", projectName: project?.name ?? "", channel, from });
  }
  return { proposed: views.filter((row) => row.status === "proposed"), decided: views.filter((row) => row.status !== "proposed").slice(0, 10) };
}

export async function candidatesForPost(postId: string, db: Database = getDb()) {
  return db.select().from(ruleCandidates).where(eq(ruleCandidates.postId, postId));
}
