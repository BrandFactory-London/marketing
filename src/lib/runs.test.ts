import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { calendarDeletions, clients, derivatives, derivedSlots, posts, projects, runs } from "@/db/schema";
import { DEFAULT_MODEL } from "@/config/models";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { runInput } from "@/test/runs";
import { derivedEventIdFor, eventIdFor } from "./calendar-events";
import { matchingDays } from "./cadence";
import { addDays } from "./dates";
import { parseRunInput } from "./run-config";
import { adoptOrphanSlots, createRun, currentRun, deleteRun, listProjectRuns, moveDerivedSlot, orphanSlots, RunError, runSlots, suggestedStart, updateRun } from "./runs";
import { moveSlot, setTopic } from "./slots";

// Wednesday 21 Oct 2026. Mid is Tue, Thu; Premium Mon, Wed, Fri; every derived channel the day after.
const today = "2026-10-21";

describe("run configuration input (Phase 2 A1)", () => {
  const form = {
    preset: "mid",
    startsOn: today,
    months: "1",
    "seo.amount": "9",
    "seo.weekdays": ["2", "4"],
    "gmb.amount": "9",
    "gmb.mode": "after",
    "gmb.after": "1",
    "linkedin.amount": "3",
    "linkedin.mode": "weekdays",
    "linkedin.weekdays": ["3"],
    "facebook.amount": "0",
    "pinterest.amount": "0",
    lengthMin: "1200",
    lengthMax: "1600",
    faqMode: "useful",
    writerModel: DEFAULT_MODEL,
    criticModel: DEFAULT_MODEL,
  };

  it("reads a row per content type with its amount and cadence", () => {
    const parsed = parseRunInput(form, today);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.channels).toEqual([
      { contentType: "seo", amount: 9, cadence: { weekdays: [2, 4] } },
      { contentType: "gmb", amount: 9, cadence: { after: 1 } },
      { contentType: "linkedin", amount: 3, cadence: { weekdays: [3] } },
      { contentType: "facebook", amount: 0, cadence: { after: 1 } },
      { contentType: "pinterest", amount: 0, cadence: { after: 1 } },
    ]);
  });

  it("refuses a start in the past, no SEO posts, no days, more derived than SEO and a bad length", () => {
    const error = (change: Record<string, unknown>) => {
      const parsed = parseRunInput({ ...form, ...change }, today);
      return parsed.ok ? null : parsed.error;
    };
    expect(error({ startsOn: "2026-10-20" })).toBe("Start the run today or later.");
    // A run that has started keeps its start date when edited.
    expect(parseRunInput({ ...form, startsOn: "2026-10-20" }, today, { currentStart: "2026-10-20" }).ok).toBe(true);
    expect(error({ months: "4" })).toBe("A run lasts 1, 2 or 3 months.");
    expect(error({ "seo.amount": "0" })).toBe("A run needs at least one SEO post.");
    expect(error({ "seo.weekdays": [] })).toBe("Choose at least one day for SEO posts.");
    expect(error({ "gmb.amount": "10" })).toBe("A derived channel can have at most as many posts as there are SEO posts.");
    expect(error({ "gmb.after": "15" })).toBe("Derived posts go 0 to 14 days after their SEO post.");
    expect(error({ lengthMin: "1700" })).toBe("Set a length between 300 and 4,000 words, the maximum at least the minimum.");
  });
});

