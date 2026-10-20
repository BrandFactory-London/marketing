// Migration logic behind scripts/migrate.ts, kept separate so it can be tested.
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { migrate as migrateNeonHttp } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

export type MigrationDriver = "node-postgres" | "neon-http";
export type MigrationTarget = { url: string; host: string; database: string; driver: MigrationDriver };

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

// Neon targets use Neon's HTTPS driver (port 443), because Postgres on port 5432 is blocked from
// Claude's cloud environment. Everything else uses node-postgres, the app's runtime driver.
// Any database not on localhost needs --remote.
export function resolveTarget(url: string | undefined, argv: string[]): MigrationTarget {
  if (!url) throw new Error("Missing environment variable DATABASE_URL.");
  const { hostname, pathname } = new URL(url);
  if (!LOCAL_HOSTS.includes(hostname) && !argv.includes("--remote")) {
    throw new Error("Refusing to migrate a remote database without --remote.");
  }
  const driver: MigrationDriver = hostname.endsWith(".neon.tech") ? "neon-http" : "node-postgres";
  return { url, host: hostname, database: pathname, driver };
}

type Query = <T>(text: string) => Promise<T[]>;

const TABLES_SQL = "select table_name from information_schema.tables where table_schema = 'public' order by table_name";
const APPLIED_SQL = "select id, hash, created_at from drizzle.__drizzle_migrations order by id";

export async function runMigrations(
  target: MigrationTarget,
  options: { checkOnly?: boolean; migrationsFolder?: string; log?: (line: string) => void } = {},
): Promise<void> {
  const log = options.log ?? console.log;
  const migrationsFolder = options.migrationsFolder ?? "./drizzle";
  log(`Target: ${target.host}${target.database}`);
  log(`Driver: ${target.driver === "neon-http" ? "neon-http (HTTPS, port 443)" : "node-postgres"}`);

  if (target.driver === "neon-http") {
    const sql = neon(target.url);
    if (!options.checkOnly) {
      await migrateNeonHttp(drizzleNeonHttp(sql), { migrationsFolder });
      log("Migrator finished.");
    }
    await printCheck(<T>(text: string) => sql.query(text) as Promise<T[]>, log);
    return;
  }

  const client = new Client({ connectionString: target.url });
  await client.connect();
  try {
    if (!options.checkOnly) {
      await migrateNodePg(drizzleNodePg(client), { migrationsFolder });
      log("Migrator finished.");
    }
    await printCheck(async <T>(text: string) => (await client.query(text)).rows as T[], log);
  } finally {
    await client.end();
  }
}

// The independent check: read the schema and the migrations table back with plain queries.
async function printCheck(query: Query, log: (line: string) => void) {
  const tables = await query<{ table_name: string }>(TABLES_SQL);
  log(`Public tables: ${tables.map((row) => row.table_name).join(", ") || "(none)"}`);
  const applied = await query<{ id: number; hash: string; created_at: string }>(APPLIED_SQL);
  log(`Applied migrations: ${applied.length}`);
  for (const row of applied) log(`  ${row.id} ${row.hash.slice(0, 12)} ${row.created_at}`);
}
