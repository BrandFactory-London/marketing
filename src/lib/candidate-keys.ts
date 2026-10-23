import { eq } from "drizzle-orm";
import type { KnowledgeTier } from "@/config/knowledge";
import type { Database } from "@/db/client";
import { posts, projects, ruleCandidates } from "@/db/schema";

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

// Each waiting candidate's key, with its ID, so a dropped duplicate can name the one it matched (backlog 24).
export async function pendingCandidateKeys(db: Database): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: ruleCandidates.id, tier: ruleCandidates.tier, section: ruleCandidates.section, text: ruleCandidates.text, projectId: posts.projectId, clientId: projects.clientId })
    .from(ruleCandidates)
    .innerJoin(posts, eq(posts.id, ruleCandidates.postId))
    .innerJoin(projects, eq(projects.id, posts.projectId))
    .where(eq(ruleCandidates.status, "proposed"));
  return new Map(rows.map((row) => [key(row.tier, ownerOf(row.tier, row), row.section, row.text), row.id]));
}

export async function candidateKey(db: Database, postId: string, tier: KnowledgeTier, section: string, text: string): Promise<string> {
  const [owner] = await db.select({ projectId: posts.projectId, clientId: projects.clientId }).from(posts).innerJoin(projects, eq(projects.id, posts.projectId)).where(eq(posts.id, postId));
  return key(tier, owner ? ownerOf(tier, owner) : "unknown", section, text);
}
