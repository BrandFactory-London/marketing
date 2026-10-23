import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appSettings, calendarDeletions, derivedSlots, googleTokens, posts, users } from "@/db/schema";
import { GOOGLE_COLOURS } from "@/config/post-status";
import { addDays } from "./dates";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { CALENDAR_SCOPE_STRING, createFakeCalendar } from "@/test/fake-calendar";
import { APP_TAG, buildEvent, derivedEventIdFor, eventHash, eventIdFor, shortName, type CalendarPost } from "./calendar-events";
import { appBaseUrl, CHANGES_PER_PASS, chooseCalendar, getCalendarState, resyncCalendar, syncCalendar, syncCalendarSafely } from "./calendar-sync";
import { createClient } from "./clients";
import { CalendarError, deleteEvent, hasCalendarScopes, upsertEvent } from "./google-calendar";
import { saveGoogleTokens } from "./google-tokens";
import { createProject } from "./projects";
import { runInput } from "@/test/runs";
import { createRun, updateRun } from "./runs";
import { moveSlot, setTopic } from "./slots";

const POST: CalendarPost = {
  postId: "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c",
  status: "planned",
  generationStep: null,
  slotDate: "2026-11-03",
  topic: null,
  liveUrl: null,
  clientName: "Migss Interiors",
  clientShortName: null,
  projectName: "Migss Interiors Website",
  specNotes: null,
};
const APP = "https://marketing-brandfactorylondon.vercel.app";
const options = { today: "2026-10-23", appUrl: APP };

describe("calendar events (pure, γ8 orientation Q3, Q4)", () => {
  it("names an empty slot, and links it to the calendar page", () => {
    const event = buildEvent(POST, options);
    expect(event).toMatchObject({
      id: "bfm3f2a9c1e5b7d4e8a9c0b1d2e3f4a5b6c",
      summary: "Migss · SEO · Planned slot",
      colorId: "8",
      start: { date: "2026-11-03" },
      end: { date: "2026-11-04" },
      transparency: "transparent",
      extendedProperties: { private: { bfmApp: APP_TAG, bfmPostId: POST.postId } },
    });
    expect(event.description).toBe(`Status: Planned\nProject: Migss Interiors Website\nOpen in BrandFactory Marketing: ${APP}/calendar`);
  });

  it("uses the event ID Google accepts: lower-case base32hex, 5 to 1024 characters", () => {
    expect(eventIdFor(POST.postId)).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it("titles a post by its topic, with its status, notes and the post's link", () => {
    const event = buildEvent({ ...POST, status: "generating", generationStep: "critic", topic: "Wet room maintenance week by week", specNotes: "Lead with the seals." }, options);
    expect(event.summary).toBe("Migss · SEO · Wet room maintenance week by week");
    expect(event.colorId).toBe("7");
    expect(event.description).toBe(
      `Status: Checking\nProject: Migss Interiors Website\nNotes: Lead with the seals.\nOpen in BrandFactory Marketing: ${APP}/posts/${POST.postId}`,
    );
  });

  it("marks a past slot with no writing as missed, in Tangerine", () => {
    const event = buildEvent({ ...POST, slotDate: "2026-10-20" }, options);
    expect(event.summary).toBe("Migss · SEO · Missed slot");
    expect(event.colorId).toBe("6");
    expect(event.description).toMatch(/^Status: Missed\n/);
  });

  it("keeps a published post with its live link, in Basil", () => {
    const event = buildEvent({ ...POST, status: "published", topic: "Wet rooms", liveUrl: "https://www.migssinteriors.com/blog/wet-rooms", slotDate: "2026-10-20" }, options);
    expect(event.colorId).toBe("10");
    expect(event.description).toContain("Status: Published");
    expect(event.description).toContain("Live post: https://www.migssinteriors.com/blog/wet-rooms");
  });

  it("gives every status its colour from post-status.ts", () => {
    const colour = (status: CalendarPost["status"]) => buildEvent({ ...POST, status, topic: "T" }, options).colorId;
    expect(["planned", "topic_set", "spec_confirmed", "in_review", "approved", "flagged", "rejected"].map((status) => colour(status as CalendarPost["status"]))).toEqual([
      "8",
      "1",
      "7",
      "5",
      "9",
      "11",
      "4",
    ]);
  });

  it("prefers the client's short name, else the name's first word", () => {
    expect(shortName("Migss Interiors", null)).toBe("Migss");
    expect(shortName("Migss Interiors", "  MI ")).toBe("MI");
  });

  it("changes the hash only when a field the app owns changes", () => {
    const base = buildEvent(POST, options);
    expect(eventHash(buildEvent(POST, options))).toBe(eventHash(base));
    expect(eventHash(buildEvent({ ...POST, slotDate: "2026-11-05" }, options))).not.toBe(eventHash(base));
    expect(eventHash(buildEvent(POST, { ...options, today: "2026-11-04" }))).not.toBe(eventHash(base));
  });

  it("reads the app's address from APP_URL, else Vercel's production URL", () => {
    expect(appBaseUrl({ APP_URL: "http://localhost:3100/" })).toBe("http://localhost:3100");
    expect(appBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "marketing-brandfactorylondon.vercel.app" })).toBe(APP);
    expect(appBaseUrl({})).toBeNull();
  });

  it("needs both Calendar scopes", () => {
    expect(hasCalendarScopes(CALENDAR_SCOPE_STRING)).toBe(true);
    expect(hasCalendarScopes("https://www.googleapis.com/auth/drive.readonly")).toBe(false);
    expect(hasCalendarScopes(null)).toBe(false);
  });
});

