import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import type { Database } from "@/db/client";

// Integration tests run against a local Postgres that has had `pnpm db:migrate` applied.
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export function createTestDb(): { db: Database; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

// Empties the domain tables, children first.
export async function resetDomainTables(db: Database): Promise<void> {
  await db.execute(sql`delete from rule_candidates`);
  await db.execute(sql`delete from review_events`);
  // post_versions and post_generations refer to each other, so the regenerate link is cleared first.
  await db.execute(sql`update post_generations set base_version_id = null`);
  await db.execute(sql`delete from post_versions`);
  await db.execute(sql`delete from critic_verdicts`);
  await db.execute(sql`delete from post_drafts`);
  await db.execute(sql`delete from post_generations`);
  await db.execute(sql`delete from post_specs`);
  await db.execute(sql`delete from ai_calls`);
  await db.execute(sql`delete from posts`);
  await db.execute(sql`delete from batches`);
  await db.execute(sql`delete from project_pillars`);
  await db.execute(sql`delete from site_pages`);
  await db.execute(sql`delete from knowledge_versions`);
  await db.execute(sql`delete from projects`);
  await db.execute(sql`delete from clients`);
}
