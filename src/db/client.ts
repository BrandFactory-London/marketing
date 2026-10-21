import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { bfmDb?: Database };

// One pool per server instance, created on first use so builds do not need DATABASE_URL.
export function getDb(): Database {
  if (!globalForDb.bfmDb) {
    const pool = new Pool({ connectionString: requireEnv("DATABASE_URL"), max: 5 });
    globalForDb.bfmDb = drizzle(pool, { schema });
  }
  return globalForDb.bfmDb;
}

// A database or an open transaction: functions that may run inside a caller's transaction take this.
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
