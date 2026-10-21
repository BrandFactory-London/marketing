import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { neonConfig } from "@neondatabase/serverless";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { resolveTarget, runMigrations } from "./migrate-lib";

const neonUrl = "postgres://user:secret@ep-cool-name-123.eu-west-2.aws.neon.tech/neondb?sslmode=require";

describe("migration target", () => {
  it("uses node-postgres for localhost without --remote", () => {
    expect(resolveTarget("postgres://postgres@localhost:5433/bfm", [])).toMatchObject({
      host: "localhost",
      database: "/bfm",
      driver: "node-postgres",
    });
  });

  it("refuses a Neon database without --remote", () => {
    expect(() => resolveTarget(neonUrl, [])).toThrow("without --remote");
  });

  it("uses Neon's WebSocket driver for a Neon database with --remote", () => {
    expect(resolveTarget(neonUrl, ["--remote"])).toMatchObject({
      host: "ep-cool-name-123.eu-west-2.aws.neon.tech",
      database: "/neondb",
      driver: "neon-serverless",
    });
  });

  it("keeps node-postgres for other remote hosts, still behind --remote", () => {
    expect(() => resolveTarget("postgres://u:p@db.example.com/app", [])).toThrow("without --remote");
    expect(resolveTarget("postgres://u:p@db.example.com/app", ["--remote"]).driver).toBe("node-postgres");
  });

  it("does not treat a lookalike host as Neon", () => {
    expect(resolveTarget("postgres://u:p@neon.tech.example.com/app", ["--remote"]).driver).toBe("node-postgres");
  });

  it("fails clearly without DATABASE_URL", () => {
    expect(() => resolveTarget(undefined, ["--remote"])).toThrow("DATABASE_URL");
  });
});

