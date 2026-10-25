import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 0009_plans (Phase 2 A3) on a scratch database in production's shape after A2: the package column goes, Migss's
// projects get their four categories, other projects none, and existing rule candidates still pass the wider check.

const localUrl = process.env.TEST_DATABASE_URL;
const database = "bfm_migration_0009_test";

describe.skipIf(!localUrl)("migration 0009_plans (local Postgres)", () => {
  const admin = () => new Client({ connectionString: localUrl!.replace(/\/[^/]+$/, "/postgres") });
  let client: Client;
  let folder: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const root = admin();
    await root.connect();
    await root.query(`drop database if exists ${database}`);
    await root.query(`create database ${database}`);
    await root.end();

    folder = mkdtempSync(join(tmpdir(), "bfm-0009-"));
    cpSync("drizzle", folder, { recursive: true });
    const journalPath = join(folder, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < "0009");
    writeFileSync(journalPath, JSON.stringify(journal));

    client = new Client({ connectionString: localUrl!.replace(/\/[^/]+$/, `/${database}`) });
    await client.connect();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: folder });

    const one = async (text: string, values: unknown[] = []) => (await client.query(text, values)).rows[0].id as string;
    ids.migss = await one(`insert into clients (name) values ('Migss Interiors') returning id`);
    ids.other = await one(`insert into clients (name) values ('Another client') returning id`);
    ids.site = await one(`insert into projects (client_id, name, site_url, status, package) values ($1, 'Migss Interiors Website', 'https://www.migssinteriors.com', 'active', 'mid') returning id`, [ids.migss]);
    ids.otherSite = await one(`insert into projects (client_id, name, site_url, status) values ($1, 'Another site', 'https://example.com', 'active') returning id`, [ids.other]);
    ids.post = await one(`insert into posts (project_id, slot_date, status, topic) values ($1, '2026-11-03', 'in_review', 'Wet room maintenance') returning id`, [ids.site]);
    ids.event = await one(`insert into review_events (post_id, action, note) values ($1, 'regenerate', 'Shorter') returning id`, [ids.post]);
    ids.candidate = await one(`insert into rule_candidates (review_event_id, post_id, tier, section, text) values ($1, $2, 'agency', 'writing_rules', 'Keep it short.') returning id`, [ids.event, ids.post]);

    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await client?.end();
    if (folder) rmSync(folder, { recursive: true, force: true });
    const root = admin();
    await root.connect();
    await root.query(`drop database if exists ${database}`);
    await root.end();
  });

  it("drops the package column and its check", async () => {
    expect((await client.query(`select column_name from information_schema.columns where table_name = 'projects' and column_name = 'package'`)).rows).toEqual([]);
    expect((await client.query(`select conname from pg_constraint where conname = 'projects_package_check'`)).rows).toEqual([]);
  });

  it("seeds Migss's four categories and nothing for other projects", async () => {
    const { rows } = await client.query(`select project_id, label from project_categories order by position`);
    expect(rows).toEqual(["Finance", "Guarantee", "Cost", "Technical"].map((label) => ({ project_id: ids.site, label })));
  });

  it("keeps existing candidates valid, and allows exactly one source", async () => {
    expect((await client.query(`select id, post_id from rule_candidates`)).rows).toEqual([{ id: ids.candidate, post_id: ids.post }]);
    const runId = (await client.query(`insert into runs (project_id, name, preset, starts_on, ends_on, writer_model, critic_model) values ($1, 'Run 2', 'mid', '2027-01-01', '2027-01-31', 'claude-opus-5-5', 'claude-opus-5-5') returning id`, [ids.site])).rows[0].id;
    const feedback = (await client.query(`insert into plan_feedback (run_id, kind, name, body) values ($1, 'note', 'Amir', 'More on cost') returning id`, [runId])).rows[0].id;
    await client.query(`insert into rule_candidates (plan_feedback_id, tier, section, text) values ($1, 'project', 'cta', 'End with the consultation.')`, [feedback]);
    await expect(client.query(`insert into rule_candidates (plan_feedback_id, review_event_id, tier, section, text) values ($1, $2, 'project', 'cta', 'Two sources.')`, [feedback, ids.event])).rejects.toThrow(/rule_candidates_source_check/);
    await expect(client.query(`insert into rule_candidates (tier, section, text) values ('project', 'cta', 'No source.')`)).rejects.toThrow(/rule_candidates_source_check/);
    // A client's feedback needs a link; Amir's note has none.
    await expect(client.query(`insert into plan_feedback (run_id, kind, name, body) values ($1, 'comment', 'Ana', 'Hi')`, [runId])).rejects.toThrow(/plan_feedback_source_check/);
  });

  it("accepts the plan purpose for AI calls", async () => {
    await client.query(`insert into ai_calls (purpose, requested_model, prompt_version) values ('plan', 'claude-opus-5-5', 'planner-1')`);
    await expect(client.query(`insert into ai_calls (purpose, requested_model, prompt_version) values ('planning', 'x', 'y')`)).rejects.toThrow(/ai_calls_purpose_check/);
  });
});
