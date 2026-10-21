import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type Database, type Executor } from "@/db/client";
import { aiCalls, batches, postGenerations, posts, postSpecs, projectPillars } from "@/db/schema";
import { isModelId, type ModelId } from "@/config/models";
import type { FaqMode } from "@/prompts/spec";
import { getModelSettings } from "./settings";
import { isUuid, optionalText, type FieldErrors, type FormInput, type Parsed } from "./validation";

// Batches, specs and the start of generation (γ4 orientation Q3, Q4). A batch belongs to one project and
// holds posts that already have a topic. Each post gets spec version 1 in drafting; the draft-spec task
// fills it in, Amir edits or confirms it, and only then can the batch generate.

export type Batch = typeof batches.$inferSelect;
export type Spec = typeof postSpecs.$inferSelect;
export type Generation = typeof postGenerations.$inferSelect;

export const FAQ_MODES: readonly { value: FaqMode; label: string }[] = [
  { value: "useful", label: "Only where useful" },
  { value: "always", label: "Always" },
  { value: "never", label: "Never" },
];

export const LENGTH_LIMITS = { min: 300, max: 4000 } as const;
export const DEFAULT_LENGTH = { min: 1200, max: 1600 } as const;
export const MAX_POSTS_PER_BATCH = 12;
export const NOTES_MAX = 2000;

export type BatchInput = {
  name: string;
  lengthMin: number;
  lengthMax: number;
  cta: string;
  faqMode: FaqMode;
  defaultPillarId: string | null;
  notes: string | null;
  writerModel: ModelId;
  criticModel: ModelId;
  posts: { id: string; pillarId: string | null; note: string | null }[];
};
export type BatchField = "name" | "length" | "cta" | "faqMode" | "defaultPillarId" | "notes" | "writerModel" | "criticModel" | "posts";

function integer(value: unknown): number | null {
  const text = optionalText(value);
  if (!text || !/^\d+$/.test(text)) return null;
  return Number(text);
}

function isFaqMode(value: unknown): value is FaqMode {
  return FAQ_MODES.some((mode) => mode.value === value);
}

// postIds come from the checkboxes; each post's pillar and note are named after its id.
export function parseBatchInput(input: FormInput, postIds: readonly string[]): Parsed<BatchInput, BatchField> {
  const errors: FieldErrors<BatchField> = {};
  const name = optionalText(input.name);
  if (!name) errors.name = "Enter a batch name.";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters.";
  const lengthMin = integer(input.lengthMin);
  const lengthMax = integer(input.lengthMax);
  if (lengthMin === null || lengthMax === null) errors.length = "Enter the length as two whole numbers of words.";
  else if (lengthMin < LENGTH_LIMITS.min || lengthMax > LENGTH_LIMITS.max) {
    errors.length = `Keep the length between ${LENGTH_LIMITS.min} and ${LENGTH_LIMITS.max} words.`;
  } else if (lengthMax < lengthMin) errors.length = "The second number must be at least the first.";
  const cta = optionalText(input.cta);
  if (!cta) errors.cta = "Enter the call to action.";
  else if (cta.length > 300) errors.cta = "Keep the call to action under 300 characters.";
  if (!isFaqMode(input.faqMode)) errors.faqMode = "Choose when to include an FAQ.";
  const defaultPillarId = optionalText(input.defaultPillarId);
  if (defaultPillarId && !isUuid(defaultPillarId)) errors.defaultPillarId = "Choose a pillar.";
  const notes = optionalText(input.notes);
  if (notes && notes.length > NOTES_MAX) errors.notes = `Keep the notes under ${NOTES_MAX} characters.`;
  if (!isModelId(input.writerModel)) errors.writerModel = "Choose a writer model.";
  if (!isModelId(input.criticModel)) errors.criticModel = "Choose a critic model.";
  const ids = [...new Set(postIds)].filter(isUuid);
  if (ids.length === 0) errors.posts = "Choose at least one post.";
  else if (ids.length > MAX_POSTS_PER_BATCH) errors.posts = `Choose at most ${MAX_POSTS_PER_BATCH} posts for one batch.`;
  const chosen = ids.map((id) => {
    const pillar = optionalText(input[`pillar_${id}`]);
    const note = optionalText(input[`note_${id}`]);
    if (note && note.length > NOTES_MAX) errors.posts = `Keep each post's note under ${NOTES_MAX} characters.`;
    return { id, pillarId: pillar && isUuid(pillar) ? pillar : null, note };
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: name!,
      lengthMin: lengthMin!,
      lengthMax: lengthMax!,
      cta: cta!,
      faqMode: input.faqMode as FaqMode,
      defaultPillarId: defaultPillarId ?? null,
      notes: notes ?? null,
      writerModel: input.writerModel as ModelId,
      criticModel: input.criticModel as ModelId,
      posts: chosen,
    },
  };
}

