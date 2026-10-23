import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type Database, type Executor } from "@/db/client";
import { calendarDeletions, derivatives, derivedSlots, posts, runChannels, runs } from "@/db/schema";
import { CONTENT_TYPE_KEYS, DERIVED_TYPES, type DerivedType } from "@/config/content-types";
import { placeDerived, runEnd, seoCadenceDates, type DerivedPlacement } from "./cadence";
import type { ChannelInput, RunInput } from "./run-config";
import { derivedEventIdFor, eventIdFor } from "./calendar-events";
import { addDays, isIsoDate, londonToday, longDate } from "./dates";
import { getModelSettings } from "./settings";
import { isUuid } from "./validation";

// Runs (Phase 2 session A1, orientation Q1 to Q4): a block of content for one project with an amount and a cadence per
// content type. Configuring a run puts typed placeholder slots on the calendar: SEO slots are rows in posts, derived
// slots rows in derived_slots, each the child of one SEO post. Changing a rule regenerates only empty, unmoved
// placeholders; everything else stays where it is.

export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunError";
  }
}

export type Run = typeof runs.$inferSelect;
export type RunChannel = typeof runChannels.$inferSelect;
export type DerivedSlot = typeof derivedSlots.$inferSelect;

// ---- Reads ----

export async function listProjectRuns(projectId: string, db: Executor = getDb()): Promise<(Run & { channels: RunChannel[] })[]> {
  if (!isUuid(projectId)) return [];
  const rows = await db.select().from(runs).where(eq(runs.projectId, projectId)).orderBy(asc(runs.startsOn));
  const channels = rows.length ? await db.select().from(runChannels).where(inArray(runChannels.runId, rows.map((row) => row.id))) : [];
  return rows.map((row) => ({ ...row, channels: CONTENT_TYPE_KEYS.flatMap((type) => channels.filter((channel) => channel.runId === row.id && channel.contentType === type)) }));
}

export async function getRun(runId: string, db: Executor = getDb()): Promise<(Run & { channels: RunChannel[] }) | null> {
  if (!isUuid(runId)) return null;
  const [row] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!row) return null;
  const channels = await db.select().from(runChannels).where(eq(runChannels.runId, runId));
  return { ...row, channels: CONTENT_TYPE_KEYS.flatMap((type) => channels.filter((channel) => channel.contentType === type)) };
}

// The run shown first on the Run plan tab: the one running today, else the next one, else the latest.
export function currentRun<T extends Pick<Run, "startsOn" | "endsOn">>(list: readonly T[], today: string): T | null {
  return list.find((run) => run.startsOn <= today && today <= run.endsOn) ?? list.find((run) => run.startsOn > today) ?? list.at(-1) ?? null;
}

// Where a new run should start: the day after the project's last run, or today.
export function suggestedStart(list: readonly Pick<Run, "endsOn">[], today: string): string {
  const last = list.map((run) => run.endsOn).sort().at(-1);
  const next = last ? addDays(last, 1) : today;
  return next < today ? today : next;
}

// ---- Writes ----

async function lockProject(tx: Executor, projectId: string) {
  await tx.execute(sql`select id from projects where id = ${projectId} for update`);
}

function overlapping(list: readonly Run[], startsOn: string, endsOn: string, except?: string): Run | undefined {
  return list.find((run) => run.id !== except && run.startsOn <= endsOn && startsOn <= run.endsOn);
}

function overlapMessage(other: Run): string {
  return `This run overlaps ${other.name} (${longDate(other.startsOn)} to ${longDate(other.endsOn)}). Start it on ${longDate(addDays(other.endsOn, 1))} or later, or shorten it.`;
}

async function saveChannels(tx: Executor, runId: string, channels: readonly ChannelInput[]) {
  await tx.delete(runChannels).where(eq(runChannels.runId, runId));
  await tx.insert(runChannels).values(channels.map((channel) => ({ runId, contentType: channel.contentType, amount: channel.amount, cadence: channel.cadence })));
}