describe("Calendar client against a fake API (γ8 orientation Q4, Q7)", () => {
  const calendarId = "content@group.calendar.google.com";
  const noSleep = async () => {};

  it("creates once, then patches after a 409, so a lost reply never makes a duplicate", async () => {
    const fake = createFakeCalendar();
    const event = buildEvent(POST, options);
    expect(await upsertEvent("t", calendarId, event, { fetchImpl: fake.fetchImpl })).toBe("created");
    expect(await upsertEvent("t", calendarId, { ...event, summary: "Changed" }, { fetchImpl: fake.fetchImpl })).toBe("updated");
    expect(fake.live()).toHaveLength(1);
    expect(fake.live()[0].summary).toBe("Changed");
  });

  it("brings back an event deleted in Google, which keeps its ID", async () => {
    const fake = createFakeCalendar();
    const event = buildEvent(POST, options);
    await upsertEvent("t", calendarId, event, { fetchImpl: fake.fetchImpl });
    await deleteEvent("t", calendarId, event.id, { fetchImpl: fake.fetchImpl });
    expect(fake.live()).toHaveLength(0);
    expect(await upsertEvent("t", calendarId, event, { fetchImpl: fake.fetchImpl })).toBe("updated");
    expect(fake.live()).toHaveLength(1);
  });

  it("treats deleting a missing or already deleted event as done", async () => {
    const fake = createFakeCalendar();
    await expect(deleteEvent("t", calendarId, "bfmmissing", { fetchImpl: fake.fetchImpl })).resolves.toBeUndefined();
  });

  it("retries a rate limit with backoff, then gives up with Google's message", async () => {
    const fake = createFakeCalendar();
    const waits: number[] = [];
    fake.failNext("POST", 403, "rateLimitExceeded");
    fake.failNext("POST", 429);
    expect(await upsertEvent("t", calendarId, buildEvent(POST, options), { fetchImpl: fake.fetchImpl, sleep: async (ms) => void waits.push(ms) })).toBe("created");
    expect(waits).toEqual([1000, 2000]);
    for (let i = 0; i < 4; i++) fake.failNext("POST", 429);
    await expect(upsertEvent("t", calendarId, buildEvent({ ...POST, postId: "00000000-0000-4000-8000-000000000001" }, options), { fetchImpl: fake.fetchImpl, sleep: noSleep })).rejects.toThrow(CalendarError);
  });

  it("does not retry a plain refusal", async () => {
    const fake = createFakeCalendar();
    fake.failNext("POST", 403, "forbidden");
    await expect(upsertEvent("t", calendarId, buildEvent(POST, options), { fetchImpl: fake.fetchImpl, sleep: noSleep })).rejects.toThrow(
      "Google refused access. Reconnect Google on this page and allow Google Calendar. Google said: Fake 403",
    );
  });
});