// The project's call to action, prefilled into the form: the first line of its CTA section.
export function defaultCta(section: string | undefined): string {
  return (section ?? "").split("\n").map((line) => line.replace(/^\s*[-*]\s+/, "").trim()).find(Boolean) ?? "";
}

// Posts with a topic that are not in a batch yet, by date.
export async function listBatchableSlots(projectId: string, db: Database = getDb()) {
  if (!isUuid(projectId)) return [];
  return db
    .select({ id: posts.id, slotDate: posts.slotDate, topic: posts.topic, pillarId: posts.pillarId })
    .from(posts)
    .where(and(eq(posts.projectId, projectId), eq(posts.status, "topic_set"), isNull(posts.batchId)))
    .orderBy(asc(posts.slotDate), asc(posts.createdAt));
}

export class BatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchError";
  }
}

function joinNotes(batchNote: string | null, postNote: string | null): string | null {
  return [batchNote, postNote].filter(Boolean).join("\n\n") || null;
}

// Creates the batch and a drafting spec for each post, in one transaction. Returns the spec ids to start.
export async function createBatch(projectId: string, value: BatchInput, db: Database = getDb()): Promise<{ batch: Batch; specIds: string[] }> {
  const settings = await getModelSettings(db);
  const pillarIds = [value.defaultPillarId, ...value.posts.map((post) => post.pillarId)].filter((id): id is string => Boolean(id));
  return db.transaction(async (tx) => {
    if (pillarIds.length > 0) {
      const found = await tx
        .select({ id: projectPillars.id })
        .from(projectPillars)
        .where(and(eq(projectPillars.projectId, projectId), inArray(projectPillars.id, pillarIds)));
      if (found.length !== new Set(pillarIds).size) throw new BatchError("A chosen pillar no longer exists. Reload the page and try again.");
    }
    const [batch] = await tx
      .insert(batches)
      .values({
        projectId,
        name: value.name,
        lengthMin: value.lengthMin,
        lengthMax: value.lengthMax,
        cta: value.cta,
        faqMode: value.faqMode,
        defaultPillarId: value.defaultPillarId,
        notes: value.notes,
        writerModel: value.writerModel,
        criticModel: value.criticModel,
        derivativeModel: settings.derivativeModel,
      })
      .returning();
    const specIds: string[] = [];
    for (const chosen of value.posts) {
      const [post] = await tx
        .update(posts)
        .set({ batchId: batch.id, pillarId: chosen.pillarId ?? value.defaultPillarId, updatedAt: sql`now()` })
        .where(and(eq(posts.id, chosen.id), eq(posts.projectId, projectId), eq(posts.status, "topic_set"), isNull(posts.batchId)))
        .returning({ id: posts.id });
      if (!post) throw new BatchError("A chosen post is no longer free to write. Reload the page and choose again.");
      const [spec] = await tx
        .insert(postSpecs)
        .values({
          postId: post.id,
          batchId: batch.id,
          version: 1,
          status: "drafting",
          lengthMin: value.lengthMin,
          lengthMax: value.lengthMax,
          cta: value.cta,
          notes: joinNotes(value.notes, chosen.note),
        })
        .returning({ id: postSpecs.id });
      specIds.push(spec.id);
    }
    return { batch, specIds };
  });
}

export async function getBatch(batchId: string, db: Database = getDb()): Promise<Batch | null> {
  if (!isUuid(batchId)) return null;
  const [row] = await db.select().from(batches).where(eq(batches.id, batchId));
  return row ?? null;
}

export type BatchPost = {
  id: string;
  slotDate: string;
  topic: string | null;
  status: (typeof posts.$inferSelect)["status"];
  generationStep: (typeof posts.$inferSelect)["generationStep"];
  pillar: string | null;
  spec: Spec | null;
  generation: Generation | null;
  costUsd: number;
};

