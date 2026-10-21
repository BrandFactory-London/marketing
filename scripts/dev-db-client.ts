import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { requireEnv } from "@/lib/env";
import * as schema from "@/db/schema";
import type { Database, Executor } from "@/db/client";

// Stands in for src/db/client.ts in `trigger.dev dev` workers only, when DEV_DB_DRIVER=neon-serverless
// (see trigger.config.ts). Postgres on port 5432 is blocked from Claude's cloud environment, so the tasks
// reach Neon dev over Neon's WebSocket driver on port 443, as scripts/migrate-lib.ts does. Deployed tasks
// and the app keep node-postgres.

export type { Database, Executor };

const globalForDb = globalThis as unknown as { bfmDb?: Database; bfmPool?: Pool };

export function devPool(): Pool {
  globalForDb.bfmPool ??= new Pool({ connectionString: requireEnv("DATABASE_URL"), max: 5 });
  return globalForDb.bfmPool;
}

export function getDb(): Database {
  // The same query builder over a pg-compatible pool; only the driver's result type differs.
  globalForDb.bfmDb ??= drizzle({ client: devPool(), schema }) as unknown as Database;
  return globalForDb.bfmDb;
}