describe.skipIf(!testDatabaseUrl)("runs (local Postgres)", () => {
  const { db, close } = createTestDb();
  let projectId: string;

  beforeEach(async () => {
    await resetDomainTables(db);
    const [{ id: clientId }] = await db.insert(clients).values({ name: "Migss Interiors" }).returning({ id: clients.id });
    [{ id: projectId }] = await db.insert(projects).values({ clientId, name: "Migss Interiors Website", siteUrl: "https://www.migssinteriors.com", status: "active" }).returning({ id: projects.id });
  });
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  const seoSlots = (runId: string) => db.select().from(posts).where(eq(posts.runId, runId)).orderBy(posts.slotDate);
  const derived = (runId: string) => db.select().from(derivedSlots).where(eq(derivedSlots.runId, runId)).orderBy(derivedSlots.slotDate);

  it("puts typed placeholders on the run's cadence: SEO on its days, each derived channel the day after", async () => {
    const run = await createRun(projectId, runInput("mid", today), db, { today });
    expect(run).toMatchObject({ name: "Run 1", status: "setting_up", startsOn: today, endsOn: "2026-11-20", imported: false });
    const seo = await seoSlots(run.id);
    expect(seo.map((post) => post.slotDate)).toEqual(matchingDays(today, "2026-11-20", [2, 4]));
    expect(seo.every((post) => post.status === "planned" && post.cadenceDate === post.slotDate)).toBe(true);
    const children = await derived(run.id);
    expect(children).toHaveLength(seo.length * 4);
    for (const child of children) {
      const parent = seo.find((post) => post.id === child.parentPostId)!;
      expect(child.slotDate).toBe(addDays(parent.slotDate, 1));
    }
  });

  it("refuses an overlapping run, in the app and in the database, and suggests the next start", async () => {
    const first = await createRun(projectId, runInput("mid", today), db, { today });
    await expect(createRun(projectId, runInput("mid", "2026-11-20"), db, { today })).rejects.toThrow(
      "This run overlaps Run 1 (Wed 21 Oct 2026 to Fri 20 Nov 2026). Start it on Sat 21 Nov 2026 or later, or shorten it.",
    );
    await expect(
      db.insert(runs).values({ projectId, name: "Bypass", preset: "mid", startsOn: "2026-11-01", endsOn: "2026-11-30", writerModel: DEFAULT_MODEL, criticModel: DEFAULT_MODEL }),
    ).rejects.toThrow();
    const list = await listProjectRuns(projectId, db);
    expect(suggestedStart(list, today)).toBe("2026-11-21");
    const second = await createRun(projectId, runInput("premium", "2026-11-21"), db, { today });
    expect(second.name).toBe("Run 2");
    const both = await listProjectRuns(projectId, db);
    expect(currentRun(both, today)?.id).toBe(first.id);
    expect(currentRun(both, "2026-11-25")?.id).toBe(second.id);
  });

  it("changing the rule regenerates only empty, unmoved placeholders", async () => {
    const run = await createRun(projectId, runInput("mid", today), db, { today });
    const [first, second] = await seoSlots(run.id);
    await setTopic(first.id, "Wet room or shower tray", db);
    await moveSlot(second.id, "2026-10-31", { today }, db);
    const before = (await seoSlots(run.id)).length;

    await updateRun(run.id, runInput("premium", today, 1, { channels: runInput("premium", today).channels.map((channel) => (channel.contentType === "seo" ? { ...channel, amount: before } : channel)) }), db, { today });
    const after = await seoSlots(run.id);
    expect(after).toHaveLength(before);
    expect(after.find((post) => post.id === first.id)?.topic).toBe("Wet room or shower tray");
    expect(after.find((post) => post.id === second.id)?.slotDate).toBe("2026-10-31");
    const fresh = after.filter((post) => post.id !== first.id && post.id !== second.id);
    expect(fresh.every((post) => [1, 3, 5].includes(new Date(`${post.slotDate}T00:00:00Z`).getUTCDay()))).toBe(true);
    // The dropped placeholders' events are queued for deletion, derived ones under their own ID.
    const queued = await db.select().from(calendarDeletions);
    expect(queued.some((row) => row.eventId.startsWith("bfmd"))).toBe(true);
    expect(queued.some((row) => row.eventId.startsWith("bfm") && !row.eventId.startsWith("bfmd"))).toBe(true);
  });

  it("editing a run that has started leaves its past as it was", async () => {
    const run = await createRun(projectId, runInput("mid", today), db, { today });
    const later = "2026-10-28";
    const past = (await seoSlots(run.id)).filter((post) => post.slotDate < later);
    const pastDerived = (await derived(run.id)).filter((child) => child.slotDate < later);
    await updateRun(run.id, runInput("premium", today), db, { today: later });
    const after = await seoSlots(run.id);
    expect(after.filter((post) => post.slotDate < later).map((post) => post.id)).toEqual(past.map((post) => post.id));
    expect((await derived(run.id)).filter((child) => child.slotDate < later).map((child) => child.id).sort()).toEqual(pastDerived.map((child) => child.id).sort());
    expect(after.filter((post) => post.slotDate >= later).every((post) => [1, 3, 5].includes(new Date(`${post.slotDate}T00:00:00Z`).getUTCDay()))).toBe(true);
  });

  it("keeps derived slots after their SEO post when it moves, and checks derived moves", async () => {
    const run = await createRun(projectId, runInput("mid", today), db, { today });
    const [first] = await seoSlots(run.id);
    await moveSlot(first.id, "2026-10-24", { today }, db);
    const children = (await derived(run.id)).filter((child) => child.parentPostId === first.id);
    expect(children.map((child) => child.slotDate)).toEqual(Array(4).fill("2026-10-25"));

    const [gbp] = children;
    await expect(moveDerivedSlot(gbp.id, "2026-10-23", { today }, db)).rejects.toThrow("Keep it on or after its SEO post, Sat 24 Oct 2026.");
    await expect(moveDerivedSlot(gbp.id, "2026-11-21", { today }, db)).rejects.toThrow("Keep it inside the run, which ends on Fri 20 Nov 2026.");
    await expect(moveDerivedSlot(gbp.id, "2026-10-20", { today }, db)).rejects.toThrow("Choose today or a later date.");
    expect((await moveDerivedSlot(gbp.id, "2026-10-28", { today }, db)).slotDate).toBe("2026-10-28");

    // A moved derived slot stays put through a rule change; the others follow the rule.
    await updateRun(run.id, runInput("mid", today), db, { today });
    expect((await db.select().from(derivedSlots).where(eq(derivedSlots.id, gbp.id)))[0].slotDate).toBe("2026-10-28");
    await expect(moveSlot(first.id, "2026-11-21", { today }, db)).rejects.toThrow("Keep it inside Run 1, Wed 21 Oct 2026 to Fri 20 Nov 2026.");
  });

  it("a derived slot with copy stays when its channel is switched off", async () => {
    const run = await createRun(projectId, runInput("mid", today), db, { today });
    const [first] = await seoSlots(run.id);
    await db.update(posts).set({ status: "approved", topic: "Approved post" }).where(eq(posts.id, first.id));
    await db.insert(derivatives).values({ postId: first.id, channel: "gmb", version: 1, status: "ready", source: "model", body: "Copy" });
    const noGbp = runInput("mid", today);
    await updateRun(run.id, { ...noGbp, channels: noGbp.channels.map((channel) => (channel.contentType === "gmb" ? { ...channel, amount: 0 } : channel)) }, db, { today });
    const gbp = (await derived(run.id)).filter((child) => child.contentType === "gmb");
    expect(gbp.map((child) => child.parentPostId)).toEqual([first.id]);
    const view = await runSlots(run.id, db);
    expect(view[0].derived.find((child) => child.contentType === "gmb")?.versionStatus).toBe("ready");
  });

  it("deletes a run still being set up, with its slots and their events, unless a slot is touched", async () => {
    const run = await createRun(projectId, runInput("entry", today), db, { today });
    const [first] = await seoSlots(run.id);
    await setTopic(first.id, "Kept", db);
    await expect(deleteRun(run.id, db)).rejects.toThrow("A slot in this run has a topic or has moved.");
    await setTopic(first.id, "", db);
    const ids = (await seoSlots(run.id)).map((post) => post.id);
    const childIds = (await derived(run.id)).map((child) => child.id);
    await deleteRun(run.id, db);
    expect(await listProjectRuns(projectId, db)).toHaveLength(0);
    const queued = (await db.select().from(calendarDeletions)).map((row) => row.eventId).sort();
    expect(queued).toEqual([...ids.map(eventIdFor), ...childIds.map(derivedEventIdFor)].sort());
  });

  it("refuses to edit an imported run, and to shorten a run past a touched slot", async () => {
    const run = await createRun(projectId, runInput("mid", today, 2), db, { today });
    const last = (await seoSlots(run.id)).at(-1)!;
    await setTopic(last.id, "Late topic", db);
    await expect(updateRun(run.id, runInput("mid", today, 1), db, { today })).rejects.toBeInstanceOf(RunError);
    await db.update(runs).set({ imported: true }).where(eq(runs.id, run.id));
    await expect(updateRun(run.id, runInput("mid", today, 2), db, { today })).rejects.toThrow("Run 1 was made from the Phase 1 slots. Change its slots one by one.");
  });

  it("the backstop adopts a slot the retired generator made inside a run, drops an empty one outside, and keeps a topic", async () => {
    const run = await createRun(projectId, runInput("mid", today), db, { today });
    const [inside, emptyOutside, topicOutside] = await db
      .insert(posts)
      .values([
        { projectId, cadenceDate: "2026-10-23", slotDate: "2026-10-23", status: "planned" },
        { projectId, cadenceDate: "2026-12-01", slotDate: "2026-12-01", status: "planned" },
        { projectId, cadenceDate: "2026-12-03", slotDate: "2026-12-03", status: "topic_set", topic: "Started early" },
      ])
      .returning();
    expect(await adoptOrphanSlots({ projectId }, db)).toBe(2);
    expect((await db.select().from(posts).where(eq(posts.id, inside.id)))[0].runId).toBe(run.id);
    expect(await db.select().from(posts).where(eq(posts.id, emptyOutside.id))).toHaveLength(0);
    expect(await db.select().from(calendarDeletions).where(and(eq(calendarDeletions.postId, emptyOutside.id)))).toHaveLength(1);
    expect((await orphanSlots(projectId, db)).map((post) => post.id)).toEqual([topicOutside.id]);
    expect(await adoptOrphanSlots({ projectId }, db)).toBe(0);
  });
});
