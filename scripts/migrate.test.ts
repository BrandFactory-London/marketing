import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { neonConfig } from "@neondatabase/serverless";
import { Client, types } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  it("uses Neon's HTTPS driver for a Neon database with --remote", () => {
    expect(resolveTarget(neonUrl, ["--remote"])).toMatchObject({
      host: "ep-cool-name-123.eu-west-2.aws.neon.tech",
      database: "/neondb",
      driver: "neon-http",
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

// Runs the real Drizzle neon-http migrator through the real Neon driver. A small shim speaks Neon's
// SQL-over-HTTP protocol (POST {query, params}, rows returned as arrays of text) to a scratch local database.
const adminUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!adminUrl)("neon-http migration path (local shim)", () => {
  const scratch = "bfm_neon_http_test";
  const scratchUrl = adminUrl ? Object.assign(new URL(adminUrl), { pathname: `/${scratch}` }).toString() : "";
  let server: Server;
  const requests: string[] = [];
  const originalEndpoint = neonConfig.fetchEndpoint;

  async function admin(text: string) {
    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
      await client.query(text);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    await admin(`drop database if exists ${scratch}`);
    await admin(`create database ${scratch}`);
    const rawText = { getTypeParser: () => (value: string) => value } as unknown as typeof types;
    server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { query, params } = JSON.parse(body) as { query: string; params: unknown[] };
      requests.push(query);
      const client = new Client({ connectionString: scratchUrl, types: rawText });
      await client.connect();
      try {
        const result = await client.query({ text: query, values: params, rowMode: "array" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          command: result.command,
          rowCount: result.rowCount,
          fields: result.fields.map((field) => ({ name: field.name, dataTypeID: field.dataTypeID })),
          rows: result.rows,
        }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: error instanceof Error ? error.message : String(error) }));
      } finally {
        await client.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    neonConfig.fetchEndpoint = `http://127.0.0.1:${port}/sql`;
  });

  afterAll(async () => {
    neonConfig.fetchEndpoint = originalEndpoint;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await admin(`drop database if exists ${scratch}`);
  });

  it("applies the migration and prints the independent check, then is a no-op on a second run", async () => {
    const target = resolveTarget(neonUrl, ["--remote"]);
    expect(target.driver).toBe("neon-http");

    const first: string[] = [];
    await runMigrations(target, { log: (line) => first.push(line) });
    expect(first[0]).toBe("Target: ep-cool-name-123.eu-west-2.aws.neon.tech/neondb");
    expect(first[1]).toBe("Driver: neon-http (HTTPS, port 443)");
    expect(first).toContain("Migrator finished.");
    expect(first).toContain("Public tables: accounts, app_settings, google_tokens, sessions, users");
    expect(first).toContain("Applied migrations: 1");
    expect(requests.some((query) => query.includes('CREATE TABLE "google_tokens"'))).toBe(true);

    const second: string[] = [];
    await runMigrations(target, { log: (line) => second.push(line) });
    expect(second).toContain("Applied migrations: 1");

    // Independent of the shim and the Neon driver: read the scratch database directly.
    const client = new Client({ connectionString: scratchUrl });
    await client.connect();
    try {
      const { rows } = await client.query("select count(*)::int as n from drizzle.__drizzle_migrations");
      expect(rows[0].n).toBe(1);
      const check = await client.query("select conname from pg_constraint where conname = 'app_settings_single_row'");
      expect(check.rowCount).toBe(1);
    } finally {
      await client.end();
    }
  });

  it("supports --check-only without running the migrator", async () => {
    const lines: string[] = [];
    await runMigrations(resolveTarget(neonUrl, ["--remote"]), { checkOnly: true, log: (line) => lines.push(line) });
    expect(lines).not.toContain("Migrator finished.");
    expect(lines).toContain("Applied migrations: 1");
  });
});
