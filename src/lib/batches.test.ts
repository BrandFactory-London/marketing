import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { postGenerations, posts, postSpecs } from "@/db/schema";
import { createClient } from "./clients";
import { createProject } from "./projects";
import { addPillar, parsePillarInput, slugify } from "./pillars";
import {
  confirmAllSpecs,
  createBatch,
  defaultCta,
  editSpec,
  listBatchableSlots,
  listBatchPosts,
  markNotStarted,
  parseBatchInput,
  parseSpecEdit,
  queueGenerations,
  redraftSpec,
  type BatchInput,
} from "./batches";

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";

const form = {
  name: "November SEO posts",
  lengthMin: "1800",
  lengthMax: "2500",
  cta: "Book a free design consultation",
  faqMode: "useful",
  defaultPillarId: "",
  notes: "",
  writerModel: "claude-opus-5-5",
  criticModel: "claude-sonnet-5-5",
};

describe("batch form", () => {
  it("reads a valid form with per-post pillars and notes", () => {
    const parsed = parseBatchInput({ ...form, [`pillar_${ID_A}`]: ID_B, [`note_${ID_A}`]: "Mention Loughton." }, [ID_A]);
    expect(parsed).toEqual({
      ok: true,
      value: expect.objectContaining({
        lengthMin: 1800,
        lengthMax: 2500,
        faqMode: "useful",
        notes: null,
        defaultPillarId: null,
        posts: [{ id: ID_A, pillarId: ID_B, note: "Mention Loughton." }],
      }),
    });
  });

  it("explains every mistake", () => {
    const parsed = parseBatchInput({ ...form, name: "", lengthMin: "900", lengthMax: "800", cta: "", faqMode: "sometimes", writerModel: "gpt" }, []);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual({
      name: "Enter a batch name.",
      length: "The second number must be at least the first.",
      cta: "Enter the call to action.",
      faqMode: "Choose when to include an FAQ.",
      writerModel: "Choose a writer model.",
      posts: "Choose at least one post.",
    });
    const tooLong = parseBatchInput({ ...form, lengthMin: "100", lengthMax: "9000" }, [ID_A]);
    expect(!tooLong.ok && tooLong.errors.length).toBe("Keep the length between 300 and 4000 words.");
  });

  it("prefills the call to action from the project's first CTA line", () => {
    expect(defaultCta("- Book a free design consultation at /contact.\n- Or call us.")).toBe("Book a free design consultation at /contact.");
    expect(defaultCta(undefined)).toBe("");
  });

  it("reads a spec edit, one item per line", () => {
    const parsed = parseSpecEdit({
      keyword: "wet room cost",
      postType: "cost guide",
      location: "",
      angle: "Lead with the range.",
      outline: "1. What it costs\n- What changes it\n\n",
      facts: "",
      links: "/contact",
      faq: "yes",
    });
    expect(parsed).toEqual({
      ok: true,
      value: { keyword: "wet room cost", postType: "cost guide", location: null, angle: "Lead with the range.", outline: ["What it costs", "What changes it"], facts: [], links: ["/contact"], faq: true },
    });
    const bad = parseSpecEdit({ keyword: "k", postType: "t", angle: "a", outline: "h", links: "https://example.com" });
    expect(!bad.ok && bad.errors.links).toBe('Use paths such as /contact, one per line. "https://example.com" is not a path.');
  });
});

describe("pillars", () => {
  it("derive the tag from the name and check it", () => {
    expect(slugify("Bathroom Renovation")).toBe("bathroom-renovation");
    expect(slugify("Kitchens & Bathrooms")).toBe("kitchens-and-bathrooms");
    expect(parsePillarInput({ label: "Kitchen Renovation", slug: "" })).toEqual({ ok: true, value: { label: "Kitchen Renovation", slug: "kitchen-renovation" } });
    expect(parsePillarInput({ label: "X", slug: "Bad Tag" })).toEqual({
      ok: false,
      errors: { slug: "Use lower-case letters, numbers and single hyphens, such as bathroom-renovation." },
    });
  });
});