export async function createRun(projectId: string, value: RunInput, db: Database = getDb(), options: { today?: string } = {}): Promise<Run> {
  if (!isUuid(projectId)) throw new RunError("This project no longer exists.");
  const endsOn = runEnd(value.startsOn, value.months);
  return db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    const existing = await tx.select().from(runs).where(eq(runs.projectId, projectId));
    const clash = overlapping(existing, value.startsOn, endsOn);
    if (clash) throw new RunError(overlapMessage(clash));
    const [run] = await tx
      .insert(runs)
      .values({
        projectId,
        name: `Run ${existing.length + 1}`,
        preset: value.preset,
        startsOn: value.startsOn,
        endsOn,
        priorityNotes: value.priorityNotes,
        lengthMin: value.lengthMin,
        lengthMax: value.lengthMax,
        cta: value.cta,
        faqMode: value.faqMode,
        writerModel: value.writerModel,
        criticModel: value.criticModel,
      })
      .returning();
    await saveChannels(tx, run.id, value.channels);
    await generateRunSlots(tx, run.id, options.today);
    return run;
  });
}

// Saving a run's configuration again regenerates its empty, unmoved placeholders only (orientation Q4).
export async function updateRun(runId: string, value: RunInput, db: Database = getDb(), options: { today?: string } = {}): Promise<Run> {
  const current = await getRun(runId, db);
  if (!current) throw new RunError("This run no longer exists.");
  if (current.imported) throw new RunError(`${current.name} was made from the Phase 1 slots. Change its slots one by one.`);
  const endsOn = runEnd(value.startsOn, value.months);
  return db.transaction(async (tx) => {
    await lockProject(tx, current.projectId);
    const existing = await tx.select().from(runs).where(eq(runs.projectId, current.projectId));
    const clash = overlapping(existing, value.startsOn, endsOn, runId);
    if (clash) throw new RunError(overlapMessage(clash));
    const outside = await tx
      .select({ slotDate: posts.slotDate })
      .from(posts)
      .where(and(eq(posts.runId, runId), sql`(${posts.slotDate} < ${value.startsOn} or ${posts.slotDate} > ${endsOn})`, touchedPost()));
    if (outside.length > 0) throw new RunError(`The SEO post on ${longDate(outside[0].slotDate)} has a topic or has moved, and would fall outside the run. Keep it inside the run's dates.`);
    const [run] = await tx
      .update(runs)
      .set({
        preset: value.preset,
        startsOn: value.startsOn,
        endsOn,
        priorityNotes: value.priorityNotes,
        lengthMin: value.lengthMin,
        lengthMax: value.lengthMax,
        cta: value.cta,
        faqMode: value.faqMode,
        writerModel: value.writerModel,
        criticModel: value.criticModel,
        updatedAt: sql`now()`,
      })
      .where(eq(runs.id, runId))
      .returning();
    await saveChannels(tx, runId, value.channels);
    await generateRunSlots(tx, runId, options.today);
    return run;
  });
}

// A run still being set up whose slots nobody has touched can be deleted, slots and all.
export async function deleteRun(runId: string, db: Database = getDb()): Promise<void> {
  const run = await getRun(runId, db);
  if (!run) throw new RunError("This run no longer exists.");
  if (run.status !== "setting_up" || run.imported) throw new RunError("Only a run still being set up can be deleted.");
  await db.transaction(async (tx) => {
    const touched = await tx.select({ id: posts.id }).from(posts).where(and(eq(posts.runId, runId), touchedPost())).limit(1);
    if (touched.length > 0) throw new RunError("A slot in this run has a topic or has moved. Clear it first, or keep the run.");
    const children = await tx.select({ id: derivedSlots.id }).from(derivedSlots).where(eq(derivedSlots.runId, runId));
    await dropDerived(tx, children.map((row) => row.id));
    const seo = await tx.select({ id: posts.id }).from(posts).where(eq(posts.runId, runId));
    await dropPosts(tx, seo.map((row) => row.id));
    await tx.delete(runs).where(eq(runs.id, runId));
  });
}

// ---- Slot generation ----

// An SEO slot is touched once it is more than an empty, unmoved placeholder from its rule.
function touchedPost() {
  return sql`(${posts.status} <> 'planned' or ${posts.topic} is not null or ${posts.batchId} is not null or ${posts.cadenceDate} is null or ${posts.slotDate} <> ${posts.cadenceDate})`;
}

