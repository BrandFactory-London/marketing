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
