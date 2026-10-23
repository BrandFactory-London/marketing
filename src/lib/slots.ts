import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type Database, type Executor } from "@/db/client";
import { posts } from "@/db/schema";
import { PRE_WRITING_STATUSES, type PostStatus } from "@/config/post-status";
import { isIsoDate, londonToday, longDate } from "./dates";
import { afterSeoMove, runBoundsFor } from "./runs";
import { isUuid } from "./validation";

// Calendar slots (design decision 15). Since Phase 2 A1 a run creates its project's slots (src/lib/runs.ts); the package
// generator that kept eight weeks of slots topped up is retired. Topics and moves stay here.

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
  if (slot.batchId) throw new SlotError("The topic is fixed once the post is in a batch. Redraft its spec with a note instead.");
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
    .where(and(eq(posts.id, id), inArray(posts.status, [...PRE_WRITING_STATUSES]), isNull(posts.batchId)))
    .returning();
  if (!row) throw new SlotError("The topic is fixed once writing has started.");
  return row;
}

// Moves a slot to today or later, inside its run. Its cadence date stays, so a rule change leaves it alone, and its
// derived slots keep after it (Phase 2 A1, orientation Q4).
export async function moveSlot(id: string, input: unknown, options: { today?: string } = {}, db: Database = getDb()) {
  const today = options.today ?? londonToday();
  if (!isIsoDate(input)) throw new SlotError("Choose a date.");
  if (input < today) throw new SlotError("Choose today or a later date.");
  const slot = await editableSlot(id, db);
  if (slot.status === "published") throw new SlotError("A published post cannot be moved.");
  const run = await runBoundsFor(id, db);
  if (run && (input < run.startsOn || input > run.endsOn)) throw new SlotError(`Keep it inside ${run.name}, ${longDate(run.startsOn)} to ${longDate(run.endsOn)}.`);
  return db.transaction(async (tx) => {
    const [row] = await tx.update(posts).set({ slotDate: input, updatedAt: sql`now()` }).where(eq(posts.id, id)).returning();
    await afterSeoMove(tx, id, input);
    return row;
  });
}
