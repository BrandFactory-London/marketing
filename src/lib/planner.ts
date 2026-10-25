import { and, asc, desc, eq, inArray, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { planDrafts, planFeedback, planItems, posts, projectPillars, runs } from "@/db/schema";
import { OTHER_CATEGORY } from "@/config/run-status";
import * as plannerPrompt from "@/prompts/planner";
import { AiClient, ModelOutputError, type Transport } from "./ai/client";
import { channelRules, loadPack, withChannelRules } from "./ai/pack";
import { categoryLabels } from "./categories";
import { londonToday, longDate } from "./dates";
import { failureMessage } from "./generation";
import { closeTo } from "./plan-overlap";
import { listSitePages } from "./sitemap";
import { isUuid } from "./validation";

// The planner (Phase 2 A3, orientation Q5). Amir asks for a plan, or for one item or the whole plan again with a note;
// the draft-plan task calls the writer model once; the items land as the plan's newest versions, older ones replaced.
// Approving the plan writes each title to its post's topic and the excerpt to planned_excerpt, for A4's auto specs.

export const PLAN_EFFORT = "high" as const;
export const PLAN_MAX_TOKENS = 32000;
export const NOTE_MAX = 2000;

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

export type PlannerDeps = { db: Database; transport: Transport };
type Run = typeof runs.$inferSelect;
type PlanItem = typeof planItems.$inferSelect;

async function getRunRow(db: Database, runId: string): Promise<Run> {
  if (!isUuid(runId)) throw new PlanError("This run no longer exists.");
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new PlanError("This run no longer exists.");
  return run;
}

// The SEO slots a plan covers: empty placeholders, and slots whose topic came from this plan. A slot Amir gave a
// topic himself, or one already in a batch, keeps it and counts as covered.
export async function plannableSlots(db: Database, runId: string) {
  const planned = db.select({ postId: planItems.postId }).from(planItems).where(eq(planItems.runId, runId));
  return db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.runId, runId),
        sql`${posts.batchId} is null`,
        or(eq(posts.status, "planned"), and(eq(posts.status, "topic_set"), inArray(posts.id, planned))),
      ),
    )
    .orderBy(asc(posts.slotDate), asc(posts.createdAt));
}

// Each slot's newest item, from every plan version so far.
export async function currentItems(db: Database, runId: string): Promise<PlanItem[]> {
  return db
    .selectDistinctOn([planItems.postId])
    .from(planItems)
    .where(and(eq(planItems.runId, runId), ne(planItems.status, "replaced")))
    .orderBy(planItems.postId, desc(planItems.version));
}

// Everything the planner reads (orientation Q10, the seam for session B): the run, its slots, the project's pillars
// and categories, every covered topic, the site's pages, and search insights (always empty in session A).
export async function plannerContext(runId: string, db: Database = getDb()) {
  const run = await getRunRow(db, runId);
  const slots = await plannableSlots(db, runId);
  const slotIds = slots.map((slot) => slot.id);
  const pillars = await db.select().from(projectPillars).where(eq(projectPillars.projectId, run.projectId)).orderBy(asc(projectPillars.position));
  const coveredRows = await db
    .select({ topic: posts.topic })
    .from(posts)
    .where(and(eq(posts.projectId, run.projectId), isNotNull(posts.topic), slotIds.length ? notInArray(posts.id, slotIds) : undefined))
    .orderBy(asc(posts.slotDate));
  const pages = await listSitePages(run.projectId, db);
  return {
    run,
    slots: slots.map((post, index) => ({ slot: index + 1, postId: post.id, date: post.slotDate })),
    pillars,
    categories: await categoryLabels(run.projectId, db),
    covered: [...new Set(coveredRows.map((row) => row.topic!))],
    pages: pages.map((page) => ({ path: page.path, title: page.title })),
    insights: [] as string[],
  };
}

// ---- Requests (from the Run plan tab) ----

function cleanNote(note: unknown): string | null {
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > NOTE_MAX) throw new PlanError("Keep the note under 2,000 characters.");
  return text || null;
}