describe.skipIf(!testDatabaseUrl)("the calendar sync (local Postgres)", () => {
  const { db, close } = createTestDb();
  const userId = "test-user-calendar";
  const calendarId = "content@group.calendar.google.com";
  const now = () => new Date("2026-10-23T09:00:00Z");
  let projectId = "";
  let runId = "";
  let fake: ReturnType<typeof createFakeCalendar>;
  let deps: Parameters<typeof syncCalendar>[0];

  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.AUTH_GOOGLE_ID = "client-id";
    process.env.AUTH_GOOGLE_SECRET = "client-secret";
    process.env.APP_URL = APP;
  });
  afterAll(async () => {
    await resetDomainTables(db);
    await db.delete(users).where(eq(users.id, userId));
    await close();
  });

  beforeEach(async () => {
    await resetDomainTables(db);
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({ id: userId, email: "calendar-test@example.com" });
    await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
    await saveGoogleTokens({ userId, refreshToken: "1//refresh", scope: CALENDAR_SCOPE_STRING }, db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject({ clientId: client.id, name: "Migss Interiors Website", siteUrl: "https://www.migssinteriors.com", status: "active", publishingTarget: "wix_blog" }, db);
    projectId = project.id;
    // SEO slots only, so the γ8 cases see one event per post; derived slots have their own case below.
    runId = (await createRun(projectId, seoOnly(), db, { today: "2026-10-23" })).id;
    fake = createFakeCalendar();
    deps = { db, fetchImpl: fake.fetchImpl, now, sleep: async () => {} };
  });

  const slots = () => db.select().from(posts).where(eq(posts.projectId, projectId)).orderBy(posts.slotDate);

  // An Entry run (Tuesdays) from Fri 23 Oct for two months, with the given amounts for SEO and GBP.
  function seoOnly(seo?: number, gbp = 0) {
    const base = runInput("entry", "2026-10-23", 2);
    return { ...base, channels: base.channels.map((channel) => (channel.contentType === "seo" ? { ...channel, amount: seo ?? channel.amount } : { ...channel, amount: channel.contentType === "gmb" ? gbp : 0 })) };
  }

  it("needs the Calendar scopes and a chosen calendar before anything is sent", async () => {
    expect(await syncCalendar(deps)).toMatchObject({ skipped: "No calendar is chosen.", created: 0 });
    await saveGoogleTokens({ userId, refreshToken: "1//refresh", scope: "https://www.googleapis.com/auth/drive.readonly" }, db);
    expect((await getCalendarState(userId, db)).granted).toBe(false);
    await expect(chooseCalendar(userId, calendarId, deps)).rejects.toThrow("Reconnect Google and allow Google Calendar first.");
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a calendar Amir does not own", async () => {
    await expect(chooseCalendar(userId, "someone-else@group.calendar.google.com", deps)).rejects.toThrow("That calendar is not one you own.");
  });

  it("fills the chosen calendar with every slot, then sends nothing while nothing changes", async () => {
    await chooseCalendar(userId, calendarId, deps);
    const count = (await slots()).length;
    expect(count).toBeGreaterThan(0);
    expect(await syncCalendar(deps)).toMatchObject({ created: count, updated: 0, failed: 0, remaining: 0, skipped: null });
    expect(fake.live().map((event) => event.summary)).toEqual(Array(count).fill("Migss · SEO · Planned slot"));
    const calls = fake.calls.length;
    expect(await syncCalendar(deps)).toMatchObject({ created: 0, updated: 0 });
    expect(fake.calls).toHaveLength(calls);
    expect((await getCalendarState(userId, db)).pending).toBe(0);
  });

  it("updates the event when a topic is set and when a slot moves", async () => {
    await chooseCalendar(userId, calendarId, deps);
    await syncCalendar(deps);
    const [first] = await slots();
    await setTopic(first.id, "Wet room maintenance week by week", db);
    await moveSlot(first.id, "2026-11-20", { today: "2026-10-23" }, db);
    expect(await syncCalendar(deps)).toMatchObject({ updated: 1, created: 0 });
    const event = fake.events.get(eventIdFor(first.id))!;
    expect(event).toMatchObject({ summary: "Migss · SEO · Wet room maintenance week by week", colorId: "1", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } });
  });

  it("deletes the events of slots a run change removes, and keeps slots with a topic", async () => {
    await chooseCalendar(userId, calendarId, deps);
    await syncCalendar(deps);
    const [first] = await slots();
    await setTopic(first.id, "Kept", db);
    await updateRun(runId, seoOnly(1), db, { today: "2026-10-23" });
    const queued = await db.select().from(calendarDeletions);
    expect(queued.length).toBeGreaterThan(0);
    const result = await syncCalendar(deps);
    expect(result.deleted).toBe(queued.length);
    expect(fake.live().map((event) => event.summary)).toEqual(["Migss · SEO · Kept"]);
    expect(await db.select().from(calendarDeletions)).toHaveLength(0);
  });

  it("gives derived slots their own events with the channel and the SEO post's topic, and removes them with the slot (Phase 2 A1)", async () => {
    await updateRun(runId, seoOnly(2, 2), db, { today: "2026-10-23" });
    await chooseCalendar(userId, calendarId, deps);
    expect(await syncCalendar(deps)).toMatchObject({ created: 4, failed: 0 });
    const [first] = await slots();
    const [gbp] = await db.select().from(derivedSlots).where(eq(derivedSlots.parentPostId, first.id));
    const event = fake.live().find((item) => item.id === derivedEventIdFor(gbp.id))!;
    expect(event).toMatchObject({ summary: "Migss · GBP · Planned slot", start: { date: addDays(first.slotDate, 1) }, colorId: GOOGLE_COLOURS.graphite });
    expect(event.description).toContain("From the SEO post: no topic yet");

    await setTopic(first.id, "Wet room or shower tray", db);
    expect(await syncCalendar(deps)).toMatchObject({ created: 0, updated: 2 });
    expect(fake.live().find((item) => item.id === derivedEventIdFor(gbp.id))!.summary).toBe("Migss · GBP · Wet room or shower tray");

    await updateRun(runId, seoOnly(2, 0), db, { today: "2026-10-23" });
    expect(await syncCalendar(deps)).toMatchObject({ deleted: 2 });
    expect(fake.live().map((item) => item.summary).sort()).toEqual(["Migss · SEO · Planned slot", "Migss · SEO · Wet room or shower tray"]);
  });

  it("records a failure on the post and on Connections, never throws, and repairs it on the next pass", async () => {
    await chooseCalendar(userId, calendarId, deps);
    fake.failNext("POST", 500);
    const result = await syncCalendarSafely(deps);
    expect(result.failed).toBe(1);
    const failed = (await slots()).filter((row) => row.calendarError);
    expect(failed).toHaveLength(1);
    expect(failed[0].calendarError).toBe("Creating the event failed with status 500. Google said: Fake 500");
    const state = await getCalendarState(userId, db);
    expect(state.error).toBe("1 not synced. Creating the event failed with status 500. Google said: Fake 500");
    expect(await syncCalendar(deps)).toMatchObject({ created: 1, failed: 0 });
    expect((await getCalendarState(userId, db)).error).toBeNull();
  });

  it("pauses with a reconnect message when Google no longer accepts the connection", async () => {
    await chooseCalendar(userId, calendarId, deps);
    const refused = (async (input: RequestInfo | URL) =>
      String(input).endsWith("/token") ? new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) : fake.fetchImpl(input)) as typeof fetch;
    await db.update(googleTokens).set({ accessTokenEnc: null }).where(eq(googleTokens.userId, userId));
    const result = await syncCalendarSafely({ ...deps, fetchImpl: refused });
    expect(result.skipped).toBe("Calendar needs reconnecting: Google no longer accepts the stored connection.");
    expect((await getCalendarState(userId, db)).error).toContain("Calendar needs reconnecting");
  });

  it("resyncs: puts back events deleted or edited in Google, removes orphans, and never touches Amir's own events", async () => {
    await chooseCalendar(userId, calendarId, deps);
    await syncCalendar(deps);
    const [first, second] = await slots();
    fake.events.set(eventIdFor(first.id), { ...fake.events.get(eventIdFor(first.id))!, summary: "Edited in Google" });
    fake.events.set(eventIdFor(second.id), { ...fake.events.get(eventIdFor(second.id))!, status: "cancelled" });
    const orphan = { ...fake.events.get(eventIdFor(first.id))!, id: "bfmorphan00000000", extendedProperties: { private: { bfmApp: APP_TAG, bfmPostId: "00000000-0000-4000-8000-000000000009" } } };
    fake.events.set(orphan.id, orphan);
    fake.events.set("amirsown", { id: "amirsown", status: "confirmed", summary: "Dentist" });
    const result = await resyncCalendar(deps);
    expect(result).toMatchObject({ updated: 2, deleted: 1, failed: 0, remaining: 0 });
    expect(fake.events.get(eventIdFor(first.id))?.summary).toBe("Migss · SEO · Planned slot");
    expect(fake.events.get(eventIdFor(second.id))?.status).toBe("confirmed");
    expect(fake.events.get(orphan.id)?.status).toBe("cancelled");
    expect(fake.events.get("amirsown")).toEqual({ id: "amirsown", status: "confirmed", summary: "Dentist" });
  });

  it("does at most one pass's worth of changes and reports what remains", async () => {
    await chooseCalendar(userId, calendarId, deps);
    const extra = Array.from({ length: CHANGES_PER_PASS }, (_, index) => ({ projectId, slotDate: "2027-01-01", status: "planned" as const, cadenceDate: `2027-0${1 + Math.floor(index / 28)}-${String((index % 28) + 1).padStart(2, "0")}` }));
    await db.insert(posts).values(extra);
    const total = (await slots()).length;
    const first = await resyncCalendar(deps);
    expect(first.created).toBe(CHANGES_PER_PASS);
    expect(first.remaining).toBe(total - CHANGES_PER_PASS);
    expect(await resyncCalendar(deps)).toMatchObject({ remaining: 0, created: total - CHANGES_PER_PASS });
  });

  it("choosing another calendar makes every post due again", async () => {
    await chooseCalendar(userId, calendarId, deps);
    await syncCalendar(deps);
    expect((await getCalendarState(userId, db)).pending).toBe(0);
    await chooseCalendar(userId, calendarId, deps);
    expect((await getCalendarState(userId, db)).pending).toBe((await slots()).length);
  });
});