async function dropPosts(tx: Executor, ids: string[]) {
  if (ids.length === 0) return;
  await tx.insert(calendarDeletions).values(ids.map((postId) => ({ postId, eventId: eventIdFor(postId) }))).onConflictDoNothing();
  await tx.delete(posts).where(inArray(posts.id, ids));
}

async function dropDerived(tx: Executor, ids: string[]) {
  if (ids.length === 0) return;
  // calendar_deletions keys on the record's ID; for a derived slot that is the slot's own ID.
  await tx.insert(calendarDeletions).values(ids.map((postId) => ({ postId, eventId: derivedEventIdFor(postId) }))).onConflictDoNothing();
  await tx.delete(derivedSlots).where(inArray(derivedSlots.id, ids));
}

// Derived slots with text, or moved by hand, stay put.
async function derivedTouched(tx: Executor, rows: readonly DerivedSlot[]): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const versions = await tx
    .select({ postId: derivatives.postId, channel: derivatives.channel })
    .from(derivatives)
    .where(inArray(derivatives.postId, [...new Set(rows.map((row) => row.parentPostId))]));
  const written = new Set(versions.map((row) => `${row.postId}:${row.channel}`));
  return new Set(rows.filter((row) => row.slotDate !== row.cadenceDate || written.has(`${row.parentPostId}:${row.contentType}`)).map((row) => row.id));
}

// Brings a run's placeholders in line with its rules (orientation Q4). Touched slots stay; untouched SEO slots on a
// date the rule still gives stay; the rest go and the missing ones are made. Then each derived channel the same way.
// Days before today are left as they are, so editing a run that has started never rewrites its past.
export async function generateRunSlots(tx: Executor, runId: string, today: string = londonToday()): Promise<void> {
  const [row] = await tx.select().from(runs).where(eq(runs.id, runId));
  if (!row) return;
  const from = row.startsOn > today ? row.startsOn : today;
  const run = { ...row, startsOn: from };
  const channels = await tx.select().from(runChannels).where(eq(runChannels.runId, runId));
  const seoRule = channels.find((channel) => channel.contentType === "seo");

  // SEO slots.
  const seo = await tx.select().from(posts).where(eq(posts.runId, runId));
  const untouched = seo.filter((post) => post.slotDate >= from && post.status === "planned" && !post.topic && !post.batchId && post.cadenceDate && post.slotDate === post.cadenceDate);
  const kept = seo.filter((post) => !untouched.includes(post));
  const chosen = new Set(
    seoRule && "weekdays" in seoRule.cadence
      ? seoCadenceDates({
          startsOn: run.startsOn,
          endsOn: run.endsOn,
          weekdays: seoRule.cadence.weekdays,
          amount: seoRule.amount,
          kept: kept.length,
          taken: new Set(kept.map((post) => post.cadenceDate).filter((day): day is string => Boolean(day))),
        })
      : [],
  );
  const leaving = untouched.filter((post) => !chosen.has(post.cadenceDate!));
  if (leaving.length > 0) {
    const children = await tx.select({ id: derivedSlots.id }).from(derivedSlots).where(inArray(derivedSlots.parentPostId, leaving.map((post) => post.id)));
    await dropDerived(tx, children.map((row) => row.id));
    await dropPosts(tx, leaving.map((post) => post.id));
  }
  const present = new Set(untouched.filter((post) => chosen.has(post.cadenceDate!)).map((post) => post.cadenceDate));
  const adding = [...chosen].filter((day) => !present.has(day));
  if (adding.length > 0) await tx.insert(posts).values(adding.map((day) => ({ projectId: run.projectId, runId, cadenceDate: day, slotDate: day, status: "planned" as const })));

  // Derived slots, per channel.
  const parents = (await tx.select({ id: posts.id, slotDate: posts.slotDate }).from(posts).where(eq(posts.runId, runId))).sort((a, b) => a.slotDate.localeCompare(b.slotDate));
  const existing = await tx.select().from(derivedSlots).where(eq(derivedSlots.runId, runId));
  const touched = await derivedTouched(tx, existing);
  for (const contentType of DERIVED_TYPES) {
    const rule = channels.find((channel) => channel.contentType === contentType);
    const own = existing.filter((row) => row.contentType === contentType);
    const keptOwn = own.filter((row) => touched.has(row.id) || row.slotDate < from);
    const free = parents.filter((parent) => !keptOwn.some((row) => row.parentPostId === parent.id));
    const desired: DerivedPlacement[] = rule
      ? placeDerived({ parents: free, cadence: rule.cadence, amount: Math.max(rule.amount - keptOwn.length, 0), startsOn: run.startsOn, endsOn: run.endsOn })
      : [];
    const wanted = new Set(desired.map((item) => `${item.parentId}:${item.date}`));
    const stale = own.filter((row) => !keptOwn.includes(row) && !wanted.has(`${row.parentPostId}:${row.cadenceDate}`));
    await dropDerived(tx, stale.map((row) => row.id));
    const stays = new Set(own.filter((row) => !stale.includes(row)).map((row) => `${row.parentPostId}:${row.cadenceDate}`));
    const missing = desired.filter((item) => !stays.has(`${item.parentId}:${item.date}`));
    if (missing.length > 0) {
      await tx.insert(derivedSlots).values(missing.map((item) => ({ runId, parentPostId: item.parentId, contentType: contentType as DerivedType, slotDate: item.date, cadenceDate: item.date })));
    }
  }
  await tx.update(runs).set({ updatedAt: sql`now()` }).where(eq(runs.id, runId));
}