async function busy(db: Database, runId: string): Promise<boolean> {
  const [row] = await db.select({ id: planDrafts.id }).from(planDrafts).where(and(eq(planDrafts.runId, runId), eq(planDrafts.status, "drafting"))).limit(1);
  return Boolean(row);
}

// A note from Amir is kept as plan feedback, so the learning loop can read it (orientation Q5).
async function keepNote(db: Database, run: Run, note: string | null, item: PlanItem | null): Promise<string | null> {
  if (!note) return null;
  const [row] = await db
    .insert(planFeedback)
    .values({ runId: run.id, planItemId: item?.id ?? null, postId: item?.postId ?? null, kind: "note", name: "Amir", body: note })
    .returning({ id: planFeedback.id });
  return row.id;
}

export type PlanRequest = { planDraftId: string; noteFeedbackId: string | null };

export async function requestPlan(runId: string, input: { note?: unknown } = {}, db: Database = getDb()): Promise<PlanRequest> {
  const run = await getRunRow(db, runId);
  if (run.imported) throw new PlanError(`${run.name} was made from the Phase 1 slots, so it has no plan.`);
  if (run.status === "active") throw new PlanError("This run is active. Change its posts one by one.");
  if (await busy(db, runId)) throw new PlanError("The plan is being drafted. Wait for it to finish.");
  if ((await plannableSlots(db, runId)).length === 0) throw new PlanError("This run has no empty SEO slots to plan.");
  const note = cleanNote(input.note);
  const noteFeedbackId = await keepNote(db, run, note, null);
  const [draft] = await db.insert(planDrafts).values({ runId, scope: "plan", note }).returning({ id: planDrafts.id });
  await db.update(runs).set({ status: "planning", planApprovedAt: null, updatedAt: sql`now()` }).where(eq(runs.id, runId));
  return { planDraftId: draft.id, noteFeedbackId };
}

export async function requestItem(runId: string, postId: string, input: { note?: unknown } = {}, db: Database = getDb()): Promise<PlanRequest> {
  const run = await getRunRow(db, runId);
  if (run.status === "active") throw new PlanError("This run is active. Change its posts one by one.");
  if (await busy(db, runId)) throw new PlanError("The plan is being drafted. Wait for it to finish.");
  const item = (await currentItems(db, runId)).find((row) => row.postId === postId);
  if (!item) throw new PlanError("This slot has no planned post yet. Plan the run first.");
  const note = cleanNote(input.note);
  const noteFeedbackId = await keepNote(db, run, note, item);
  const [draft] = await db.insert(planDrafts).values({ runId, scope: "item", postId, note }).returning({ id: planDrafts.id });
  await db.update(runs).set({ status: "planning", planApprovedAt: null, updatedAt: sql`now()` }).where(eq(runs.id, runId));
  return { planDraftId: draft.id, noteFeedbackId };
}

export async function setPlanDraftRun(planDraftId: string, triggerRunId: string, db: Database = getDb()): Promise<void> {
  await db.update(planDrafts).set({ triggerRunId, updatedAt: sql`now()` }).where(eq(planDrafts.id, planDraftId));
}

export async function failPlanDraft(planDraftId: string, error: unknown, db: Database = getDb()): Promise<void> {
  await db
    .update(planDrafts)
    .set({ status: "failed", error: failureMessage(error).slice(0, 1000), updatedAt: sql`now()` })
    .where(and(eq(planDrafts.id, planDraftId), eq(planDrafts.status, "drafting")));
}

// ---- The draft-plan task ----

function matchLabel(value: string, labels: readonly string[]): string | null {
  const wanted = value.trim().toLowerCase();
  return labels.find((label) => label.toLowerCase() === wanted) ?? null;
}

