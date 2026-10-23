import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { clients, posts, projects } from "@/db/schema";
import { getSlot, listSlotsBetween, listStartedPosts, nextSlots } from "./posts";
import { runInput } from "@/test/runs";
import { createRun } from "./runs";
import { setTopic } from "./slots";

const today = "2026-10-21";

describe.skipIf(!testDatabaseUrl)("slot and post reads (local Postgres)", () => {
  const { db, close } = createTestDb();
  let migss: { id: string };
  let other: { id: string };
  let site: { id: string };
  let shop: { id: string };

  beforeEach(async () => {
    await resetDomainTables(db);
    [migss] = await db.insert(clients).values({ name: "Migss Interiors" }).returning({ id: clients.id });
    [other] = await db.insert(clients).values({ name: "Another client" }).returning({ id: clients.id });
    [site] = await db
      .insert(projects)
      .values({ clientId: migss.id, name: "Migss Interiors Website", siteUrl: "https://www.migssinteriors.com", status: "active" })
      .returning({ id: projects.id });
    [shop] = await db
      .insert(projects)
      .values({ clientId: other.id, name: "Another site", siteUrl: "https://example.com", status: "active" })
      .returning({ id: projects.id });
    // Premium (Mon, Wed, Fri) for Migss and Entry (Tue) for the other site.
    await createRun(site.id, runInput("premium", today, 2), db, { today });
    await createRun(shop.id, runInput("entry", today, 2), db, { today });
  });
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  it("lists a date range across projects in date order, or for one project", async () => {
    const week = await listSlotsBetween("2026-10-26", "2026-11-01", {}, db);
    expect(week.map((slot) => `${slot.slotDate} ${slot.projectName}`)).toEqual([
      "2026-10-26 Migss Interiors Website",
      "2026-10-27 Another site",
      "2026-10-28 Migss Interiors Website",
      "2026-10-30 Migss Interiors Website",
    ]);
    expect(week[0]).toMatchObject({ clientName: "Migss Interiors", status: "planned", topic: null });
    expect(await listSlotsBetween("2026-10-26", "2026-11-01", { projectId: shop.id }, db)).toHaveLength(1);
  });

  it("lists started posts only, newest first, filtered by client", async () => {
    const [a, b] = await listSlotsBetween(today, "2026-10-31", { projectId: site.id }, db);
    await setTopic(a.id, "Wet room or shower tray", db);
    await setTopic(b.id, "Walk-in shower ideas", db);
    const [shopSlot] = await listSlotsBetween(today, "2026-10-31", { projectId: shop.id }, db);
    await setTopic(shopSlot.id, "Shop topic", db);
    expect((await listStartedPosts({}, db)).map((post) => post.topic)).toEqual(["Shop topic", "Walk-in shower ideas", "Wet room or shower tray"]);
    expect((await listStartedPosts({ clientId: migss.id }, db)).map((post) => post.topic)).toEqual(["Walk-in shower ideas", "Wet room or shower tray"]);
  });

  it("finds each project's next slot from today", async () => {
    const [first] = await listSlotsBetween(today, today, { projectId: site.id }, db);
    await setTopic(first.id, "Today's topic", db);
    const next = await nextSlots({ today }, db);
    expect(next.get(site.id)).toEqual({ slotDate: today, topic: "Today's topic" });
    expect(next.get(shop.id)).toEqual({ slotDate: "2026-10-27", topic: null });
  });

  it("reads one slot with its project and client, and refuses a malformed id", async () => {
    const [first] = await db.select().from(posts).where(eq(posts.projectId, site.id)).limit(1);
    expect(await getSlot(first.id, db)).toMatchObject({ projectName: "Migss Interiors Website", clientName: "Migss Interiors" });
    expect(await getSlot("nope", db)).toBeNull();
  });
});