// ---- Moves ----

async function runOf(tx: Executor, runId: string | null): Promise<Run | null> {
  if (!runId) return null;
  const [row] = await tx.select().from(runs).where(eq(runs.id, runId));
  return row ?? null;
}

// Checks an SEO move against its run, and keeps its derived slots after it: an unmoved child on a "days after" rule
// follows its parent; any child the move would leave before its parent moves to the parent's day.
export async function afterSeoMove(tx: Executor, postId: string, date: string): Promise<void> {
  const [post] = await tx.select().from(posts).where(eq(posts.id, postId));
  if (!post) return;
  const run = await runOf(tx, post.runId);
  if (!run) return;
  const channels = await tx.select().from(runChannels).where(eq(runChannels.runId, run.id));
  const children = await tx.select().from(derivedSlots).where(eq(derivedSlots.parentPostId, postId));
  const touched = await derivedTouched(tx, children);
  for (const child of children) {
    const rule = channels.find((channel) => channel.contentType === child.contentType)?.cadence;
    if (!touched.has(child.id) && rule && "after" in rule) {
      const next = addDays(date, rule.after);
      const day = next > run.endsOn ? date : next;
      await tx.update(derivedSlots).set({ slotDate: day, cadenceDate: day, updatedAt: sql`now()` }).where(eq(derivedSlots.id, child.id));
    } else if (child.slotDate < date) {
      await tx.update(derivedSlots).set({ slotDate: date, updatedAt: sql`now()` }).where(eq(derivedSlots.id, child.id));
    }
  }
}

export async function runBoundsFor(postId: string, db: Executor = getDb()): Promise<{ startsOn: string; endsOn: string; name: string } | null> {
  const [row] = await db.select({ startsOn: runs.startsOn, endsOn: runs.endsOn, name: runs.name }).from(posts).innerJoin(runs, eq(runs.id, posts.runId)).where(eq(posts.id, postId));
  return row ?? null;
}

// Moves a derived slot: today or later, inside its run, and never before its SEO post.
export async function moveDerivedSlot(id: string, input: unknown, options: { today?: string } = {}, db: Database = getDb()): Promise<DerivedSlot> {
  const today = options.today ?? londonToday();
  if (!isUuid(id)) throw new RunError("This slot no longer exists.");
  if (!isIsoDate(input)) throw new RunError("Choose a date.");
  if (input < today) throw new RunError("Choose today or a later date.");
  const [row] = await db
    .select({ slot: derivedSlots, parentDate: posts.slotDate, endsOn: runs.endsOn })
    .from(derivedSlots)
    .innerJoin(posts, eq(posts.id, derivedSlots.parentPostId))
    .innerJoin(runs, eq(runs.id, derivedSlots.runId))
    .where(eq(derivedSlots.id, id));
  if (!row) throw new RunError("This slot no longer exists.");
  if (input < row.parentDate) throw new RunError(`Keep it on or after its SEO post, ${longDate(row.parentDate)}.`);
  if (input > row.endsOn) throw new RunError(`Keep it inside the run, which ends on ${longDate(row.endsOn)}.`);
  const [moved] = await db.update(derivedSlots).set({ slotDate: input, updatedAt: sql`now()` }).where(eq(derivedSlots.id, id)).returning();
  return moved;
}