// Every post in the batch with its newest spec, newest generation and cost so far.
export async function listBatchPosts(batchId: string, db: Database = getDb()): Promise<BatchPost[]> {
  if (!isUuid(batchId)) return [];
  const rows = await db
    .select({
      id: posts.id,
      slotDate: posts.slotDate,
      topic: posts.topic,
      status: posts.status,
      generationStep: posts.generationStep,
      pillar: projectPillars.label,
    })
    .from(posts)
    .leftJoin(projectPillars, eq(projectPillars.id, posts.pillarId))
    .where(eq(posts.batchId, batchId))
    .orderBy(asc(posts.slotDate), asc(posts.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [specs, generations, costs] = await Promise.all([
    db.select().from(postSpecs).where(inArray(postSpecs.postId, ids)).orderBy(desc(postSpecs.version)),
    db.select().from(postGenerations).where(inArray(postGenerations.postId, ids)).orderBy(desc(postGenerations.createdAt)),
    db
      .select({ postId: aiCalls.postId, cost: sql<string>`sum(${aiCalls.costUsd})` })
      .from(aiCalls)
      .where(inArray(aiCalls.postId, ids))
      .groupBy(aiCalls.postId),
  ]);
  return rows.map((row) => ({
    ...row,
    spec: specs.find((spec) => spec.postId === row.id) ?? null,
    generation: generations.find((generation) => generation.postId === row.id) ?? null,
    costUsd: Number(costs.find((cost) => cost.postId === row.id)?.cost ?? 0),
  }));
}

export async function listProjectBatches(projectId: string, db: Database = getDb()): Promise<Batch[]> {
  if (!isUuid(projectId)) return [];
  return db.select().from(batches).where(eq(batches.projectId, projectId)).orderBy(desc(batches.createdAt));
}

// ---- Editing, confirming and redrafting specs ----

export type SpecEdit = {
  keyword: string;
  postType: string;
  location: string | null;
  angle: string;
  outline: string[];
  facts: string[];
  links: string[];
  faq: boolean;
};
export type SpecField = keyof SpecEdit;

function lines(value: unknown): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

export function parseSpecEdit(input: FormInput): Parsed<SpecEdit, SpecField> {
  const errors: FieldErrors<SpecField> = {};
  const keyword = optionalText(input.keyword);
  const postType = optionalText(input.postType);
  const angle = optionalText(input.angle);
  const outline = lines(input.outline);
  const links = lines(input.links);
  if (!keyword) errors.keyword = "Enter the primary keyword.";
  if (!postType) errors.postType = "Enter the post type.";
  if (!angle) errors.angle = "Enter the angle.";
  if (outline.length === 0) errors.outline = "Enter at least one heading, one per line.";
  const badLink = links.find((link) => !link.startsWith("/"));
  if (badLink) errors.links = `Use paths such as /contact, one per line. "${badLink}" is not a path.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      keyword: keyword!,
      postType: postType!,
      location: optionalText(input.location),
      angle: angle!,
      outline,
      facts: lines(input.facts),
      links,
      faq: input.faq === "yes",
    },
  };
}

async function setPostStatus(db: Executor, postId: string, status: "topic_set" | "spec_confirmed" | "generating") {
  await db
    .update(posts)
    .set({
      status,
      generationStep: null,
      statusChangedAt: sql`case when ${posts.status} = ${status} then ${posts.statusChangedAt} else now() end`,
      updatedAt: sql`now()`,
    })
    .where(eq(posts.id, postId));
}

// Editing a confirmed spec puts it back to proposed, so nothing is written from a spec Amir has not confirmed.
export async function editSpec(specId: string, value: SpecEdit, db: Database = getDb()): Promise<Spec> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(postSpecs)
      .set({ ...value, status: "proposed", confirmedAt: null })
      .where(and(eq(postSpecs.id, specId), inArray(postSpecs.status, ["proposed", "confirmed"])))
      .returning();
    if (!row) throw new BatchError("This spec can no longer be edited.");
    await assertNotGenerating(tx, row.postId);
    await setPostStatus(tx, row.postId, "topic_set");
    return row;
  });
}

async function assertNotGenerating(db: Executor, postId: string) {
  const [post] = await db.select({ status: posts.status }).from(posts).where(eq(posts.id, postId));
  if (post && post.status !== "topic_set" && post.status !== "spec_confirmed") throw new BatchError("This post is already being written.");
}

export async function confirmSpecs(specIds: readonly string[], db: Database = getDb()): Promise<number> {
  const ids = specIds.filter(isUuid);
  if (ids.length === 0) return 0;
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(postSpecs)
      .set({ status: "confirmed", confirmedAt: sql`now()` })
      .where(and(inArray(postSpecs.id, ids), eq(postSpecs.status, "proposed")))
      .returning({ postId: postSpecs.postId });
    for (const row of rows) await setPostStatus(tx, row.postId, "spec_confirmed");
    return rows.length;
  });
}

export async function confirmAllSpecs(batchId: string, db: Database = getDb()): Promise<number> {
  const proposed = await db
    .select({ id: postSpecs.id })
    .from(postSpecs)
    .where(and(eq(postSpecs.batchId, batchId), eq(postSpecs.status, "proposed")));
  return confirmSpecs(
    proposed.map((row) => row.id),
    db,
  );
}

// A new spec version in drafting, carrying Amir's note. The old version is kept as superseded (or failed).
export async function redraftSpec(specId: string, note: string | null, db: Database = getDb()): Promise<string> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(postSpecs).where(eq(postSpecs.id, specId));
    if (!current || !["proposed", "confirmed", "failed"].includes(current.status)) throw new BatchError("This spec can no longer be redrafted.");
    const [newest] = await tx
      .select({ version: sql<number>`max(${postSpecs.version})` })
      .from(postSpecs)
      .where(eq(postSpecs.postId, current.postId));
    if (Number(newest.version) !== current.version) throw new BatchError("A newer version of this spec already exists.");
    await assertNotGenerating(tx, current.postId);
    if (current.status !== "failed") await tx.update(postSpecs).set({ status: "superseded" }).where(eq(postSpecs.id, specId));
    const [row] = await tx
      .insert(postSpecs)
      .values({
        postId: current.postId,
        batchId: current.batchId,
        version: current.version + 1,
        status: "drafting",
        lengthMin: current.lengthMin,
        lengthMax: current.lengthMax,
        cta: current.cta,
        notes: current.notes,
        redraftNote: note,
      })
      .returning({ id: postSpecs.id });
    await setPostStatus(tx, current.postId, "topic_set");
    return row.id;
  });
}

// ---- Starting generation ----

// One queued generation per post whose spec is confirmed and that is not already running. Returns their ids.
export async function queueGenerations(batchId: string, options: { postId?: string } = {}, db: Database = getDb()): Promise<string[]> {
  return db.transaction(async (tx) => {
    const ready = await tx
      .select({ postId: posts.id, specId: postSpecs.id })
      .from(posts)
      .innerJoin(postSpecs, and(eq(postSpecs.postId, posts.id), eq(postSpecs.status, "confirmed")))
      .where(and(eq(posts.batchId, batchId), eq(posts.status, "spec_confirmed"), options.postId ? eq(posts.id, options.postId) : undefined));
    const ids: string[] = [];
    for (const { postId, specId } of ready) {
      const [running] = await tx
        .select({ id: postGenerations.id })
        .from(postGenerations)
        .where(and(eq(postGenerations.postId, postId), inArray(postGenerations.status, ["queued", "running"])));
      if (running) continue;
      const [row] = await tx.insert(postGenerations).values({ postId, specId, batchId }).returning({ id: postGenerations.id });
      await setPostStatus(tx, postId, "generating");
      ids.push(row.id);
    }
    return ids;
  });
}

// When a run could not be started at all, the post goes straight back to Spec ready with the reason.
export async function markNotStarted(generationId: string, message: string, db: Database = getDb()): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(postGenerations)
      .set({ status: "failed", error: message, finishedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(postGenerations.id, generationId), eq(postGenerations.status, "queued")))
      .returning({ postId: postGenerations.postId });
    if (row) await setPostStatus(tx, row.postId, "spec_confirmed");
  });
}

export async function markSpecNotStarted(specId: string, message: string, db: Database = getDb()): Promise<void> {
  await db
    .update(postSpecs)
    .set({ status: "failed", error: message })
    .where(and(eq(postSpecs.id, specId), eq(postSpecs.status, "drafting")));
}
