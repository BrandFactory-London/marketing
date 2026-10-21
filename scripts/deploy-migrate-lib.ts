// Production migrations in the Vercel build (γ4 orientation, "Proposal: production migrations in the Vercel
// build", approved 21 Oct 2026). On a production build only: guard the target, stop if nothing is pending,
// back up production as a Neon branch, keep the newest three backups, migrate in one transaction under an
// advisory lock, then check the applied hashes against the journal. Any failure throws, which fails the build
// and leaves the live version in place.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";

export const DEV_HOST_MARK = "ep-square-mode-zatw6e39";
export const BACKUP_PREFIX = "backup/";
export const KEEP_BACKUPS = 3;
// Any fixed number works; every production build uses the same one.
export const MIGRATION_LOCK_KEY = 4_204_202_604;

type Log = (line: string) => void;

export type SqlClient = { query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>; end(): Promise<void> };

export type NeonBranch = { id: string; name: string; created_at: string; current_state?: string };

export type NeonApi = {
  createBranch(name: string): Promise<NeonBranch>;
  getBranch(id: string): Promise<NeonBranch>;
  listBranches(): Promise<NeonBranch[]>;
  deleteBranch(id: string): Promise<void>;
};

export type DeployDeps = {
  env: Record<string, string | undefined>;
  log?: Log;
  migrationsFolder?: string;
  connect: (url: string) => Promise<SqlClient>;
  // Applies every pending migration in one transaction on the given client.
  migrate: (client: SqlClient, migrationsFolder: string) => Promise<void>;
  neon?: NeonApi;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  backupTimeoutMs?: number;
};

export type DeployResult = { status: "skipped-not-production" | "nothing-pending" | "migrated"; backup?: string; applied?: string[] };

// The direct (not pooled) Neon connection to production, never the dev branch.
export function checkProductionTarget(url: string | undefined): URL {
  if (!url) throw new Error("Missing environment variable MIGRATION_DATABASE_URL.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("MIGRATION_DATABASE_URL is not a valid connection string.");
  }
  const host = parsed.hostname;
  if (!host.endsWith(".neon.tech")) throw new Error(`Refusing to migrate ${host}: not a Neon host.`);
  if (host.includes(DEV_HOST_MARK)) throw new Error("Refusing to migrate: MIGRATION_DATABASE_URL points at the Neon dev branch.");
  if (host.includes("-pooler.")) throw new Error("Refusing to migrate through the pooler. Use the direct connection string for MIGRATION_DATABASE_URL.");
  return parsed;
}

export type JournalMigration = { tag: string; hash: string; folderMillis: number };

