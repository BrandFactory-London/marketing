// Applies generated migrations, then runs an independent check against the database (methodology D.4.2, D.4.4).
// Refuses any database that is not on localhost unless --remote is passed, so nothing reaches Neon by accident.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing environment variable DATABASE_URL.");
  const { hostname, pathname } = new URL(url);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  console.log(`Target: ${hostname}${pathname}`);
  if (!isLocal && !process.argv.includes("--remote")) {
    throw new Error("Refusing to migrate a remote database without --remote.");
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (!process.argv.includes("--check-only")) {
      await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
      console.log("Migrator finished.");
    }

    const tables = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    console.log(`Public tables: ${tables.rows.map((row) => row.table_name).join(", ") || "(none)"}`);
    const applied = await client.query<{ id: number; hash: string; created_at: string }>(
      "select id, hash, created_at from drizzle.__drizzle_migrations order by id",
    );
    console.log(`Applied migrations: ${applied.rowCount}`);
    for (const row of applied.rows) console.log(`  ${row.id} ${row.hash.slice(0, 12)} ${row.created_at}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