// Runs in the draft-plan task. A draft that is no longer drafting has already run, so a retry never pays twice.
export async function draftPlan(planDraftId: string, deps: PlannerDeps): Promise<number> {
  const { db } = deps;
  const [draft] = await db.select().from(planDrafts).where(eq(planDrafts.id, planDraftId));
  if (!draft || draft.status !== "drafting") return 0;
  const context = await plannerContext(draft.runId, db);
  const { run } = context;
  const existing = await currentItems(db, run.id);
  const bySlot = new Map(context.slots.map((slot) => [slot.slot, slot]));
  const slotOf = new Map(context.slots.map((slot) => [slot.postId, slot.slot]));
  const pillarLabels = context.pillars.map((pillar) => pillar.label);
  const shown = existing
    .filter((item) => slotOf.has(item.postId))
    .map((item) => ({
      slot: slotOf.get(item.postId)!,
      title: item.title,
      excerpt: item.excerpt,
      pillar: context.pillars.find((pillar) => pillar.id === item.pillarId)?.label ?? null,
      category: item.category,
    }))
    .sort((a, b) => a.slot - b.slot);
  const itemSlot = draft.scope === "item" ? (slotOf.get(draft.postId!) ?? null) : null;
  if (draft.scope === "item" && itemSlot === null) throw new ModelOutputError("That slot is no longer in the plan.");
  const pack = await loadPack(run.projectId, db);

  const { value, call } = await new AiClient(db, deps.transport).parsed(
    {
      purpose: "plan",
      model: run.writerModel,
      promptVersion: plannerPrompt.PROMPT_VERSION,
      effort: PLAN_EFFORT,
      maxTokens: PLAN_MAX_TOKENS,
      pack: pack.text,
      instructions: withChannelRules(plannerPrompt.INSTRUCTIONS, channelRules(pack, "blog")),
      user: plannerPrompt.plannerUserMessage({
        runName: run.name,
        startsOn: run.startsOn,
        endsOn: run.endsOn,
        priorityNotes: run.priorityNotes,
        slots: context.slots.map((slot) => ({ slot: slot.slot, date: longDate(slot.date) })),
        pillars: pillarLabels,
        categories: context.categories,
        covered: context.covered,
        pages: context.pages,
        insights: context.insights,
        redo: draft.scope === "item" ? { note: draft.note, slot: itemSlot, current: shown } : draft.note || shown.length ? { note: draft.note, slot: null, current: shown } : null,
      }),
      keepUnreadable: true,
    },
    plannerPrompt.PlanReply,
  );

  // One item per slot asked for; anything else in the reply is ignored.
  const wanted = draft.scope === "item" ? new Set([itemSlot!]) : new Set(context.slots.map((slot) => slot.slot));
  const replies = new Map<number, plannerPrompt.PlanReply["items"][number]>();
  for (const item of value.items) if (wanted.has(item.slot) && !replies.has(item.slot) && item.title.trim()) replies.set(item.slot, item);
  if (replies.size === 0) throw new ModelOutputError(`${run.writerModel} returned no planned posts.`);

  const covered = [...context.covered, ...context.pages.map((page) => page.title)];
  return db.transaction(async (tx) => {
    const [still] = await tx.update(planDrafts).set({ status: "done", aiCallId: call.id, updatedAt: sql`now()` }).where(and(eq(planDrafts.id, planDraftId), eq(planDrafts.status, "drafting"))).returning({ id: planDrafts.id });
    if (!still) return 0;
    const titles = new Map(shown.map((item) => [item.slot, item.title]));
    for (const [slot, reply] of replies) titles.set(slot, reply.title.trim());
    let saved = 0;
    for (const [slot, reply] of [...replies].sort((a, b) => a[0] - b[0])) {
      const postId = bySlot.get(slot)!.postId;
      const [{ version }] = await tx.select({ version: sql<number>`coalesce(max(${planItems.version}), 0)::int` }).from(planItems).where(eq(planItems.postId, postId));
      await tx.update(planItems).set({ status: "replaced" }).where(and(eq(planItems.postId, postId), ne(planItems.status, "replaced")));
      const title = reply.title.replace(/\s+/g, " ").trim();
      const siblings = [...titles].filter(([other]) => other !== slot).map(([, other]) => other);
      const pillar = matchLabel(reply.pillar, pillarLabels);
      await tx.insert(planItems).values({
        runId: run.id,
        postId,
        draftId: planDraftId,
        version: version + 1,
        title,
        excerpt: plannerPrompt.fitExcerpt(reply.excerpt),
        pillarId: pillar ? context.pillars.find((row) => row.label === pillar)!.id : null,
        category: matchLabel(reply.category, context.categories) ?? OTHER_CATEGORY,
        reason: reply.reason.replace(/\s+/g, " ").trim(),
        closeTo: closeTo(title, [...covered, ...siblings]),
      });
      saved++;
    }
    return saved;
  });
}

