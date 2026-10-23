import { eq, inArray, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { appSettings, calendarDeletions, clients, googleTokens, posts, postSpecs, projects } from "@/db/schema";
import { APP_TAG, buildEvent, eventHash, eventIdFor, ownedFields, type CalendarEvent, type CalendarPost } from "./calendar-events";
import { londonToday } from "./dates";
import { deleteEvent, hasCalendarScopes, listAppEvents, listOwnedCalendars, upsertEvent, type CalendarOptions, type OwnedCalendar } from "./google-calendar";
import { getGoogleAccessToken, GoogleReconnectRequired } from "./google-tokens";

// The one-way mirror of every slot into Amir's Google Calendar (γ8 orientation Q2 to Q5). Every Calendar call runs in
// the app, never in Trigger.dev, so the Google secrets stay in Vercel. A post is due an update when the hash of its
// event differs from the one last sent, whatever code changed it. Failures are recorded, never thrown to the caller.

export class CalendarSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarSetupError";
  }
}

// At most this many changes per pass; "Sync calendar now" calls again until nothing remains (γ8 orientation Q2).
export const CHANGES_PER_PASS = 100;
export const CONCURRENCY = 4;
// A pass started by reading a page is skipped if one ran this recently.
export const READ_THROTTLE_MS = 60_000;

export type CalendarDeps = { db?: Database; now?: () => Date } & CalendarOptions;
export type SyncResult = { skipped: string | null; created: number; updated: number; deleted: number; failed: number; remaining: number };

const emptyResult = (skipped: string | null = null): SyncResult => ({ skipped, created: 0, updated: 0, deleted: 0, failed: 0, remaining: 0 });

// The app's own address, for links in event descriptions. Vercel sets VERCEL_PROJECT_PRODUCTION_URL itself; APP_URL
// overrides it (Playwright).
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, "");
  return env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
}

export type CalendarState = {
  // The signed-in user's Google connection carries the two Calendar scopes.
  granted: boolean;
  calendarId: string | null;
  calendarName: string | null;
  syncedAt: Date | null;
  error: string | null;
  errorAt: Date | null;
  pending: number;
};

async function settingsRow(db: Database) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  if (row) return row;
  const [created] = await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(appSettings).where(eq(appSettings.id, 1)))[0];
}

async function grantedFor(db: Database, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const [row] = await db.select({ scope: googleTokens.scope }).from(googleTokens).where(eq(googleTokens.userId, userId));
  return hasCalendarScopes(row?.scope);
}

export async function getCalendarState(userId: string, db: Database = getDb()): Promise<CalendarState> {
  const row = await settingsRow(db);
  const granted = await grantedFor(db, userId);
  const due = row.calendarId ? (await dueEvents(db, londonToday())).length + (await db.select({ id: calendarDeletions.postId }).from(calendarDeletions)).length : 0;
  return { granted, calendarId: row.calendarId, calendarName: row.calendarName, syncedAt: row.calendarSyncedAt, error: row.calendarError, errorAt: row.calendarErrorAt, pending: due };
}

export async function listCalendarsFor(userId: string, deps: CalendarDeps = {}): Promise<OwnedCalendar[]> {
  const db = deps.db ?? getDb();
  if (!(await grantedFor(db, userId))) throw new CalendarSetupError("Reconnect Google and allow Google Calendar first.");
  const { accessToken } = await getGoogleAccessToken(userId, { db, fetchImpl: deps.fetchImpl });
  return listOwnedCalendars(accessToken, deps);
}

// Choosing a calendar (γ8 orientation Q5): every post is due again, so the next sync fills the new calendar. Events in
// a previously chosen calendar stay there.
export async function chooseCalendar(userId: string, calendarId: string, deps: CalendarDeps = {}): Promise<OwnedCalendar> {
  const db = deps.db ?? getDb();
  const chosen = (await listCalendarsFor(userId, deps)).find((item) => item.id === calendarId);
  if (!chosen) throw new CalendarSetupError("That calendar is not one you own. Choose another.");
  await db.transaction(async (tx) => {
    await tx.update(appSettings).set({ calendarUserId: userId, calendarId: chosen.id, calendarName: chosen.name, calendarError: null, calendarErrorAt: null, updatedAt: sql`now()` }).where(eq(appSettings.id, 1));
    await tx.update(posts).set({ calendarHash: null, calendarSyncedAt: null, calendarError: null });
    await tx.delete(calendarDeletions);
  });
  return chosen;
}

type DueEvent = { event: CalendarEvent; hash: string; synced: string | null; error: string | null };