// Runs the real Drizzle neon-serverless migrator through the real Neon driver. A small relay stands in for
// Neon's WebSocket proxy: each WebSocket connection is piped to a TCP connection to the local Postgres, so the
// driver speaks the Postgres wire protocol to a scratch database exactly as it would to Neon.
const adminUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!adminUrl)("neon-serverless migration path (local WebSocket relay)", () => {
  const scratch = "bfm_neon_ws_test";
  const admin = adminUrl ? new URL(adminUrl) : new URL("postgres://localhost");
  const scratchUrl = Object.assign(new URL(admin.toString()), { pathname: `/${scratch}` }).toString();
  // The host makes resolveTarget pick the Neon driver; the relay ignores it and connects locally.
  const relayedUrl = Object.assign(new URL(scratchUrl), { host: "ep-relay-test.eu-west-2.aws.neon.tech" }).toString();
  const target = resolveTarget(relayedUrl, ["--remote"]);
  let relay: WebSocketServer;
  let relayed = 0;
  let fixtures: string;
  const saved = {
    wsProxy: neonConfig.wsProxy,
    useSecureWebSocket: neonConfig.useSecureWebSocket,
    pipelineConnect: neonConfig.pipelineConnect,
  };

  async function sql<T extends object = Record<string, unknown>>(text: string, url = scratchUrl) {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      return (await client.query<T>(text)).rows;
    } finally {
      await client.end();
    }
  }

  async function tables() {
    return (await sql<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    )).map((row) => row.table_name);
  }

  async function appliedCount() {
    const exists = await sql<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'drizzle'");
    if (exists[0].n === 0) return 0;
    return (await sql<{ n: number }>("select count(*)::int as n from drizzle.__drizzle_migrations"))[0].n;
  }

  // A migrations folder with the given migrations, in Drizzle's journal format.
  function folder(name: string, migrations: { tag: string; statements: string[] }[]) {
    const dir = join(fixtures, name);
    mkdirSync(join(dir, "meta"), { recursive: true });
    const entries = migrations.map((migration, idx) => {
      writeFileSync(join(dir, `${migration.tag}.sql`), migration.statements.join("\n--> statement-breakpoint\n"));
      return { idx, version: "7", when: 1792531354466 + idx, tag: migration.tag, breakpoints: true };
    });
    writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify({ version: "7", dialect: "postgresql", entries }));
    return dir;
  }

  const good = { tag: "0000_good", statements: ['CREATE TABLE "alpha" ("id" integer PRIMARY KEY)'] };
  const failing = {
    tag: "0001_failing",
    statements: [
      'CREATE TABLE "beta" ("id" integer PRIMARY KEY)',
      'CREATE TABLE "gamma" ("beta_id" integer REFERENCES "missing_table"("id"))',
    ],
  };

  beforeAll(async () => {
    fixtures = mkdtempSync(join(tmpdir(), "bfm-migrate-"));
    relay = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    relay.on("connection", (socket) => {
      relayed += 1;
      const tcp = createConnection({ host: admin.hostname, port: Number(admin.port || 5432) });
      socket.on("message", (data) => tcp.write(data as Buffer));
      tcp.on("data", (data) => socket.send(data));
      socket.on("close", () => tcp.end());
      tcp.on("close", () => socket.close());
      tcp.on("error", () => socket.close());
    });
    await new Promise<void>((resolve) => relay.on("listening", () => resolve()));
    const { port } = relay.address() as AddressInfo;
    neonConfig.wsProxy = () => `127.0.0.1:${port}`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineConnect = false;
  });

  beforeEach(async () => {
    await sql(`drop database if exists ${scratch} with (force)`, adminUrl);
    await sql(`create database ${scratch}`, adminUrl);
  });

  afterAll(async () => {
    Object.assign(neonConfig, saved);
    await new Promise<void>((resolve) => relay.close(() => resolve()));
    await sql(`drop database if exists ${scratch} with (force)`, adminUrl);
    rmSync(fixtures, { recursive: true, force: true });
  });

  it("applies the repo's migrations and prints the independent check, then is a no-op on a second run", async () => {
    expect(target.driver).toBe("neon-serverless");
    const before = relayed;
    const first: string[] = [];
    await runMigrations(target, { log: (line) => first.push(line) });
    expect(first[0]).toBe(`Target: ep-relay-test.eu-west-2.aws.neon.tech/${scratch}`);
    expect(first[1]).toBe("Driver: neon-serverless (WebSocket, port 443, one transaction)");
    expect(first).toContain("Migrator finished.");
    expect(relayed).toBe(before + 1);
    expect(first.find((line) => line.startsWith("Public tables:"))).toContain("app_settings");

    const applied = await appliedCount();
    expect(applied).toBeGreaterThan(0);
    const second: string[] = [];
    await runMigrations(target, { log: (line) => second.push(line) });
    expect(second).toContain(`Applied migrations: ${applied}`);
    // Independent of the relay and the Neon driver: read the scratch database directly.
    expect(await appliedCount()).toBe(applied);
    expect(await sql("select conname from pg_constraint where conname = 'app_settings_single_row'")).toHaveLength(1);
  });

  it("rolls back every pending migration when one fails partway", async () => {
    const migrationsFolder = folder("both", [good, failing]);
    await expect(runMigrations(target, { migrationsFolder, log: () => {} })).rejects.toThrow();
    // Drizzle runs all pending migrations in one transaction, so neither the good one nor the first
    // statement of the failing one survives, and no migration row is written.
    expect(await tables()).toEqual([]);
    expect(await appliedCount()).toBe(0);
  });

  it("keeps earlier applied migrations and rolls back only the failing run", async () => {
    await runMigrations(target, { migrationsFolder: folder("first", [good]), log: () => {} });
    expect(await tables()).toEqual(["alpha"]);
    await expect(runMigrations(target, { migrationsFolder: folder("second", [good, failing]), log: () => {} })).rejects.toThrow();
    expect(await tables()).toEqual(["alpha"]);
    expect(await appliedCount()).toBe(1);
  });

  it("rehearses a migration inside a transaction and leaves the database unchanged", async () => {
    const migrationsFolder = folder("rehearse", [{ tag: "0000_rehearse", statements: ['CREATE TABLE "delta" ("id" integer)', 'CREATE TABLE "epsilon" ("id" integer)'] }]);
    const lines: string[] = [];
    await runMigrations(target, { migrationsFolder, rehearse: "0000_rehearse", log: (line) => lines.push(line) });
    expect(lines).toContain("Inside the transaction: delta, epsilon");
    expect(lines).toContain("Rolled back.");
    expect(lines).toContain("Public tables: (none)");
    expect(await tables()).toEqual([]);
  });

  it("supports --check-only without running the migrator", async () => {
    await runMigrations(target, { migrationsFolder: folder("check", [good]), log: () => {} });
    const lines: string[] = [];
    await runMigrations(target, { checkOnly: true, migrationsFolder: folder("check-more", [good, failing]), log: (line) => lines.push(line) });
    expect(lines).not.toContain("Migrator finished.");
    expect(lines).toContain("Public tables: alpha");
    expect(lines).toContain("Applied migrations: 1");
  });
});
