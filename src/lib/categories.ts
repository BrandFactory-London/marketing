import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { projectCategories } from "@/db/schema";
import { OTHER_CATEGORY } from "@/config/run-status";
import { isUuid, optionalText } from "./validation";

// A project's topic categories (orientation amendment, Q5), set on Details like its pillars. The planner gives each
// planned post one of them, and session B's gap grid counts topics by them. "Other" always comes last and is never
// stored, so every project has at least one.

export type Category = typeof projectCategories.$inferSelect;

export class CategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryError";
  }
}

export async function listCategories(projectId: string, db: Database = getDb()): Promise<Category[]> {
  if (!isUuid(projectId)) return [];
  return db.select().from(projectCategories).where(eq(projectCategories.projectId, projectId)).orderBy(asc(projectCategories.position), asc(projectCategories.createdAt));
}

// The labels the planner may use: the project's own, then Other.
export async function categoryLabels(projectId: string, db: Database = getDb()): Promise<string[]> {
  return [...(await listCategories(projectId, db)).map((row) => row.label), OTHER_CATEGORY];
}

export function parseCategoryLabel(input: unknown): string {
  const label = optionalText(input);
  if (!label) throw new CategoryError("Enter the category's name.");
  if (label.length > 40) throw new CategoryError("Keep the name under 40 characters.");
  if (label.toLowerCase() === OTHER_CATEGORY.toLowerCase()) throw new CategoryError("Other is already every project's last category.");
  return label;
}

export async function addCategory(projectId: string, input: unknown, db: Database = getDb()): Promise<Category> {
  const label = parseCategoryLabel(input);
  const [existing] = await db
    .select({ id: projectCategories.id })
    .from(projectCategories)
    .where(and(eq(projectCategories.projectId, projectId), sql`lower(${projectCategories.label}) = lower(${label})`));
  if (existing) throw new CategoryError("This project already has that category.");
  const [row] = await db
    .insert(projectCategories)
    .values({
      projectId,
      label,
      position: sql`(select coalesce(max(${projectCategories.position}), -1) + 1 from ${projectCategories} where ${projectCategories.projectId} = ${projectId})`,
    })
    .returning();
  return row;
}

// Plan items keep the label they were given, so removing a category changes no plan.
export async function removeCategory(projectId: string, categoryId: string, db: Database = getDb()): Promise<void> {
  if (!isUuid(categoryId)) return;
  await db.delete(projectCategories).where(and(eq(projectCategories.id, categoryId), eq(projectCategories.projectId, projectId)));
}