describe.skipIf(!testDatabaseUrl)("batches (local Postgres)", () => {
  const { db, close } = createTestDb();
  afterAll(close);
  let projectId: string;
  let postIds: string[];

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss website", siteUrl: "https://www.migss.co.uk", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    projectId = project.id;
    const rows = await db
      .insert(posts)
      .values([
        { projectId, status: "topic_set", slotDate: "2026-11-03", topic: "Wet room or shower tray?" },
        { projectId, status: "topic_set", slotDate: "2026-11-10", topic: "Bathroom cost in Essex" },
        { projectId, status: "planned", slotDate: "2026-11-17" },
      ])
      .returning({ id: posts.id });
    postIds = rows.map((row) => row.id);
  });

  async function batch(pillar?: string): Promise<{ batchId: string; specIds: string[] }> {
    const value: BatchInput = {
      name: "November",
      lengthMin: 700,
      lengthMax: 900,
      cta: "Book",
      faqMode: "never",
      defaultPillarId: pillar ?? null,
      notes: "Keep it practical.",
      writerModel: "claude-opus-5-5",
      criticModel: "claude-opus-5-5",
      posts: [
        { id: postIds[0], pillarId: null, note: "Mention Chigwell." },
        { id: postIds[1], pillarId: null, note: null },
      ],
    };
    const { batch: row, specIds } = await createBatch(projectId, value, db);
    return { batchId: row.id, specIds };
  }

  async function propose(specIds: string[]) {
    await db
      .update(postSpecs)
      .set({ status: "proposed", keyword: "k", postType: "guide", angle: "a", outline: ["h"], facts: [], links: ["/contact"], faq: false })
      .where(eq(postSpecs.status, "drafting"));
    return specIds;
  }

  it("lists only posts with a topic that are not in a batch", async () => {
    expect((await listBatchableSlots(projectId, db)).map((slot) => slot.id)).toEqual(postIds.slice(0, 2));
    await batch();
    expect(await listBatchableSlots(projectId, db)).toEqual([]);
  });

  it("creates the batch with a drafting spec per post, notes joined and the default pillar applied", async () => {
    const pillar = await addPillar(projectId, { label: "Bathroom Renovation", slug: "bathroom-renovation" }, db);
    const { batchId, specIds } = await batch(pillar.id);
    expect(specIds).toHaveLength(2);
    const rows = await listBatchPosts(batchId, db);
    expect(rows.map((row) => [row.pillar, row.spec?.status, row.spec?.notes])).toEqual([
      ["Bathroom Renovation", "drafting", "Keep it practical.\n\nMention Chigwell."],
      ["Bathroom Renovation", "drafting", "Keep it practical."],
    ]);
    await expect(batch()).rejects.toThrow("no longer free to write");
  });

  it("confirms, edits back to proposed, redrafts and queues one generation per post", async () => {
    const { batchId, specIds } = await batch();
    await propose(specIds);
    expect(await confirmAllSpecs(batchId, db)).toBe(2);
    expect((await listBatchPosts(batchId, db)).map((row) => row.status)).toEqual(["spec_confirmed", "spec_confirmed"]);

    await editSpec(specIds[0], { keyword: "new", postType: "guide", location: null, angle: "a", outline: ["h"], facts: [], links: [], faq: false }, db);
    let rows = await listBatchPosts(batchId, db);
    expect(rows.map((row) => [row.status, row.spec?.status])).toEqual([
      ["topic_set", "proposed"],
      ["spec_confirmed", "confirmed"],
    ]);

    const redrafted = await redraftSpec(specIds[0], "Focus on Loughton.", db);
    rows = await listBatchPosts(batchId, db);
    expect(rows[0].spec).toMatchObject({ id: redrafted, version: 2, status: "drafting", redraftNote: "Focus on Loughton." });
    await expect(redraftSpec(specIds[0], null, db)).rejects.toThrow("can no longer be redrafted");

    const queued = await queueGenerations(batchId, {}, db);
    expect(queued).toHaveLength(1);
    expect(await queueGenerations(batchId, {}, db)).toEqual([]);
    rows = await listBatchPosts(batchId, db);
    expect(rows[1]).toMatchObject({ status: "generating", generation: { status: "queued" } });
    await expect(redraftSpec(specIds[1], null, db)).rejects.toThrow("already being written");

    await markNotStarted(queued[0], "Trigger.dev could not be reached.", db);
    rows = await listBatchPosts(batchId, db);
    expect(rows[1]).toMatchObject({ status: "spec_confirmed", generation: { status: "failed", error: "Trigger.dev could not be reached." } });
    // Retry: a new generation row.
    expect(await queueGenerations(batchId, { postId: postIds[1] }, db)).toHaveLength(1);
    expect(await db.select().from(postGenerations)).toHaveLength(2);
  });
});
