import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { clients, posts, projects } from "@/db/schema";
import { POST_STATUS_KEYS } from "@/config/post-status";
import type { PackageKey, ProjectStatus } from "@/config/packages";
import { addDays, weekday } from "./dates";
import { createProject, updateProjectSettings } from "./projects";
import { ensureSlots, moveSlot, reconcileSlots, setTopic, SlotError } from "./slots";

// Wednesday 21 Oct 2026. Premium is Mon, Wed, Fri; Mid is Tue, Thu; Entry is Tue.
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

  async function project(pkg: PackageKey = "premium", status: ProjectStatus = "active") {
    const [row] = await db
      .insert(projects)
      .values({ clientId, name: `Site ${pkg}`, siteUrl: "https://example.com", package: pkg, status })
      .returning();
    return row;
  }

  // Saves the project's status and package, then reconciles, as the Settings tab does.
  async function change(projectId: string, status: ProjectStatus, pkg: PackageKey) {
    await db.update(projects).set({ status, package: pkg }).where(eq(projects.id, projectId));
    await reconcileSlots(projectId, { today }, db);
  }

  async function slots(projectId: string) {
    return db.select().from(posts).where(eq(posts.projectId, projectId)).orderBy(posts.slotDate);
  }

  it("keeps eight weeks of slots on the package's weekdays, and a second run adds nothing", async () => {
    const premium = await project("premium");
    const entry = await project("entry");
    expect(await ensureSlots({ today }, db)).toBe(24 + 8);
    const rows = await slots(premium.id);
    expect(rows).toHaveLength(24);
    expect(new Set(rows.map((row) => weekday(row.slotDate)))).toEqual(new Set([1, 3, 5]));
    expect(rows[0].slotDate).toBe(today);
    expect(rows.at(-1)!.slotDate <= addDays(today, 55)).toBe(true);
    expect(rows.every((row) => row.status === "planned" && row.topic === null && row.cadenceDate === row.slotDate)).toBe(true);
    expect((await slots(entry.id)).map((row) => weekday(row.slotDate))).toEqual(Array(8).fill(2));
    expect(await ensureSlots({ today }, db)).toBe(0);
  });

  it("gives a paused project no slots", async () => {
    const paused = await project("premium", "paused");
    await ensureSlots({ today }, db);
    expect(await slots(paused.id)).toHaveLength(0);
  });

  it("is safe when several pages top up at once", async () => {
    const premium = await project("premium");
    await Promise.all([ensureSlots({ today }, db), ensureSlots({ today }, db), ensureSlots({ today }, db)]);
    expect(await slots(premium.id)).toHaveLength(24);
  });

  it("does not refill a day whose slot was moved", async () => {
    const premium = await project("premium");
    await ensureSlots({ today }, db);
    const friday = (await slots(premium.id)).find((row) => row.slotDate === "2026-10-23")!;
    await moveSlot(friday.id, "2026-10-24", { today }, db);
    expect(await ensureSlots({ today }, db)).toBe(0);
    const rows = await slots(premium.id);
    expect(rows).toHaveLength(24);
    expect(rows.filter((row) => row.slotDate === "2026-10-23")).toHaveLength(0);
    expect(rows.find((row) => row.id === friday.id)).toMatchObject({ slotDate: "2026-10-24", cadenceDate: "2026-10-23" });
  });

  it("only moves a slot to today or later", async () => {
    const premium = await project("premium");
    await ensureSlots({ today }, db);
    const [first] = await slots(premium.id);
    await expect(moveSlot(first.id, "2026-10-20", { today }, db)).rejects.toThrow("Choose today or a later date.");
    await expect(moveSlot(first.id, "next week", { today }, db)).rejects.toThrow("Choose a date.");
    await expect(moveSlot("not-a-slot", "2026-10-22", { today }, db)).rejects.toBeInstanceOf(SlotError);
    expect((await moveSlot(first.id, today, { today }, db)).slotDate).toBe(today);
  });

  it("sets, changes and clears a topic", async () => {
    const premium = await project("premium");
    await ensureSlots({ today }, db);
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
    const premium = await project("premium");
    await ensureSlots({ today }, db);
    const [first] = await slots(premium.id);
    await db.update(posts).set({ status: "generating", topic: "Already writing" }).where(eq(posts.id, first.id));
    await expect(setTopic(first.id, "Something else", db)).rejects.toThrow("fixed once writing has started");
  });

  it("pausing removes future empty slots and keeps topics and the past", async () => {
    const premium = await project("premium");
    await ensureSlots({ today }, db);
    const rows = await slots(premium.id);
    await setTopic(rows[3].id, "Bathroom fitters in Chigwell", db);
    const [past] = await db
      .insert(posts)
      .values({ projectId: premium.id, cadenceDate: "2026-10-19", slotDate: "2026-10-19", status: "planned" })
      .returning();
    await change(premium.id, "paused", "premium");
    expect((await slots(premium.id)).map((row) => row.id).sort()).toEqual([past.id, rows[3].id].sort());

    // Resuming fills the cadence again, without a second slot for the day that kept its topic.
    await change(premium.id, "active", "premium");
    const resumed = await slots(premium.id);
    expect(resumed.filter((row) => row.slotDate >= today)).toHaveLength(24);
    expect(resumed.filter((row) => row.cadenceDate === rows[3].cadenceDate)).toHaveLength(1);
  });

  it("switching Premium to Mid and back keeps topics and ends where it started", async () => {
    const premium = await project("premium");
    await ensureSlots({ today }, db);
    const rows = await slots(premium.id);
    const monday = rows.find((row) => weekday(row.slotDate) === 1)!;
    await setTopic(monday.id, "Bathroom renovation cost in Essex", db);
    // A moved empty Wednesday slot goes with its cadence weekday, wherever it now sits.
    const wednesday = rows.find((row) => weekday(row.slotDate) === 3 && row.slotDate > today)!;
    await moveSlot(wednesday.id, addDays(wednesday.slotDate, 1), { today }, db);

    await change(premium.id, "active", "mid");
    const mid = await slots(premium.id);
    expect(mid.filter((row) => row.topic === null).every((row) => [2, 4].includes(weekday(row.cadenceDate!)))).toBe(true);
    expect(mid.filter((row) => row.topic === null)).toHaveLength(16);
    expect(mid.find((row) => row.id === monday.id)?.topic).toBe("Bathroom renovation cost in Essex");
    expect(mid.find((row) => row.id === wednesday.id)).toBeUndefined();

    await change(premium.id, "active", "premium");
    const back = await slots(premium.id);
    expect(back).toHaveLength(24);
    expect(new Set(back.map((row) => weekday(row.cadenceDate!)))).toEqual(new Set([1, 3, 5]));
    expect(back.find((row) => row.id === monday.id)?.topic).toBe("Bathroom renovation cost in Essex");
  });

  it("the database refuses a planned slot with a topic, a topic slot without one, and an unknown status", async () => {
    const premium = await project("premium");
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

  it("creating and pausing a project in the app changes its slots in the same save", async () => {
    const created = await createProject(
      { clientId, name: "Migss Interiors Website", siteUrl: "https://www.migssinteriors.com", package: "premium", status: "active", publishingTarget: "wix_blog" },
      db,
    );
    expect(await slots(created.id)).toHaveLength(24);
    const [first] = await slots(created.id);
    await setTopic(first.id, "Kept topic", db);
    await updateProjectSettings(
      created.id,
      { clientId, name: created.name, siteUrl: created.siteUrl, package: "premium", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    expect((await slots(created.id)).map((row) => row.topic)).toEqual(["Kept topic"]);
  });
});
