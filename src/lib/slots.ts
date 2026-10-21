import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/db/client";
import { posts, projects } from "@/db/schema";
import { getPackage, PACKAGES } from "@/config/packages";
import { PRE_WRITING_STATUSES, type PostStatus } from "@/config/post-status";
import { addDays, isIsoDate, londonToday } from "./dates";
import { isUuid } from "./validation";

// Calendar slots (design decision 15). Active projects keep planned slots on their package's weekdays,
// eight weeks ahead, topped up whenever a project changes and whenever the calendar, Home or Run plan is
// read (γ3 orientation Q1). The generator skips any cadence date that already has a slot, moved or not.

export const SLOT_WINDOW_DAYS = 56;

// One row per package weekday, from src/config/packages.ts, as SQL VALUES.
function packageWeekdays() {
  const rows = PACKAGES.flatMap((item) => item.weekdays.map((day) => sql`(${item.key}, ${day}::int)`));
  return sql.join(rows, sql`, `);
}

// Adds any missing planned slot for active projects (or one project) from today to eight weeks ahead.
// Safe to run at any time, and twice at once: the unique (project_id, cadence_date) makes it a no-op.
export async function ensureSlots(options: { projectId?: string; today?: string } = {}, db: Executor = getDb()): Promise<number> {
  const today = options.today ?? londonToday();
  const last = addDays(today, SLOT_WINDOW_DAYS - 1);
  const result = await db.execute(sql`
    insert into posts (project_id, cadence_date, slot_date, status)
    select p.id, d::date, d::date, 'planned'
    from projects p
    join (values ${packageWeekdays()}) as w(package, dow) on w.package = p.package
    cross join generate_series(${today}::date, ${last}::date, interval '1 day') as d
    where p.status = 'active'
      and extract(dow from d)::int = w.dow
      ${options.projectId ? sql`and p.id = ${options.projectId}` : sql``}
    on conflict (project_id, cadence_date) do nothing
  `);
  return result.rowCount ?? 0;
}

// Brings a project's slots in line with its saved status and package (γ3 orientation Q8). It reads both
// from the database, so it always agrees with ensureSlots. Slots with a topic and past slots are never touched.
// - Paused: future empty slots go.
// - Active: future empty slots on a weekday the package no longer uses go, then the cadence is topped up.
export async function reconcileSlots(projectId: string, options: { today?: string } = {}, db: Executor = getDb()): Promise<void> {
  const [project] = await db
    .select({ id: projects.id, status: projects.status, package: projects.package })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return;
  const today = options.today ?? londonToday();
  const emptyFuture = and(eq(posts.projectId, project.id), eq(posts.status, "planned"), sql`${posts.slotDate} >= ${today}::date`);
  if (project.status === "paused") {
    await db.delete(posts).where(emptyFuture);
    return;
  }
  const days = getPackage(project.package).weekdays.map((day) => sql`${day}::int`);
  await db
    .delete(posts)
    .where(and(emptyFuture, sql`${posts.cadenceDate} is not null`, sql`extract(dow from ${posts.cadenceDate})::int not in (${sql.join(days, sql`, `)})`));
  await ensureSlots({ projectId: project.id, today }, db);
}

export class SlotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotError";
  }
}

export const TOPIC_MAX = 200;

async function editableSlot(id: string, db: Executor) {
  if (!isUuid(id)) throw new SlotError("This slot no longer exists.");
  const [row] = await db.select().from(posts).where(eq(posts.id, id));
  if (!row) throw new SlotError("This slot no longer exists.");
  return row;
}

// Sets or clears a slot's topic. Only before writing starts; an empty topic puts the slot back to planned.
export async function setTopic(id: string, input: unknown, db: Executor = getDb()) {
  const topic = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (topic.length > TOPIC_MAX) throw new SlotError(`Keep the topic under ${TOPIC_MAX} characters.`);
  const slot = await editableSlot(id, db);
  if (!PRE_WRITING_STATUSES.includes(slot.status)) throw new SlotError("The topic is fixed once writing has started.");
  const status: PostStatus = topic ? "topic_set" : "planned";
  const [row] = await db
    .update(posts)
    .set({
      topic: topic || null,
      status,
      topicSetAt: topic ? sql`now()` : null,
      statusChangedAt: status === slot.status ? slot.statusChangedAt : sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(posts.id, id), inArray(posts.status, [...PRE_WRITING_STATUSES])))
    .returning();
  if (!row) throw new SlotError("The topic is fixed once writing has started.");
  return row;
}

// Moves a slot to today or later. Its cadence date stays, so the generator does not refill the old day.
export async function moveSlot(id: string, input: unknown, options: { today?: string } = {}, db: Executor = getDb()) {
  const today = options.today ?? londonToday();
  if (!isIsoDate(input)) throw new SlotError("Choose a date.");
  if (input < today) throw new SlotError("Choose today or a later date.");
  const slot = await editableSlot(id, db);
  if (slot.status === "published") throw new SlotError("A published post cannot be moved.");
  const [row] = await db.update(posts).set({ slotDate: input, updatedAt: sql`now()` }).where(eq(posts.id, id)).returning();
  return row;
}