// Every post's event as the app says it should be, today.
async function desiredEvents(db: Database, today: string): Promise<DueEvent[]> {
  const rows = await db
    .select({
      postId: posts.id,
      status: posts.status,
      generationStep: posts.generationStep,
      slotDate: posts.slotDate,
      topic: posts.topic,
      liveUrl: posts.liveUrl,
      calendarHash: posts.calendarHash,
      calendarError: posts.calendarError,
      projectName: projects.name,
      clientName: clients.name,
      clientShortName: clients.shortName,
    })
    .from(posts)
    .innerJoin(projects, eq(projects.id, posts.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .orderBy(posts.slotDate);
  const ids = rows.map((row) => row.postId);
  const specs = ids.length
    ? await db
        .selectDistinctOn([postSpecs.postId], { postId: postSpecs.postId, notes: postSpecs.notes })
        .from(postSpecs)
        .where(inArray(postSpecs.postId, ids))
        .orderBy(postSpecs.postId, sql`${postSpecs.version} desc`)
    : [];
  const appUrl = appBaseUrl();
  return rows.map((row) => {
    const post: CalendarPost = { ...row, specNotes: specs.find((spec) => spec.postId === row.postId)?.notes ?? null };
    const event = buildEvent(post, { today, appUrl });
    return { event, hash: eventHash(event), synced: row.calendarHash, error: row.calendarError };
  });
}

async function dueEvents(db: Database, today: string): Promise<DueEvent[]> {
  return (await desiredEvents(db, today)).filter((item) => item.hash !== item.synced || item.error);
}

// Runs the tasks a few at a time.
async function inPool<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await run(items[next++]);
  }));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Pass = { db: Database; accessToken: string; calendarId: string; result: SyncResult; errors: string[]; options: CalendarOptions };

async function pushEvent(pass: Pass, item: Pick<DueEvent, "event" | "hash">): Promise<void> {
  const postId = item.event.extendedProperties.private.bfmPostId;
  try {
    pass.result[(await upsertEvent(pass.accessToken, pass.calendarId, item.event, pass.options)) === "created" ? "created" : "updated"]++;
    await pass.db.update(posts).set({ calendarHash: item.hash, calendarSyncedAt: sql`now()`, calendarError: null }).where(eq(posts.id, postId));
  } catch (error) {
    pass.result.failed++;
    pass.errors.push(message(error));
    await pass.db.update(posts).set({ calendarError: message(error).slice(0, 500) }).where(eq(posts.id, postId));
  }
}

async function removeEvent(pass: Pass, postId: string, eventId: string, fromTable: boolean): Promise<void> {
  try {
    await deleteEvent(pass.accessToken, pass.calendarId, eventId, pass.options);
    pass.result.deleted++;
    if (fromTable) await pass.db.delete(calendarDeletions).where(eq(calendarDeletions.postId, postId));
  } catch (error) {
    pass.result.failed++;
    pass.errors.push(message(error));
    if (fromTable) await pass.db.update(calendarDeletions).set({ attempts: sql`${calendarDeletions.attempts} + 1`, error: message(error).slice(0, 500) }).where(eq(calendarDeletions.postId, postId));
  }
}

// Opens a pass: the chosen calendar, the sync user's token. Null with a reason when there is nothing to sync into.
async function openPass(deps: CalendarDeps): Promise<{ pass: Pass } | { skipped: string }> {
  const db = deps.db ?? getDb();
  const row = await settingsRow(db);
  if (!row.calendarId || !row.calendarUserId) return { skipped: "No calendar is chosen." };
  if (!(await grantedFor(db, row.calendarUserId))) return { skipped: "Google Calendar is not allowed for the stored Google connection." };
  try {
    const { accessToken } = await getGoogleAccessToken(row.calendarUserId, { db, fetchImpl: deps.fetchImpl });
    return { pass: { db, accessToken, calendarId: row.calendarId, result: emptyResult(), errors: [], options: deps } };
  } catch (error) {
    const reason = error instanceof GoogleReconnectRequired ? `Calendar needs reconnecting: ${error.message}` : message(error);
    await record(db, deps, emptyResult(), [reason]);
    return { skipped: reason };
  }
}

async function record(db: Database, deps: CalendarDeps, result: SyncResult, errors: string[]): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  const error = errors.length ? `${result.failed || errors.length} not synced. ${errors[0]}`.slice(0, 1000) : null;
  await db
    .update(appSettings)
    .set({ calendarSyncedAt: now, calendarError: error, calendarErrorAt: error ? now : null, updatedAt: sql`now()` })
    .where(eq(appSettings.id, 1));
}

