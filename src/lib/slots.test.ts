import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { clients, posts, projects } from "@/db/schema";
import { POST_STATUS_KEYS } from "@/config/post-status";
import type { ProjectStatus } from "@/config/projects";
import { runInput } from "@/test/runs";
import { addDays } from "./dates";
import { createProject, updateProjectSettings } from "./projects";
import { createRun, updateRun } from "./runs";
import { moveSlot, setTopic, SlotError } from "./slots";

// Wednesday 21 Oct 2026. Premium is Mon, Wed, Fri. Runs themselves are tested in runs.test.ts.
const today = "2026-10-21";

describe.skipIf(!testDatabaseUrl)("calendar slots (local Postgres)", () => {
  const { db, close } = createTestDb();
  let clientId: string;

  beforeEach(async () => {
    await resetDomainTables(db);
    [{ id: clientId }] = await db.insert(clients).values({ name: "Migss Interiors" }).returning({ id: clients.id });
  });
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  async function project(status: ProjectStatus = "active") {
    const [row] = await db.insert(projects).values({ clientId, name: "Site", siteUrl: "https://example.com", status }).returning();
    return row;
  }

  // A project with a one-month Premium run (Mon, Wed, Fri) from today.
  async function withRun() {
    const row = await project();
    const run = await createRun(row.id, runInput("premium", today), db, { today });
    return { ...row, run };
  }

  async function slots(projectId: string) {
    return db.select().from(posts).where(eq(posts.projectId, projectId)).orderBy(posts.slotDate);
  }

  it("a new project has no slots until a run is set up", async () => {
    const created = await createProject({ clientId, name: "Migss Interiors Website", siteUrl: "https://www.migssinteriors.com", status: "active", publishingTarget: "wix_blog" }, db);
    expect(await slots(created.id)).toHaveLength(0);
  });

  it("pausing a project keeps its run's slots", async () => {
    const premium = await withRun();
    const before = await slots(premium.id);
    await updateProjectSettings(premium.id, { clientId, name: premium.name, siteUrl: premium.siteUrl, status: "paused", publishingTarget: "wix_blog" }, db);
    expect((await slots(premium.id)).map((row) => row.id)).toEqual(before.map((row) => row.id));
  });

  it("does not refill a day whose slot was moved", async () => {
    const premium = await withRun();
    const friday = (await slots(premium.id)).find((row) => row.slotDate === "2026-10-23")!;
    const count = (await slots(premium.id)).length;
    await moveSlot(friday.id, "2026-10-24", { today }, db);
    await updateRun(premium.run.id, runInput("premium", today), db, { today });
    const rows = await slots(premium.id);
    expect(rows).toHaveLength(count);
    expect(rows.filter((row) => row.slotDate === "2026-10-23")).toHaveLength(0);
    expect(rows.find((row) => row.id === friday.id)).toMatchObject({ slotDate: "2026-10-24", cadenceDate: "2026-10-23" });
  });

  it("keeps a moved slot inside its run", async () => {
    const premium = await withRun();
    const [first] = await slots(premium.id);
    await expect(moveSlot(first.id, addDays(premium.run.endsOn, 1), { today }, db)).rejects.toThrow("Keep it inside Run 1, Wed 21 Oct 2026 to Fri 20 Nov 2026.");
  });

  it("only moves a slot to today or later", async () => {
    const premium = await withRun();
    const [first] = await slots(premium.id);
    await expect(moveSlot(first.id, "2026-10-20", { today }, db)).rejects.toThrow("Choose today or a later date.");
    await expect(moveSlot(first.id, "next week", { today }, db)).rejects.toThrow("Choose a date.");
    await expect(moveSlot("not-a-slot", "2026-10-22", { today }, db)).rejects.toBeInstanceOf(SlotError);
    expect((await moveSlot(first.id, today, { today }, db)).slotDate).toBe(today);
  });

  it("sets, changes and clears a topic", async () => {
    const premium = await withRun();
    const [first] = await slots(premium.id);
    const set = await setTopic(first.id, "  Wet room   or shower tray ", db);
    expect(set).toMatchObject({ status: "topic_set", topic: "Wet room or shower tray" });
    expect(set.topicSetAt).toBeInstanceOf(Date);
    expect((await setTopic(first.id, "Walk-in shower ideas", db)).topic).toBe("Walk-in shower ideas");
    const cleared = await setTopic(first.id, " ", db);
    expect(cleared).toMatchObject({ status: "planned", topic: null, topicSetAt: null });
    await expect(setTopic(first.id, "x".repeat(201), db)).rejects.toThrow("under 200 characters");
  });

  it("refuses a topic change once writing has started", async () => {
    const premium = await withRun();
    const [first] = await slots(premium.id);
    await db.update(posts).set({ status: "generating", topic: "Already writing" }).where(eq(posts.id, first.id));
    await expect(setTopic(first.id, "Something else", db)).rejects.toThrow("fixed once writing has started");
  });

  it("the database refuses a planned slot with a topic, a topic slot without one, and an unknown status", async () => {
    const premium = await project();
    const base = { projectId: premium.id, slotDate: today };
    await expect(db.insert(posts).values({ ...base, status: "planned", topic: "x" })).rejects.toThrow();
    await expect(db.insert(posts).values({ ...base, status: "topic_set" })).rejects.toThrow();
    await expect(db.insert(posts).values({ ...base, status: "drafted" as never, topic: "x" })).rejects.toThrow();
  });

  it("the status check lists exactly the keys in src/config/post-status.ts", async () => {
    const result = await db.execute(sql`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'posts_status_check'`);
    const def = (result.rows[0] as { def: string }).def;
    expect([...def.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort()).toEqual([...POST_STATUS_KEYS].sort());
  });
});
