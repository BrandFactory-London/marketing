import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { projectPillars } from "@/db/schema";
import { isUuid, optionalText, type FormInput, type Parsed } from "./validation";

// A project's pillar tags (γ4 orientation Q3), set in project Settings. The slug is the Wix Blog tag γ6
// publishes with, so it is checked here the same way the database checks it.

export type Pillar = typeof projectPillars.$inferSelect;
export type PillarInput = { label: string; slug: string };
export type PillarField = keyof PillarInput;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parsePillarInput(input: FormInput): Parsed<PillarInput, PillarField> {
  const label = optionalText(input.label);
  const slug = optionalText(input.slug)?.toLowerCase() ?? (label ? slugify(label) : null);
  const errors: Partial<Record<PillarField, string>> = {};
  if (!label) errors.label = "Enter the pillar's name.";
  else if (label.length > 80) errors.label = "Keep the name under 80 characters.";
  if (label && !slug) errors.slug = "Enter a tag such as bathroom-renovation.";
  else if (slug && !SLUG.test(slug)) errors.slug = "Use lower-case letters, numbers and single hyphens, such as bathroom-renovation.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { label: label!, slug: slug! } };
}

export async function listPillars(projectId: string, db: Database = getDb()): Promise<Pillar[]> {
  if (!isUuid(projectId)) return [];
  return db.select().from(projectPillars).where(eq(projectPillars.projectId, projectId)).orderBy(asc(projectPillars.position), asc(projectPillars.createdAt));
}

export class DuplicatePillar extends Error {
  constructor() {
    super("This project already has a pillar with that tag.");
    this.name = "DuplicatePillar";
  }
}

export async function addPillar(projectId: string, value: PillarInput, db: Database = getDb()): Promise<Pillar> {
  const [existing] = await db
    .select({ id: projectPillars.id })
    .from(projectPillars)
    .where(and(eq(projectPillars.projectId, projectId), eq(projectPillars.slug, value.slug)));
  if (existing) throw new DuplicatePillar();
  const [row] = await db
    .insert(projectPillars)
    .values({
      projectId,
      ...value,
      position: sql`(select coalesce(max(${projectPillars.position}), -1) + 1 from ${projectPillars} where ${projectPillars.projectId} = ${projectId})`,
    })
    .returning();
  return row;
}

// Posts and batches that used it keep their place with no pillar (on delete set null).
export async function removePillar(projectId: string, pillarId: string, db: Database = getDb()): Promise<void> {
  if (!isUuid(pillarId)) return;
  await db.delete(projectPillars).where(and(eq(projectPillars.id, pillarId), eq(projectPillars.projectId, projectId)));
}
