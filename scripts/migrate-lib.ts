// Migration logic behind scripts/migrate.ts, kept separate so it can be tested.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client as NeonClient } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { Client as PgClient } from "pg";

export type MigrationDriver = "node-postgres" | "neon-serverless";
export type MigrationTarget = { url: string; host: string; database: string; driver: MigrationDriver };

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

// Neon targets use Neon's WebSocket driver (port 443), because Postgres on port 5432 is blocked from
// Claude's cloud environment. Unlike Neon's HTTPS driver it holds one session open, so Drizzle's migrator
// runs every pending migration inside one transaction (backlog item 6). Everything else uses node-postgres,
// the app's runtime driver. Any database not on localhost needs --remote.
export function resolveTarget(url: string | undefined, argv: string[]): MigrationTarget {
  if (!url) throw new Error("Missing environment variable DATABASE_URL.");
  const { hostname, pathname } = new URL(url);
  if (!LOCAL_HOSTS.includes(hostname) && !argv.includes("--remote")) {
    throw new Error("Refusing to migrate a remote database without --remote.");
  }
  const driver: MigrationDriver = hostname.endsWith(".neon.tech") ? "neon-serverless" : "node-postgres";
  return { url, host: hostname, database: pathname, driver };
}

type Log = (line: string) => void;
type Options = { checkOnly?: boolean; rehearse?: string; migrationsFolder?: string; log?: Log };
// Both drivers expose the same pg-style client; this is the part the check and rehearsal use.
type SqlClient = { query(text: string): Promise<{ rows: unknown[] }> };

async function rowsOf<T>(client: SqlClient, text: string): Promise<T[]> {
  return (await client.query(text)).rows as T[];
}

const TABLES_SQL = "select table_name from information_schema.tables where table_schema = 'public' order by table_name";
const TRACKING_SQL = "select to_regclass('drizzle.__drizzle_migrations') is not null as present";
const APPLIED_SQL = "select id, hash, created_at from drizzle.__drizzle_migrations order by id";

export async function runMigrations(target: MigrationTarget, options: Options = {}): Promise<void> {
  const log = options.log ?? console.log;
  const migrationsFolder = options.migrationsFolder ?? "./drizzle";
  log(`Target: ${target.host}${target.database}`);
  log(
    `Driver: ${target.driver === "neon-serverless" ? "neon-serverless (WebSocket, port 443, one transaction)" : "node-postgres (one transaction)"}`,
  );

  const client =
    target.driver === "neon-serverless"
      ? new NeonClient({ connectionString: target.url })
      : new PgClient({ connectionString: target.url });
  await client.connect();
  try {
    if (options.rehearse) {
      await rehearse(client, join(migrationsFolder, `${options.rehearse}.sql`), log);
    } else if (!options.checkOnly) {
      if (client instanceof NeonClient) await migrateNeon(drizzleNeon({ client }), { migrationsFolder });
      else await migrateNodePg(drizzleNodePg({ client }), { migrationsFolder });
      log("Migrator finished.");
    }
    await printCheck(client, log);
  } finally {
    await client.end();
  }
}

// Runs one migration's SQL inside BEGIN ... ROLLBACK and prints the tables seen inside the transaction.
// Proves transactional DDL on the target without changing it. The migrations table is not touched.
async function rehearse(client: SqlClient, file: string, log: Log) {
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  log(`Rehearsal: ${statements.length} statements from ${file}, inside BEGIN ... ROLLBACK`);
  await client.query("begin");
  try {
    for (const statement of statements) await client.query(statement);
    const rows = await rowsOf<{ table_name: string }>(client, TABLES_SQL);
    log(`Inside the transaction: ${rows.map((row) => row.table_name).join(", ")}`);
  } finally {
    await client.query("rollback");
  }
  log("Rolled back.");
}

// The independent check: read the schema and the migrations table back with plain queries.
async function printCheck(client: SqlClient, log: Log) {
  const tables = await rowsOf<{ table_name: string }>(client, TABLES_SQL);
  log(`Public tables: ${tables.map((row) => row.table_name).join(", ") || "(none)"}`);
  const [tracking] = await rowsOf<{ present: boolean }>(client, TRACKING_SQL);
  const applied = tracking.present ? await rowsOf<{ id: number; hash: string; created_at: string }>(client, APPLIED_SQL) : [];
  log(`Applied migrations: ${applied.length}`);
  for (const row of applied) log(`  ${row.id} ${row.hash.slice(0, 12)} ${row.created_at}`);
}