// ---- The backstop for the retired package generator (orientation Q3) ----

// While the Phase 1 version still serves during a deploy, its package generator can add a slot with no run. A slot with
// no run joins the project's run that covers its date; an empty, unmoved one outside every run is the retired
// generator's leftover and goes, with its calendar event. Anything else stays, shown as outside any run.
export async function adoptOrphanSlots(options: { projectId?: string } = {}, db: Database = getDb()): Promise<number> {
  const project = options.projectId && isUuid(options.projectId) ? eq(posts.projectId, options.projectId) : undefined;
  const orphans = await db.select().from(posts).where(and(isNull(posts.runId), project));
  if (orphans.length === 0) return 0;
  const projectIds = [...new Set(orphans.map((post) => post.projectId))];
  const allRuns = await db.select().from(runs).where(inArray(runs.projectId, projectIds));
  let changed = 0;
  await db.transaction(async (tx) => {
    const leftovers: string[] = [];
    for (const post of orphans) {
      const run = allRuns.find((item) => item.projectId === post.projectId && item.startsOn <= post.slotDate && post.slotDate <= item.endsOn);
      if (run) {
        await tx.update(posts).set({ runId: run.id }).where(and(eq(posts.id, post.id), isNull(posts.runId)));
        changed++;
      } else if (post.status === "planned" && !post.topic && !post.batchId && post.cadenceDate && post.slotDate === post.cadenceDate) {
        leftovers.push(post.id);
      }
    }
    await dropPosts(tx, leftovers);
    changed += leftovers.length;
  });
  return changed;
}

// ---- The Run plan tab ----

export type DerivedSlotView = DerivedSlot & { versionStatus: "writing" | "ready" | "failed" | null };
export type RunSlotView = { post: typeof posts.$inferSelect; derived: DerivedSlotView[] };

// A run's SEO slots by date, each with its derived slots and their newest version's state.
export async function runSlots(runId: string, db: Executor = getDb()): Promise<RunSlotView[]> {
  if (!isUuid(runId)) return [];
  const seo = await db.select().from(posts).where(eq(posts.runId, runId)).orderBy(asc(posts.slotDate), asc(posts.createdAt));
  const children = await db.select().from(derivedSlots).where(eq(derivedSlots.runId, runId)).orderBy(asc(derivedSlots.slotDate));
  const versions = children.length
    ? await db
        .selectDistinctOn([derivatives.postId, derivatives.channel], { postId: derivatives.postId, channel: derivatives.channel, status: derivatives.status })
        .from(derivatives)
        .where(inArray(derivatives.postId, [...new Set(children.map((row) => row.parentPostId))]))
        .orderBy(derivatives.postId, derivatives.channel, desc(derivatives.version))
    : [];
  return seo.map((post) => ({
    post,
    derived: children
      .filter((row) => row.parentPostId === post.id)
      .map((row) => ({ ...row, versionStatus: versions.find((item) => item.postId === row.parentPostId && item.channel === row.contentType)?.status ?? null })),
  }));
}

export async function orphanSlots(projectId: string, db: Executor = getDb()) {
  if (!isUuid(projectId)) return [];
  return db.select().from(posts).where(and(eq(posts.projectId, projectId), isNull(posts.runId))).orderBy(asc(posts.slotDate));
}

// The form's starting values: the run's own, or a preset's for a new run.
export async function runFormDefaults(db: Database = getDb()) {
  const settings = await getModelSettings(db);
  return { writerModel: settings.writerModel, criticModel: settings.criticModel };
}

