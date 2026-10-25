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
  await db.execute(sql`delete from calendar_deletions`);
  await db.execute(sql`update app_settings set calendar_user_id = null, calendar_id = null, calendar_name = null, calendar_synced_at = null, calendar_error = null, calendar_error_at = null`);
  await db.execute(sql`delete from publish_events`);
  await db.execute(sql`delete from post_publications`);
  // Candidates refer to derivatives (γ7), so they go first.
  await db.execute(sql`delete from rule_candidates`);
  await db.execute(sql`delete from derivatives`);
  await db.execute(sql`delete from review_events`);
  // post_versions and post_generations refer to each other, so the regenerate link is cleared first.
  await db.execute(sql`update post_generations set base_version_id = null`);
  await db.execute(sql`delete from post_versions`);
  await db.execute(sql`delete from critic_verdicts`);
  await db.execute(sql`delete from post_drafts`);
  await db.execute(sql`delete from post_generations`);
  await db.execute(sql`delete from post_specs`);
  // Phase 2 A3: the plan refers to posts, runs and its AI calls.
  await db.execute(sql`delete from plan_feedback`);
  await db.execute(sql`delete from plan_items`);
  await db.execute(sql`delete from plan_drafts`);
  await db.execute(sql`delete from plan_shares`);
  await db.execute(sql`delete from ai_calls`);
  // Derived slots refer to their SEO posts and their run (Phase 2 A1).
  await db.execute(sql`delete from derived_slots`);
  await db.execute(sql`delete from posts`);
  await db.execute(sql`delete from runs`);
  await db.execute(sql`delete from batches`);
  await db.execute(sql`delete from project_pillars`);
  await db.execute(sql`delete from project_categories`);
  await db.execute(sql`delete from site_pages`);
  await db.execute(sql`delete from knowledge_versions`);
  await db.execute(sql`delete from project_wix`);
  await db.execute(sql`delete from projects`);
  await db.execute(sql`delete from clients`);
}
