import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, londonToday } from "@/lib/dates";

// 0008_runs on a copy of production's shape (Phase 2 A1, orientation Q3 as amended): migrate a scratch database to 0007,
// seed it like production, then apply 0008 and check that every post kept everything and that Run 1 is right.
// Dates are relative to today, as the migration reads today's London date.

const localUrl = process.env.TEST_DATABASE_URL;
const database = "bfm_migration_0008_test";

describe.skipIf(!localUrl)("migration 0008_runs (local Postgres)", () => {
  const admin = () => new Client({ connectionString: localUrl!.replace(/\/[^/]+$/, "/postgres") });
  const scratchUrl = () => localUrl!.replace(/\/[^/]+$/, `/${database}`);
  const today = londonToday();
  const day = (offset: number) => addDays(today, offset);
  let client: Client;
  let folder: string;
  let before: { id: string; status: string; topic: string | null; slot_date: string; calendar_hash: string | null }[];
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const root = admin();
    await root.connect();
    await root.query(`drop database if exists ${database}`);
    await root.query(`create database ${database}`);
    await root.end();

    // The migrations folder as it was before 0008.
    folder = mkdtempSync(join(tmpdir(), "bfm-0008-"));
    cpSync("drizzle", folder, { recursive: true });
    const journalPath = join(folder, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag < "0008");
    writeFileSync(journalPath, JSON.stringify(journal));

    client = new Client({ connectionString: scratchUrl() });
    await client.connect();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: folder });

    // Production's shape: Migss on Mid with a published post, topic posts (two on one day, one without a cadence date), a
    // missed empty slot, empty slots inside and after the last topic; a second project with empty slots only; a third
    // with none.
    await client.query(`insert into app_settings (id, writer_model, critic_model) values (1, 'claude-sonnet-5-5', 'claude-opus-5-5') on conflict (id) do update set writer_model = excluded.writer_model, critic_model = excluded.critic_model`);
    const { rows: [migssClient] } = await client.query(`insert into clients (name) values ('Migss Interiors') returning id`);
    const project = async (name: string, pkg: string) =>
      (await client.query(`insert into projects (client_id, name, site_url, status, package) values ($1, $2, 'https://example.com', 'active', $3) returning id`, [migssClient.id, name, pkg])).rows[0].id as string;
    ids.migss = await project("Migss Interiors Website", "mid");
    ids.other = await project("Another site", "entry");
    ids.none = await project("No posts", "premium");
    const post = async (key: string, projectId: string, slotDate: string, status: string, topic: string | null, cadence: string | null = slotDate, hash: string | null = `hash-${key}`) => {
      ids[key] = (await client.query(`insert into posts (project_id, slot_date, cadence_date, status, topic, calendar_hash) values ($1, $2, $3, $4, $5, $6) returning id`, [projectId, slotDate, cadence, status, topic, hash])).rows[0].id;
    };
    await post("published", ids.migss, day(-10), "published", "Wet room or shower tray");
    await post("missed", ids.migss, day(-3), "planned", null);
    await post("topicA", ids.migss, day(2), "topic_set", "Walk-in shower ideas");
    await post("topicB", ids.migss, day(2), "topic_set", "Bathroom fitters in Chigwell", null);
    await post("emptyInside", ids.migss, day(9), "planned", null);
    await post("lastTopic", ids.migss, day(25), "spec_confirmed", "Bathroom renovation cost in Essex");
    await post("emptyAfter1", ids.migss, day(30), "planned", null);
    await post("emptyAfter2", ids.migss, day(37), "planned", null);
    await post("otherA", ids.other, day(1), "planned", null);
    await post("otherB", ids.other, day(8), "planned", null);
    await client.query(`insert into derivatives (post_id, channel, version, status, source, body) values ($1, 'gmb', 1, 'ready', 'model', 'Copy')`, [ids.published]);
    before = (await client.query(`select id, status, topic, slot_date::text, calendar_hash from posts order by id`)).rows;

    // Now 0008, from the real folder.
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

  it("makes Run 1 for each project with posts, from its first slot to its last post with a topic", async () => {
    const { rows } = await client.query(`select project_id, name, preset, starts_on::text, ends_on::text, status, imported, writer_model, critic_model, activated_at is not null as activated from runs order by starts_on`);
    expect(rows).toEqual([
      { project_id: ids.migss, name: "Run 1", preset: "mid", starts_on: day(-10), ends_on: day(25), status: "active", imported: true, writer_model: "claude-sonnet-5-5", critic_model: "claude-opus-5-5", activated: true },
      // No topics: it ends at its latest slot.
      { project_id: ids.other, name: "Run 1", preset: "entry", starts_on: day(1), ends_on: day(8), status: "active", imported: true, writer_model: "claude-sonnet-5-5", critic_model: "claude-opus-5-5", activated: true },
    ]);
  });

  it("deletes only Run 1's empty future slots after its end, and queues their calendar events", async () => {
    const { rows } = await client.query(`select id from posts`);
    const left = new Set(rows.map((row) => row.id));
    expect(left.has(ids.emptyAfter1) || left.has(ids.emptyAfter2)).toBe(false);
    expect(left.size).toBe(before.length - 2);
    const queued = (await client.query(`select post_id, event_id from calendar_deletions order by event_id`)).rows;
    expect(queued).toEqual(
      [ids.emptyAfter1, ids.emptyAfter2].map((id) => ({ post_id: id, event_id: `bfm${id.replace(/-/g, "")}` })).sort((a, b) => a.event_id.localeCompare(b.event_id)),
    );
  });

  it("keeps every other post exactly as it was, in its project's Run 1", async () => {
    const after = (await client.query(`select p.id, p.status, p.topic, p.slot_date::text, p.calendar_hash, r.project_id = p.project_id as own_run from posts p join runs r on r.id = p.run_id order by p.id`)).rows;
    const kept = before.filter((row) => row.id !== ids.emptyAfter1 && row.id !== ids.emptyAfter2);
    expect(after.map((row) => ({ id: row.id, status: row.status, topic: row.topic, slot_date: row.slot_date, calendar_hash: row.calendar_hash }))).toEqual(kept);
    expect(after.every((row) => row.own_run)).toBe(true);
    expect((await client.query(`select count(*)::int as n from derivatives where post_id = $1`, [ids.published])).rows[0].n).toBe(1);
  });

  it("gives Run 1 one SEO row with every post it holds, on the package's weekdays", async () => {
    const { rows } = await client.query(`select r.project_id, c.content_type, c.amount, c.cadence from run_channels c join runs r on r.id = c.run_id order by r.starts_on`);
    expect(rows).toEqual([
      { project_id: ids.migss, content_type: "seo", amount: 6, cadence: { weekdays: [2, 4] } },
      { project_id: ids.other, content_type: "seo", amount: 2, cadence: { weekdays: [2] } },
    ]);
  });

  it("lets the next run start the day after Run 1, and refuses one that overlaps", async () => {
    const insert = (startsOn: string, endsOn: string) =>
      client.query(`insert into runs (project_id, name, preset, starts_on, ends_on, writer_model, critic_model) values ($1, 'Run 2', 'mid', $2, $3, 'claude-opus-5-5', 'claude-opus-5-5')`, [ids.migss, startsOn, endsOn]);
    await expect(insert(day(25), day(60))).rejects.toThrow(/runs_no_overlap/);
    await insert(day(26), day(60));
  });
});