export function journalMigrations(migrationsFolder: string): JournalMigration[] {
  const files = readMigrationFiles({ migrationsFolder });
  const tags = (JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")) as { entries: { tag: string; when: number }[] }).entries;
  return files.map((file) => ({ tag: tags.find((entry) => entry.when === file.folderMillis)?.tag ?? String(file.folderMillis), hash: file.hash, folderMillis: file.folderMillis }));
}

type Applied = { hash: string; created_at: string };

async function appliedMigrations(client: SqlClient): Promise<Applied[]> {
  const [tracking] = (await client.query("select to_regclass('drizzle.__drizzle_migrations') is not null as present")).rows as { present: boolean }[];
  if (!tracking.present) return [];
  return (await client.query("select hash, created_at from drizzle.__drizzle_migrations order by id")).rows as Applied[];
}

// Drizzle applies every journal entry newer than the last applied one.
export function pendingMigrations(journal: readonly JournalMigration[], applied: readonly Applied[]): JournalMigration[] {
  const last = applied.length ? Math.max(...applied.map((row) => Number(row.created_at))) : -Infinity;
  return journal.filter((migration) => migration.folderMillis > last);
}

export function backupName(tag: string, commit: string | undefined, at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${BACKUP_PREFIX}pre-${tag}-${(commit ?? "local").slice(0, 7)}-${stamp}`;
}

// Only branches named backup/... are ever deleted, oldest first, keeping the newest KEEP_BACKUPS.
export function backupsToDelete(branches: readonly NeonBranch[], keep = KEEP_BACKUPS): NeonBranch[] {
  return branches
    .filter((branch) => branch.name.startsWith(BACKUP_PREFIX))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(keep);
}

export async function deployMigrate(deps: DeployDeps): Promise<DeployResult> {
  const log = deps.log ?? console.log;
  const env = deps.env;
  const migrationsFolder = deps.migrationsFolder ?? "./drizzle";
  if (env.VERCEL_ENV !== "production") {
    log(`Not a production build (VERCEL_ENV=${env.VERCEL_ENV ?? "unset"}): no migration.`);
    return { status: "skipped-not-production" };
  }
  const target = checkProductionTarget(env.MIGRATION_DATABASE_URL);
  log(`Target: ${target.hostname}${target.pathname}`);
  const journal = journalMigrations(migrationsFolder);
  const client = await deps.connect(target.toString());
  try {
    const pending = pendingMigrations(journal, await appliedMigrations(client));
    if (pending.length === 0) {
      log(`Nothing pending: ${journal.length} migrations already applied. No backup, no migration.`);
      return { status: "nothing-pending" };
    }
    log(`Pending: ${pending.map((migration) => migration.tag).join(", ")}`);

    const backup = await createBackup(deps, pending[pending.length - 1].tag, log);
    await pruneBackups(deps, log);

    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    try {
      // Another build may have migrated while this one waited for the lock; the migrator then does nothing.
      await deps.migrate(client, migrationsFolder);
      log("Migrator finished.");
    } finally {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    }

    // The independent check: the applied hashes, read back, must equal the journal's, in order.
    const applied = await appliedMigrations(client);
    const tables = (await client.query("select table_name from information_schema.tables where table_schema = 'public' order by table_name")).rows as { table_name: string }[];
    log(`Public tables: ${tables.map((row) => row.table_name).join(", ")}`);
    log(`Applied migrations: ${applied.length}`);
    applied.forEach((row, index) => log(`  ${index + 1} ${row.hash.slice(0, 12)} ${row.created_at}`));
    const expected = journal.map((migration) => migration.hash);
    const actual = applied.map((row) => row.hash);
    if (expected.length !== actual.length || expected.some((hash, index) => hash !== actual[index])) {
      throw new Error("Check failed: the applied migrations do not match drizzle/meta/_journal.json.");
    }
    log("Check passed: applied hashes match the journal.");
    return { status: "migrated", backup, applied: pending.map((migration) => migration.tag) };
  } finally {
    await client.end();
  }
}

async function createBackup(deps: DeployDeps, tag: string, log: Log): Promise<string> {
  if (!deps.neon) throw new Error("Missing the Neon API settings (NEON_API_KEY, NEON_PROJECT_ID, NEON_PRODUCTION_BRANCH_ID), so no backup can be made.");
  const name = backupName(tag, deps.env.VERCEL_GIT_COMMIT_SHA, (deps.now ?? (() => new Date()))());
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeout = deps.backupTimeoutMs ?? 120_000;
  const branch = await deps.neon.createBranch(name);
  log(`Backup branch requested: ${name} (${branch.id})`);
  const started = Date.now();
  for (let state = branch.current_state; state !== "ready"; ) {
    if (Date.now() - started > timeout) throw new Error(`Backup branch ${name} was not ready within ${timeout / 1000} seconds. Nothing was migrated.`);
    await sleep(2000);
    state = (await deps.neon.getBranch(branch.id)).current_state;
  }
  log(`Backup branch ready: ${name}`);
  return name;
}

// A failed prune never blocks the deploy; it is reported in the build log.
async function pruneBackups(deps: DeployDeps, log: Log) {
  try {
    const old = backupsToDelete(await deps.neon!.listBranches());
    for (const branch of old) {
      await deps.neon!.deleteBranch(branch.id);
      log(`Deleted old backup branch: ${branch.name}`);
    }
    if (old.length === 0) log(`Backups kept: no more than ${KEEP_BACKUPS}, nothing to delete.`);
  } catch (error) {
    log(`Warning: old backup branches could not be pruned: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// The Neon API (https://api-docs.neon.tech). A branch with no compute endpoint costs storage only.
export function neonApi(apiKey: string, projectId: string, parentBranchId: string, fetchImpl: typeof fetch = fetch): NeonApi {
  const base = `https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}`;
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json", "content-type": "application/json", ...init.headers },
    });
    if (!response.ok) throw new Error(`Neon API ${init.method ?? "GET"} ${path} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return (await response.json()) as T;
  }
  return {
    createBranch: async (name) => (await call<{ branch: NeonBranch }>("/branches", { method: "POST", body: JSON.stringify({ branch: { parent_id: parentBranchId, name } }) })).branch,
    getBranch: async (id) => (await call<{ branch: NeonBranch }>(`/branches/${encodeURIComponent(id)}`)).branch,
    listBranches: async () => (await call<{ branches: NeonBranch[] }>("/branches")).branches,
    deleteBranch: async (id) => {
      await call(`/branches/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}
