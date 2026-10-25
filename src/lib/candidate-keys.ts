import { eq, sql } from "drizzle-orm";
import type { KnowledgeTier } from "@/config/knowledge";
import type { Database } from "@/db/client";
import { planFeedback, posts, projects, ruleCandidates, runs } from "@/db/schema";

// Pending candidates are not proposed twice (backlog 21): the same text for the same place (tier, section and, for
// client and project tiers, the same client or project) while one is still waiting in Settings.

export function normaliseCandidate(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9£'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ownerOf(tier: KnowledgeTier, owner: { projectId: string; clientId: string }): string {
  return tier === "agency" ? "agency" : tier === "client" ? owner.clientId : owner.projectId;
}

function key(tier: KnowledgeTier, owner: string, section: string, text: string): string {
  return `${tier}:${owner}:${section}:${normaliseCandidate(text)}`;
}

// The project a candidate belongs to: its post's, or, for a note on a whole plan (Phase 2 A3), its run's.
const candidateProject = sql<string>`coalesce(${posts.projectId}, ${runs.projectId})`;

// Each waiting candidate's key, with its ID, so a dropped duplicate can name the one it matched (backlog 24).
export async function pendingCandidateKeys(db: Database): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: ruleCandidates.id, tier: ruleCandidates.tier, section: ruleCandidates.section, text: ruleCandidates.text, projectId: projects.id, clientId: projects.clientId })
    .from(ruleCandidates)
    .leftJoin(posts, eq(posts.id, ruleCandidates.postId))
    .leftJoin(planFeedback, eq(planFeedback.id, ruleCandidates.planFeedbackId))
    .leftJoin(runs, eq(runs.id, planFeedback.runId))
    .innerJoin(projects, eq(projects.id, candidateProject))
    .where(eq(ruleCandidates.status, "proposed"));
  return new Map(rows.map((row) => [key(row.tier, ownerOf(row.tier, row), row.section, row.text), row.id]));
}

export type CandidateOwner = { projectId: string; clientId: string };

export async function projectOwner(db: Database, projectId: string): Promise<CandidateOwner | null> {
  const [row] = await db.select({ projectId: projects.id, clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId));
  return row ?? null;
}

export async function candidateKey(db: Database, owner: CandidateOwner | null, tier: KnowledgeTier, section: string, text: string): Promise<string> {
  return key(tier, owner ? ownerOf(tier, owner) : "unknown", section, text);
}