// One pass: queued deletions first, then every post whose event is due, up to CHANGES_PER_PASS changes.
export async function syncCalendar(deps: CalendarDeps = {}): Promise<SyncResult> {
  const opened = await openPass(deps);
  if ("skipped" in opened) return emptyResult(opened.skipped);
  const { pass } = opened;
  const today = londonToday((deps.now ?? (() => new Date()))());
  const [{ queued }] = await pass.db.select({ queued: sql<number>`count(*)::int` }).from(calendarDeletions);
  const deletions = await pass.db.select().from(calendarDeletions).limit(CHANGES_PER_PASS);
  await inPool(deletions, (row) => removeEvent(pass, row.postId, row.eventId, true));
  const due = await dueEvents(pass.db, today);
  const room = Math.max(CHANGES_PER_PASS - deletions.length, 0);
  await inPool(due.slice(0, room), (item) => pushEvent(pass, item));
  // Only what this pass did not try; a failure waits for the next pass rather than being retried at once.
  pass.result.remaining = Number(queued) - deletions.length + Math.max(due.length - room, 0);
  await record(pass.db, deps, pass.result, pass.errors);
  return pass.result;
}

// Sync calendar now (γ8 handoff item 6, orientation Q4): compares the calendar's own copy of the app's events with
// the posts, creates or patches whatever differs (an edit made in Google is overwritten), and deletes the app's events
// whose post no longer exists. Events without the app's tag are never listed, so never touched.
export async function resyncCalendar(deps: CalendarDeps = {}): Promise<SyncResult> {
  const opened = await openPass(deps);
  if ("skipped" in opened) return emptyResult(opened.skipped);
  const { pass } = opened;
  const today = londonToday((deps.now ?? (() => new Date()))());
  let remote;
  try {
    remote = await listAppEvents(pass.accessToken, pass.calendarId, APP_TAG, pass.options);
  } catch (error) {
    await record(pass.db, deps, pass.result, [message(error)]);
    return { ...pass.result, skipped: message(error) };
  }
  const byPost = new Map(remote.map((event) => [event.extendedProperties?.private?.bfmPostId ?? "", event]));
  const desired = await desiredEvents(pass.db, today);
  const known = new Set(desired.map((item) => item.event.extendedProperties.private.bfmPostId));

  const orphans = remote.filter((event) => !known.has(event.extendedProperties?.private?.bfmPostId ?? ""));
  const differing: DueEvent[] = [];
  for (const item of desired) {
    const there = byPost.get(item.event.extendedProperties.private.bfmPostId);
    const same = there && there.id === item.event.id && JSON.stringify(ownedFields(there as CalendarEvent)) === JSON.stringify(ownedFields(item.event));
    if (!same) differing.push(item);
    else if (item.synced !== item.hash || item.error) {
      await pass.db.update(posts).set({ calendarHash: item.hash, calendarSyncedAt: sql`now()`, calendarError: null }).where(eq(posts.id, item.event.extendedProperties.private.bfmPostId));
    }
  }
  const orphanBatch = orphans.slice(0, CHANGES_PER_PASS);
  await inPool(orphanBatch, (event) => removeEvent(pass, event.extendedProperties?.private?.bfmPostId ?? "", event.id, false));
  // Queued deletions are covered by the orphan sweep.
  if (orphans.length <= CHANGES_PER_PASS) await pass.db.delete(calendarDeletions);
  const room = Math.max(CHANGES_PER_PASS - orphanBatch.length, 0);
  await inPool(differing.slice(0, room), (item) => pushEvent(pass, item));
  pass.result.remaining = Math.max(orphans.length - orphanBatch.length, 0) + Math.max(differing.length - room, 0);
  await record(pass.db, deps, pass.result, pass.errors);
  return pass.result;
}

// Never throws: the post action or page that asked for a sync always succeeds (γ8 handoff item 7).
export async function syncCalendarSafely(options: { throttle?: boolean } & CalendarDeps = {}): Promise<SyncResult> {
  const db = options.db ?? getDb();
  try {
    if (options.throttle) {
      const row = await settingsRow(db);
      const now = (options.now ?? (() => new Date()))().getTime();
      if (row.calendarSyncedAt && now - row.calendarSyncedAt.getTime() < READ_THROTTLE_MS) return emptyResult("Synced less than a minute ago.");
    }
    return await syncCalendar({ ...options, db });
  } catch (error) {
    console.error("Calendar sync failed:", error);
    try {
      await record(db, options, emptyResult(), [message(error)]);
    } catch {
      // The database itself is unavailable; the next pass records it.
    }
    return emptyResult(message(error));
  }
}

// Queues a slot's event for deletion, in the same transaction that deletes the slot (γ8 orientation Q4).
export async function queueEventDeletions(tx: Pick<Database, "insert">, postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  await tx
    .insert(calendarDeletions)
    .values(postIds.map((postId) => ({ postId, eventId: eventIdFor(postId) })))
    .onConflictDoNothing();
}
