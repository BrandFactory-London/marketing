import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  backupName,
  backupsToDelete,
  checkProductionTarget,
  deployMigrate,
  neonApi,
  pendingMigrations,
  type DeployDeps,
  type NeonApi,
  type NeonBranch,
  type SqlClient,
} from "./deploy-migrate-lib";

const PROD = "postgres://user:secret@ep-proud-river-123.eu-west-2.aws.neon.tech/neondb?sslmode=require";

describe("production target guard", () => {
  it("accepts the direct Neon production connection", () => {
    expect(checkProductionTarget(PROD).hostname).toBe("ep-proud-river-123.eu-west-2.aws.neon.tech");
  });

  it("refuses the dev branch, the pooler, other hosts and a missing value", () => {
    expect(() => checkProductionTarget("postgres://u:p@ep-square-mode-zatw6e39.eu-west-2.aws.neon.tech/neondb")).toThrow("Neon dev branch");
    expect(() => checkProductionTarget("postgres://u:p@ep-proud-river-123-pooler.eu-west-2.aws.neon.tech/neondb")).toThrow("pooler");
    expect(() => checkProductionTarget("postgres://u:p@localhost:5433/bfm")).toThrow("not a Neon host");
    expect(() => checkProductionTarget(undefined)).toThrow("Missing environment variable MIGRATION_DATABASE_URL.");
  });
});

describe("decisions", () => {
  const journal = [
    { tag: "0000_init", hash: "a", folderMillis: 100 },
    { tag: "0001_more", hash: "b", folderMillis: 200 },
  ];

  it("finds what is pending the way Drizzle does", () => {
    expect(pendingMigrations(journal, [])).toEqual(journal);
    expect(pendingMigrations(journal, [{ hash: "a", created_at: "100" }]).map((m) => m.tag)).toEqual(["0001_more"]);
    expect(pendingMigrations(journal, [{ hash: "a", created_at: "100" }, { hash: "b", created_at: "200" }])).toEqual([]);
  });

  it("names backups by migration, commit and UTC time", () => {
    expect(backupName("0003_generation", "e26dcb8abcdef", new Date("2026-10-21T15:30:12.345Z"))).toBe("backup/pre-0003_generation-e26dcb8-20261021T153012Z");
  });

  it("deletes only backup branches beyond the newest three", () => {
    const branches: NeonBranch[] = [
      { id: "main", name: "main", created_at: "2026-01-01T00:00:00Z" },
      { id: "dev", name: "dev", created_at: "2026-01-02T00:00:00Z" },
      { id: "b1", name: "backup/pre-0001", created_at: "2026-10-01T00:00:00Z" },
      { id: "b2", name: "backup/pre-0002", created_at: "2026-10-05T00:00:00Z" },
      { id: "b3", name: "backup/pre-0003", created_at: "2026-10-10T00:00:00Z" },
      { id: "b4", name: "backup/pre-0004", created_at: "2026-10-21T00:00:00Z" },
      { id: "b0", name: "backup/pre-0000", created_at: "2026-09-01T00:00:00Z" },
      { id: "x", name: "my-backup/keep", created_at: "2020-01-01T00:00:00Z" },
    ];
    expect(backupsToDelete(branches).map((branch) => branch.id)).toEqual(["b1", "b0"]);
  });

  it("talks to the Neon API with a branch that has no compute", async () => {
    const requests: { url: string; method: string; body?: unknown }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ branch: { id: "br-new", name: "backup/x", created_at: "t", current_state: "init" } }), { status: 201 });
    }) as typeof fetch;
    const api = neonApi("key", "proj-1", "br-main", fake);
    await api.createBranch("backup/x");
    expect(requests[0]).toEqual({
      url: "https://console.neon.tech/api/v2/projects/proj-1/branches",
      method: "POST",
      body: { branch: { parent_id: "br-main", name: "backup/x" } },
    });
  });
});

const localUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!localUrl)("the whole step against a scratch database (local Postgres)", () => {
  const database = "bfm_deploy_migrate_test";
  const admin = () => new Client({ connectionString: localUrl!.replace(/\/[^/]+$/, "/postgres") });
  const scratchUrl = localUrl!.replace(/\/[^/]+$/, `/${database}`);
  let lines: string[];
  let neonCalls: string[];
  let branches: NeonBranch[];

  async function recreate() {
    const client = admin();
    await client.connect();
    await client.query(`drop database if exists ${database}`);
    await client.query(`create database ${database}`);
    await client.end();
  }

  beforeAll(recreate);
  afterAll(async () => {
    const client = admin();
    await client.connect();
    await client.query(`drop database if exists ${database}`);
    await client.end();
  });

  beforeEach(async () => {
    await recreate();
    lines = [];
    neonCalls = [];
    branches = ["b1", "b2", "b3"].map((id, index) => ({ id, name: `backup/pre-${index}`, created_at: `2026-10-0${index + 1}T00:00:00Z` }));
  });

  function fakeNeon(overrides: Partial<NeonApi> = {}): NeonApi {
    return {
      createBranch: async (name) => {
        neonCalls.push(`create ${name}`);
        const branch = { id: "b-new", name, created_at: "2026-10-21T00:00:00Z", current_state: "init" };
        branches.push(branch);
        return branch;
      },
      getBranch: async (id) => {
        neonCalls.push(`get ${id}`);
        return { id, name: "", created_at: "", current_state: "ready" };
      },
      listBranches: async () => branches,
      deleteBranch: async (id) => {
        neonCalls.push(`delete ${id}`);
      },
      ...overrides,
    };
  }

  function deps(overrides: Partial<DeployDeps> = {}): DeployDeps {
    return {
      env: { VERCEL_ENV: "production", MIGRATION_DATABASE_URL: PROD, VERCEL_GIT_COMMIT_SHA: "abcdef1234" },
      log: (line) => lines.push(line),
      migrationsFolder: "./drizzle",
      // The guard sees the production URL; the test points the connection at the scratch database.
      connect: async () => {
        const client = new Client({ connectionString: scratchUrl });
        await client.connect();
        return client as unknown as SqlClient;
      },
      migrate: async (client, migrationsFolder) => {
        await migrate(drizzle({ client: client as unknown as Client }), { migrationsFolder });
      },
      neon: fakeNeon(),
      now: () => new Date("2026-10-21T15:30:00Z"),
      sleep: async () => {},
      ...overrides,
    };
  }

  async function appliedCount(): Promise<number> {
    const client = new Client({ connectionString: scratchUrl });
    await client.connect();
    try {
      const [{ present }] = (await client.query("select to_regclass('drizzle.__drizzle_migrations') is not null as present")).rows;
      return present ? Number((await client.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count) : 0;
    } finally {
      await client.end();
    }
  }

  it("does nothing on a preview build", async () => {
    expect(await deployMigrate(deps({ env: { VERCEL_ENV: "preview" } }))).toEqual({ status: "skipped-not-production" });
    expect(neonCalls).toEqual([]);
  });

  it("backs up, prunes to three, migrates, checks, then has nothing pending next time", async () => {
    const result = await deployMigrate(deps());
    expect(result).toMatchObject({ status: "migrated", backup: "backup/pre-0003_generation-abcdef1-20261021T153000Z" });
    expect(result.applied).toEqual(["0000_init", "0001_crm_projects_knowledge", "0002_posts", "0003_generation"]);
    expect(neonCalls).toEqual(["create backup/pre-0003_generation-abcdef1-20261021T153000Z", "get b-new", "delete b1"]);
    const order = ["Backup branch ready", "Deleted old backup branch", "Migrator finished.", "Check passed"].map((start) =>
      lines.findIndex((line) => line.startsWith(start)),
    );
    expect(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1]))).toBe(true);
    expect(await appliedCount()).toBe(4);

    neonCalls = [];
    expect(await deployMigrate(deps())).toEqual({ status: "nothing-pending" });
    expect(neonCalls).toEqual([]);
  });

  it("migrates nothing when the backup cannot be made", async () => {
    const neon = fakeNeon({
      createBranch: async () => {
        throw new Error("Neon API POST /branches returned 423: project is locked");
      },
    });
    await expect(deployMigrate(deps({ neon }))).rejects.toThrow("returned 423");
    expect(await appliedCount()).toBe(0);
  });

  it("migrates nothing when the backup never becomes ready", async () => {
    const neon = fakeNeon({ getBranch: async (id) => ({ id, name: "", created_at: "", current_state: "init" }) });
    await expect(deployMigrate(deps({ neon, backupTimeoutMs: -1 }))).rejects.toThrow("was not ready");
    expect(await appliedCount()).toBe(0);
  });

  it("refuses to migrate without the Neon settings", async () => {
    await expect(deployMigrate(deps({ neon: undefined }))).rejects.toThrow("no backup can be made");
    expect(await appliedCount()).toBe(0);
  });

  it("rolls back every pending migration when one fails", async () => {
    const folder = mkdtempSync(join(tmpdir(), "bfm-migrations-"));
    try {
      mkdirSync(join(folder, "meta"));
      writeFileSync(join(folder, "0000_good.sql"), "create table deploy_probe (id int);");
      writeFileSync(join(folder, "0001_bad.sql"), "create table deploy_probe_two (id int);\n--> statement-breakpoint\nselect * from no_such_table;");
      writeFileSync(
        join(folder, "meta", "_journal.json"),
        JSON.stringify({
          version: "7",
          dialect: "postgresql",
          entries: [
            { idx: 0, version: "7", when: 1, tag: "0000_good", breakpoints: true },
            { idx: 1, version: "7", when: 2, tag: "0001_bad", breakpoints: true },
          ],
        }),
      );
      await expect(deployMigrate(deps({ migrationsFolder: folder }))).rejects.toThrow();
      const client = new Client({ connectionString: scratchUrl });
      await client.connect();
      const { rows } = await client.query("select to_regclass('public.deploy_probe') as probe");
      await client.end();
      expect(rows[0].probe).toBeNull();
      expect(await appliedCount()).toBe(0);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("fails the build when the applied hashes do not match the journal", async () => {
    await expect(deployMigrate(deps({ migrate: async () => {} }))).rejects.toThrow("do not match");
  });
});
