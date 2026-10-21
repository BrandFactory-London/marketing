import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { aiCalls, criticVerdicts, knowledgeVersions, postDrafts, postGenerations, posts, postSpecs, projectPillars, type CriticIssue } from "@/db/schema";
import type { CheckResult } from "./checks";
import { getProject } from "./projects";
import { isUuid } from "./validation";

// The read-only draft view (γ4 orientation, smaller decisions): the newest generation's drafts, each round's
// checks and critic notes, the confirmed spec, the knowledge versions used and the cost breakdown.

export type DraftRound = {
  round: number;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  wordCount: number;
  checks: CheckResult;
  checksPassed: boolean;
  verdict: { verdict: "pass" | "fail"; summary: string | null; issues: CriticIssue[]; scores: Record<string, number>; model: string | null } | null;
};

export type CostLine = { label: string; costUsd: number; inputTokens: number; outputTokens: number; cachedTokens: number };

export async function getDraftView(postId: string, db: Database = getDb()) {
  if (!isUuid(postId)) return null;
  const [post] = await db
    .select({ post: posts, pillar: projectPillars.label })
    .from(posts)
    .leftJoin(projectPillars, eq(projectPillars.id, posts.pillarId))
    .where(eq(posts.id, postId));
  if (!post) return null;
  const [generation] = await db.select().from(postGenerations).where(eq(postGenerations.postId, postId)).orderBy(desc(postGenerations.createdAt)).limit(1);
  if (!generation) return null;
  const [project, [spec], drafts, calls] = await Promise.all([
    getProject(post.post.projectId, db),
    db.select().from(postSpecs).where(eq(postSpecs.id, generation.specId)),
    db.select().from(postDrafts).where(eq(postDrafts.generationId, generation.id)).orderBy(asc(postDrafts.round)),
    db.select().from(aiCalls).where(eq(aiCalls.postId, postId)).orderBy(asc(aiCalls.createdAt)),
  ]);
  if (!project || drafts.length === 0) return null;
  const verdicts = await db.select().from(criticVerdicts).where(inArray(criticVerdicts.draftId, drafts.map((draft) => draft.id)));
  const versionIds = [generation.agencyVersionId, generation.clientVersionId, generation.projectVersionId].filter((id): id is string => Boolean(id));
  const versions = versionIds.length
    ? await db.select({ id: knowledgeVersions.id, tier: knowledgeVersions.tier, version: knowledgeVersions.version }).from(knowledgeVersions).where(inArray(knowledgeVersions.id, versionIds))
    : [];

  const callModel = (id: string | null) => calls.find((call) => call.id === id)?.servedModel ?? null;
  const rounds: DraftRound[] = drafts.map((draft) => {
    const verdict = verdicts.find((item) => item.draftId === draft.id);
    return {
      round: draft.round,
      title: draft.title,
      excerpt: draft.excerpt,
      bodyMd: draft.bodyMd,
      wordCount: draft.wordCount,
      checks: draft.checks as CheckResult,
      checksPassed: draft.checksPassed,
      verdict: verdict
        ? { verdict: verdict.verdict, summary: verdict.summary, issues: verdict.issues, scores: verdict.scores, model: callModel(verdict.aiCallId) }
        : null,
    };
  });

  // Spec, then each writer and critic round, in the order they ran. Failed calls cost nothing but are shown.
  let writer = 0;
  let critic = 0;
  const costs: CostLine[] = calls.map((call) => {
    const label =
      call.purpose === "spec" ? "Spec" : call.purpose === "writer" ? `Writer call ${++writer}` : call.purpose === "critic" ? `Critic call ${++critic}` : "Check";
    return {
      label: call.error ? `${label} (stopped: ${call.error})` : label,
      costUsd: call.costUsd,
      inputTokens: call.inputTokens + call.cacheWriteTokens,
      outputTokens: call.outputTokens,
      cachedTokens: call.cacheReadTokens,
    };
  });

  const link = (tier: string, version: number) =>
    tier === "agency"
      ? `/settings/rules?version=${version}`
      : tier === "client"
        ? `/crm/${project.clientId}?version=${version}`
        : `/projects/${project.id}/knowledge?version=${version}`;

  return {
    post: { ...post.post, pillar: post.pillar },
    project,
    generation,
    spec: spec ?? null,
    rounds,
    latest: rounds[rounds.length - 1],
    costs,
    totalCost: costs.reduce((sum, line) => sum + line.costUsd, 0),
    versions: (["agency", "client", "project"] as const).map((tier) => {
      const found = versions.find((item) => item.tier === tier);
      return { tier, version: found?.version ?? null, href: found ? link(tier, found.version) : null };
    }),
  };
}

export type DraftView = NonNullable<Awaited<ReturnType<typeof getDraftView>>>;

export type ReviewItem = {
  postId: string;
  status: "in_review" | "flagged";
  title: string;
  projectName: string;
  slotDate: string;
  wordCount: number;
  round: number;
  criticSummary: string | null;
  costUsd: number;
};

// Posts waiting for Amir: passed the critic (Needs review) or flagged after two fix rounds (Failed), by date.
export async function listReviewQueue(db: Database = getDb()): Promise<ReviewItem[]> {
  const rows = await db
    .select({ id: posts.id, status: posts.status, slotDate: posts.slotDate, projectId: posts.projectId })
    .from(posts)
    .where(inArray(posts.status, ["in_review", "flagged"]))
    .orderBy(asc(posts.slotDate));
  const items: ReviewItem[] = [];
  for (const row of rows) {
    const view = await getDraftView(row.id, db);
    if (!view) continue;
    items.push({
      postId: row.id,
      status: row.status as ReviewItem["status"],
      title: view.latest.title,
      projectName: view.project.name,
      slotDate: row.slotDate,
      wordCount: view.latest.wordCount,
      round: view.latest.round,
      criticSummary: view.latest.verdict?.summary ?? null,
      costUsd: view.totalCost,
    });
  }
  return items;
}