// ---- Approval and activation ----

// Approve plan: every slot needs an item. Each title becomes its post's topic and the excerpt its planned excerpt.
export async function approvePlan(runId: string, db: Database = getDb()): Promise<number> {
  const run = await getRunRow(db, runId);
  if (run.status === "active") throw new PlanError("This run is already active.");
  if (await busy(db, runId)) throw new PlanError("The plan is being drafted. Wait for it to finish.");
  const slots = await plannableSlots(db, runId);
  const items = await currentItems(db, runId);
  const missing = slots.filter((slot) => !items.some((item) => item.postId === slot.id));
  if (slots.length === 0 || missing.length > 0) throw new PlanError(`Plan every slot first: ${missing.length || "no"} ${missing.length === 1 ? "slot has" : "slots have"} no planned post.`);
  return db.transaction(async (tx) => {
    for (const item of items.filter((row) => slots.some((slot) => slot.id === row.postId))) {
      await tx.update(planItems).set({ status: "approved" }).where(eq(planItems.id, item.id));
      await tx
        .update(posts)
        .set({
          topic: item.title,
          plannedExcerpt: item.excerpt,
          pillarId: item.pillarId,
          status: "topic_set",
          topicSetAt: sql`coalesce(${posts.topicSetAt}, now())`,
          statusChangedAt: sql`case when ${posts.status} = 'topic_set' then ${posts.statusChangedAt} else now() end`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(posts.id, item.postId), inArray(posts.status, ["planned", "topic_set"])));
    }
    await tx.update(runs).set({ status: "plan_approved", planApprovedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(runs.id, runId));
    return items.length;
  });
}

// Activate run (orientation smaller decisions): needs an approved plan, never the client's approval. From A4 the run is
// generated on its schedule, starting today (orientation Q7).
export async function activateRun(runId: string, db: Database = getDb(), options: { today?: string } = {}): Promise<Run> {
  const run = await getRunRow(db, runId);
  if (run.status === "active") throw new PlanError("This run is already active.");
  if (run.status !== "plan_approved") throw new PlanError("Approve the plan first.");
  const [row] = await db
    .update(runs)
    .set({ status: "active", activatedAt: sql`now()`, autoGenerate: !run.imported, nextGenerationOn: run.imported ? null : (options.today ?? londonToday()), updatedAt: sql`now()` })
    .where(and(eq(runs.id, runId), eq(runs.status, "plan_approved")))
    .returning();
  if (!row) throw new PlanError("Approve the plan first.");
  return row;
}

// ---- The Run plan tab ----

export type PlanView = {
  items: Map<string, PlanItem>;
  drafting: boolean;
  failed: string | null;
  pillars: Map<string, string>;
};

export async function planView(runId: string, db: Database = getDb()): Promise<PlanView> {
  const run = await getRunRow(db, runId);
  const items = await currentItems(db, runId);
  const [latest] = await db.select().from(planDrafts).where(eq(planDrafts.runId, runId)).orderBy(desc(planDrafts.createdAt)).limit(1);
  const pillars = await db.select({ id: projectPillars.id, label: projectPillars.label }).from(projectPillars).where(eq(projectPillars.projectId, run.projectId));
  return {
    items: new Map(items.map((item) => [item.postId, item])),
    drafting: latest?.status === "drafting",
    failed: latest?.status === "failed" ? latest.error : null,
    pillars: new Map(pillars.map((pillar) => [pillar.id, pillar.label])),
  };
}
