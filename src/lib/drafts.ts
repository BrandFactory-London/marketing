import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { aiCalls, criticVerdicts, derivatives, knowledgeVersions, postDrafts, postGenerations, posts, postSpecs, projectPillars, type CriticIssue } from "@/db/schema";
import { findPlaceholders, type CheckResult } from "./checks";
import { currentText } from "./review";
import { composeMarkdown } from "./review-rules";
import { CHANNELS } from "./derivative-checks";
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

export type CostLine = { label: string; costUsd: number; inputTokens: number; outputTokens: number; cachedTokens: number; run: string };

// A run's name in the cost breakdown: the first batch run, then each regenerate with its note (γ5 Q4).
function runLabels(generations: { note: string | null }[]): string[] {
  let regenerate = 0;
  let retry = 0;
  return generations.map((generation, index) => {
    if (generation.note) return `Regenerate ${++regenerate}: ${generation.note.length > 60 ? `${generation.note.slice(0, 57)}...` : generation.note}`;
    return index === 0 ? "First draft" : `Retry ${++retry}`;
  });
}

export async function getDraftView(postId: string, db: Database = getDb()) {
  if (!isUuid(postId)) return null;
  const [post] = await db
    .select({ post: posts, pillar: projectPillars.label })
    .from(posts)
    .leftJoin(projectPillars, eq(projectPillars.id, posts.pillarId))
    .where(eq(posts.id, postId));
  if (!post) return null;
  const generations = await db.select().from(postGenerations).where(eq(postGenerations.postId, postId)).orderBy(asc(postGenerations.createdAt));
  if (generations.length === 0) return null;
  const newest = generations[generations.length - 1];
  // The newest run with drafts. A regenerate that is still running has none yet, so the page shows the one before.
  const drafted = await db
    .select({ generationId: postDrafts.generationId })
    .from(postDrafts)
    .where(inArray(postDrafts.generationId, generations.map((item) => item.id)));
  const generation = [...generations].reverse().find((item) => drafted.some((row) => row.generationId === item.id));
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

  // Each derivative version records its last call; an earlier call of the same version is its fix round's first try.
  const derivativeRows = await db.select({ channel: derivatives.channel, aiCallId: derivatives.aiCallId }).from(derivatives).where(eq(derivatives.postId, postId));
  const derivativeChannel = new Map(derivativeRows.filter((row) => row.aiCallId).map((row) => [row.aiCallId!, CHANNELS[row.channel].label]));
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
  // Calls carry no run id, so each is put in the newest run that started before it.
  const labels = runLabels(generations);
  let writer = 0;
  let critic = 0;
  const costs: CostLine[] = calls.map((call) => {
    const label =
      call.purpose === "spec"
        ? "Spec"
        : call.purpose === "writer"
          ? `Writer call ${++writer}`
          : call.purpose === "critic"
            ? `Critic call ${++critic}`
            : call.purpose === "rules"
              ? "Rule and fact suggestions"
              : call.purpose === "derivative"
                ? `${derivativeChannel.get(call.id) ?? "Derivative"} call`
                : call.purpose === "facts"
                  ? "Fact suggestions"
                  : "Check";
    const runIndex = generations.findLastIndex((item) => item.createdAt <= call.createdAt);
    return {
      run: call.purpose === "spec" ? "Spec" : call.purpose === "rules" ? "From your notes and edits" : call.purpose === "derivative" ? "Derivative copy" : labels[Math.max(runIndex, 0)],
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
    // The newest run, when it is not the one shown: a regenerate that is running or could not finish.
    newest: newest.id === generation.id ? null : newest,
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
  // Placeholders left in the current text (γ5 orientation Q2): Approve is blocked until they are filled.
  placeholders: number;
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
    const [view, current] = await Promise.all([getDraftView(row.id, db), currentText(row.id, db)]);
    if (!view || !current) continue;
    items.push({
      postId: row.id,
      status: row.status as ReviewItem["status"],
      title: current.text.title || view.latest.title,
      projectName: view.project.name,
      slotDate: row.slotDate,
      wordCount: view.latest.wordCount,
      round: view.latest.round,
      criticSummary: view.latest.verdict?.summary ?? null,
      costUsd: view.totalCost,
      placeholders: findPlaceholders(composeMarkdown(current.text)).length,
    });
  }
  return items;
}
