import "server-only";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { knowledgeVersions } from "@/db/schema";
import { knowledgeSections, type KnowledgeSections, type KnowledgeTier } from "@/config/knowledge";

// One storage shape for all three tiers (handoff item 6). Every save that changes something adds a version;
// old versions are never changed. Later checkpoints record the version id a post was written with.

export type KnowledgeScope = { tier: "agency" } | { tier: "client"; clientId: string } | { tier: "project"; projectId: string };

export type KnowledgeVersion = {
  id: string;
  tier: KnowledgeTier;
  version: number;
  sections: KnowledgeSections;
  createdAt: Date;
};

export type KnowledgeVersionSummary = Pick<KnowledgeVersion, "id" | "version" | "createdAt">;

function owner(scope: KnowledgeScope): { clientId: string | null; projectId: string | null } {
  if (scope.tier === "client") return { clientId: scope.clientId, projectId: null };
  if (scope.tier === "project") return { clientId: null, projectId: scope.projectId };
  return { clientId: null, projectId: null };
}

function scopeWhere(scope: KnowledgeScope): SQL {
  const { clientId, projectId } = owner(scope);
  return and(
    eq(knowledgeVersions.tier, scope.tier),
    clientId ? eq(knowledgeVersions.clientId, clientId) : isNull(knowledgeVersions.clientId),
    projectId ? eq(knowledgeVersions.projectId, projectId) : isNull(knowledgeVersions.projectId),
  )!;
}

// Keeps only the tier's own sections, every one present, with line endings and trailing space normalised,
// so that saving the same text twice is recognised as no change.
export function normaliseSections(tier: KnowledgeTier, input: Record<string, unknown>): KnowledgeSections {
  const sections: KnowledgeSections = {};
  for (const { key } of knowledgeSections(tier)) {
    const value = input[key];
    sections[key] = typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trimEnd() : "";
  }
  return sections;
}

export function sameSections(a: KnowledgeSections, b: KnowledgeSections): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] ?? "") === (b[key] ?? ""));
}

export function emptySections(tier: KnowledgeTier): KnowledgeSections {
  return normaliseSections(tier, {});
}

function toVersion(row: typeof knowledgeVersions.$inferSelect): KnowledgeVersion {
  return { id: row.id, tier: row.tier, version: row.version, sections: row.sections, createdAt: row.createdAt };
}

// The current version, or null if the tier has never been saved.
export async function getCurrentKnowledge(scope: KnowledgeScope, db: Database = getDb()): Promise<KnowledgeVersion | null> {
  const [row] = await db.select().from(knowledgeVersions).where(scopeWhere(scope)).orderBy(desc(knowledgeVersions.version)).limit(1);
  return row ? toVersion(row) : null;
}

export async function getKnowledgeVersion(scope: KnowledgeScope, version: number, db: Database = getDb()): Promise<KnowledgeVersion | null> {
  if (!Number.isInteger(version) || version < 1) return null;
  const [row] = await db
    .select()
    .from(knowledgeVersions)
    .where(and(scopeWhere(scope), eq(knowledgeVersions.version, version)));
  return row ? toVersion(row) : null;
}

export async function listKnowledgeVersions(scope: KnowledgeScope, db: Database = getDb()): Promise<KnowledgeVersionSummary[]> {
  return db
    .select({ id: knowledgeVersions.id, version: knowledgeVersions.version, createdAt: knowledgeVersions.createdAt })
    .from(knowledgeVersions)
    .where(scopeWhere(scope))
    .orderBy(desc(knowledgeVersions.version));
}

export type SaveResult = { status: "saved"; version: KnowledgeVersion } | { status: "unchanged"; version: KnowledgeVersion | null };

const UNIQUE_VIOLATION = "23505";
const MAX_ATTEMPTS = 3;

// Adds version N+1. Two saves at the same moment cannot both take N+1: the unique constraint refuses the
// second, which then retries as N+2.
export async function saveKnowledge(scope: KnowledgeScope, input: Record<string, unknown>, db: Database = getDb()): Promise<SaveResult> {
  const sections = normaliseSections(scope.tier, input);
  for (let attempt = 1; ; attempt += 1) {
    const current = await getCurrentKnowledge(scope, db);
    if (current ? sameSections(current.sections, sections) : sameSections(emptySections(scope.tier), sections)) {
      return { status: "unchanged", version: current };
    }
    try {
      const [row] = await db
        .insert(knowledgeVersions)
        .values({
          tier: scope.tier,
          ...owner(scope),
          sections,
          version: sql`(select coalesce(max(${knowledgeVersions.version}), 0) + 1 from ${knowledgeVersions} where ${scopeWhere(scope)})`,
        })
        .returning();
      return { status: "saved", version: toVersion(row) };
    } catch (error) {
      if (attempt < MAX_ATTEMPTS && isUniqueViolation(error)) continue;
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  for (let cause: unknown = error; cause; cause = (cause as { cause?: unknown }).cause) {
    if ((cause as { code?: string }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}
