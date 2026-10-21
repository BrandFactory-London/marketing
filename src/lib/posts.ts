import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { clients, posts, projects } from "@/db/schema";
import { PRE_WRITING_STATUSES, type PostStatus } from "@/config/post-status";
import { londonToday } from "./dates";
import { isUuid } from "./validation";

// Reads for every surface that shows slots and posts: the calendar, Home, the Run plan tab, the Posts
// page and the project cards. Writes live in src/lib/slots.ts.

export type SlotView = {
  id: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  status: PostStatus;
  slotDate: string;
  cadenceDate: string | null;
  topic: string | null;
};

const view = {
  id: posts.id,
  projectId: posts.projectId,
  projectName: projects.name,
  clientId: projects.clientId,
  clientName: clients.name,
  status: posts.status,
  slotDate: posts.slotDate,
  cadenceDate: posts.cadenceDate,
  topic: posts.topic,
};

function select(db: Database, where: SQL | undefined) {
  return db
    .select(view)
    .from(posts)
    .innerJoin(projects, eq(projects.id, posts.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(where);
}

const byDate = [asc(posts.slotDate), asc(sql`lower(${projects.name})`), asc(posts.createdAt)];

// Every slot between two dates (inclusive), optionally for one project: the calendar month and Home.
export async function listSlotsBetween(from: string, to: string, options: { projectId?: string } = {}, db: Database = getDb()): Promise<SlotView[]> {
  const project = options.projectId && isUuid(options.projectId) ? eq(posts.projectId, options.projectId) : undefined;
  return select(db, and(gte(posts.slotDate, from), lte(posts.slotDate, to), project)).orderBy(...byDate);
}

export async function getSlot(id: string, db: Database = getDb()): Promise<SlotView | null> {
  if (!isUuid(id)) return null;
  const [row] = await select(db, eq(posts.id, id));
  return row ?? null;
}

// The Run plan tab: missed slots first, then everything from today on (γ3 orientation Q9).
export async function listProjectPlan(projectId: string, options: { today?: string } = {}, db: Database = getDb()): Promise<SlotView[]> {
  if (!isUuid(projectId)) return [];
  const today = options.today ?? londonToday();
  return select(
    db,
    and(eq(posts.projectId, projectId), or(gte(posts.slotDate, today), inArray(posts.status, [...PRE_WRITING_STATUSES]))),
  ).orderBy(...byDate);
}

// The Posts page: every post at Topic set or later, newest first (γ3 orientation Q10).
export async function listStartedPosts(options: { clientId?: string } = {}, db: Database = getDb()): Promise<SlotView[]> {
  const client = options.clientId && isUuid(options.clientId) ? eq(projects.clientId, options.clientId) : undefined;
  return select(db, and(ne(posts.status, "planned"), client)).orderBy(desc(posts.slotDate), asc(sql`lower(${projects.name})`), asc(posts.createdAt));
}

export type NextSlot = { slotDate: string; topic: string | null };

// Each project's first slot from today on, for the "Next in run plan" line on project cards.
export async function nextSlots(options: { today?: string } = {}, db: Database = getDb()): Promise<Map<string, NextSlot>> {
  const today = options.today ?? londonToday();
  const rows = await db
    .selectDistinctOn([posts.projectId], { projectId: posts.projectId, slotDate: posts.slotDate, topic: posts.topic })
    .from(posts)
    .where(and(gte(posts.slotDate, today), ne(posts.status, "published")))
    .orderBy(posts.projectId, asc(posts.slotDate), asc(posts.createdAt));
  return new Map(rows.map((row) => [row.projectId, { slotDate: row.slotDate, topic: row.topic }]));
}
