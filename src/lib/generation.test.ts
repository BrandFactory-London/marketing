import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { aiCalls, batches, criticVerdicts, postDrafts, postGenerations, posts, postSpecs } from "@/db/schema";
import { createClient } from "./clients";
import { createProject } from "./projects";
import { saveKnowledge } from "./knowledge";
import { ModelRefusal, type Transport } from "./ai/client";
import * as criticPrompt from "@/prompts/critic";
import * as specPrompt from "@/prompts/spec";
import { draftSpec, failGeneration, failSpec, isRetryable, runGeneration } from "./generation";

// A fake Anthropic API: each role answers from its own queue, so a test scripts the whole run.
type Answer = string | Error | { stop: "refusal" };
function fakeApi(script: { spec?: Answer[]; writer?: Answer[]; critic?: Answer[] }) {
  const queues = { spec: [...(script.spec ?? [])], writer: [...(script.writer ?? [])], critic: [...(script.critic ?? [])] };
  const calls: { role: keyof typeof queues; params: MessageCreateParamsNonStreaming }[] = [];
  const transport: Transport = async (params) => {
    const instructions = (params.system as { text: string }[])[1].text;
    const role = instructions === specPrompt.INSTRUCTIONS ? "spec" : instructions === criticPrompt.INSTRUCTIONS ? "critic" : "writer";
    calls.push({ role, params });
    const answer = queues[role].shift();
    if (answer === undefined) throw new Error(`No scripted ${role} answer left.`);
    if (answer instanceof Error) throw answer;
    const stop = typeof answer === "object" ? answer.stop : "end_turn";
    const text = typeof answer === "string" ? answer : "";
    const message = {
      id: "msg",
      type: "message",
      role: "assistant",
      model: params.model,
      content: [{ type: "text", text, citations: null }],
      stop_reason: stop,
      stop_sequence: null,
      usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as unknown as Message;
    return { message, requestId: `req_${calls.length}` };
  };
  return { transport, calls, queues };
}

const GOOD = "# Wet room or shower tray?\n\nExcerpt: A short guide.\n\nA wet room suits small rooms well. " + "Plain words here. ".repeat(10) + "\n\n## Book a consultation\n\n[Contact us](/contact).";
const DASHED = GOOD.replace("suits small rooms", "suits small rooms \u2014 often");
const PASS = JSON.stringify({ summary: "Good.", issues: [], placeholders: [], scores: { voice: 8, usefulness: 8, specificity: 8 } });
const FAIL = JSON.stringify({
  summary: "Invented process.",
  issues: [{ quote: "suits small rooms", category: "facts", note: "Not in the pack.", severity: "blocking" }],
  placeholders: [],
  scores: { voice: 6, usefulness: 7, specificity: 6 },
});
const SPEC = JSON.stringify({
  keyword: "wet room or shower tray",
  postType: "comparison",
  location: "Chigwell",
  angle: "Answer the question first.",
  outline: ["What each one is", "Book a consultation"],
  facts: ["Bathrooms take two to six weeks on site."],
  links: ["/contact"],
  faq: true,
});

describe("retrying", () => {
  it("retries overload and server errors, never a refusal or a bad request", () => {
    expect(isRetryable(new Error("socket hang up"))).toBe(true);
    expect(isRetryable(Anthropic.APIError.generate(529, undefined, "Overloaded", new Headers()))).toBe(true);
    expect(isRetryable(Anthropic.APIError.generate(429, undefined, "Rate limited", new Headers()))).toBe(true);
    expect(isRetryable(Anthropic.APIError.generate(400, undefined, "Bad request", new Headers()))).toBe(false);
    expect(isRetryable(Anthropic.APIError.generate(401, undefined, "No key", new Headers()))).toBe(false);
    expect(isRetryable(new ModelRefusal("claude-opus-5-5"))).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("generation (local Postgres)", () => {
  const { db, close } = createTestDb();
  afterAll(close);
  let ids: { post: string; batch: string; spec: string; generation: string };

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss website", siteUrl: "https://www.migss.co.uk", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    await saveKnowledge({ tier: "agency" }, { writing_rules: "Never use em dashes.", banned_phrases: '- "elevate"' }, db);
    await saveKnowledge({ tier: "project", projectId: project.id }, { allowed_links: "/contact\n/renovation-services/bathroom" }, db);
    const [batch] = await db
      .insert(batches)
      .values({
        projectId: project.id,
        name: "November",
        lengthMin: 20,
        lengthMax: 200,
        cta: "Book a free design consultation",
        faqMode: "never",
        writerModel: "claude-opus-5-5",
        criticModel: "claude-sonnet-5-5",
        derivativeModel: "claude-opus-5-5",
      })
      .returning();
    const [post] = await db
      .insert(posts)
      .values({ projectId: project.id, status: "spec_confirmed", slotDate: "2026-11-03", topic: "Wet room or shower tray?", batchId: batch.id })
      .returning();
    const [spec] = await db
      .insert(postSpecs)
      .values({
        postId: post.id,
        batchId: batch.id,
        version: 1,
        status: "confirmed",
        keyword: "wet room or shower tray",
        postType: "comparison",
        angle: "Answer first.",
        outline: ["What each one is"],
        facts: [],
        links: ["/contact"],
        lengthMin: 20,
        lengthMax: 200,
        cta: batch.cta,
        faq: false,
      })
      .returning();
    const [generation] = await db.insert(postGenerations).values({ postId: post.id, specId: spec.id, batchId: batch.id }).returning();
    ids = { post: post.id, batch: batch.id, spec: spec.id, generation: generation.id };
  });

  const generation = async () => (await db.select().from(postGenerations).where(eq(postGenerations.id, ids.generation)))[0];
  const post = async () => (await db.select().from(posts).where(eq(posts.id, ids.post)))[0];
  const drafts = () => db.select().from(postDrafts).where(eq(postDrafts.generationId, ids.generation)).orderBy(asc(postDrafts.round));

  it("passes first time: one writer call, one critic call, Needs review", async () => {
    const api = fakeApi({ writer: [GOOD], critic: [PASS] });
    expect(await runGeneration(ids.generation, { db, transport: api.transport })).toBe("in_review");
    expect(api.calls.map((call) => call.role)).toEqual(["writer", "critic"]);
    expect(api.calls[1].params.model).toBe("claude-sonnet-5-5");
    expect(await generation()).toMatchObject({ status: "in_review", round: 1, error: null });
    expect(await post()).toMatchObject({ status: "in_review", generationStep: null });
    const [draft] = await drafts();
    expect(draft).toMatchObject({ round: 1, title: "Wet room or shower tray?", excerpt: "A short guide.", checksPassed: true });
    expect((await generation()).agencyVersionId).not.toBeNull();
    expect(await db.select().from(aiCalls)).toHaveLength(2);
  });

  it("sends a draft that fails a scripted check back to the writer without the critic", async () => {
    const api = fakeApi({ writer: [DASHED, GOOD], critic: [PASS] });
    expect(await runGeneration(ids.generation, { db, transport: api.transport })).toBe("in_review");
    expect(api.calls.map((call) => call.role)).toEqual(["writer", "writer", "critic"]);
    const fixRequest = api.calls[1].params.messages[0].content as string;
    expect(fixRequest).toContain("Uses an em dash.");
    expect((await drafts()).map((draft) => draft.checksPassed)).toEqual([false, true]);
  });

  it("gives the writer the critic's issues on a fix round", async () => {
    const api = fakeApi({ writer: [GOOD, GOOD], critic: [FAIL, PASS] });
    expect(await runGeneration(ids.generation, { db, transport: api.transport })).toBe("in_review");
    expect(api.calls[2].params.messages[0].content).toContain("[facts] Not in the pack.");
    expect((await generation()).round).toBe(2);
  });

  it("flags the post after two failed fix rounds", async () => {
    const api = fakeApi({ writer: [GOOD, GOOD, GOOD], critic: [FAIL, FAIL, FAIL] });
    expect(await runGeneration(ids.generation, { db, transport: api.transport })).toBe("flagged");
    expect(api.calls.map((call) => call.role)).toEqual(["writer", "critic", "writer", "critic", "writer", "critic"]);
    expect(await generation()).toMatchObject({ status: "flagged", round: 3 });
    expect(await post()).toMatchObject({ status: "flagged", generationStep: null });
    expect(await db.select().from(criticVerdicts)).toHaveLength(3);
  });

  it("flags the post when the third draft still fails the checks", async () => {
    const api = fakeApi({ writer: [DASHED, DASHED, DASHED] });
    expect(await runGeneration(ids.generation, { db, transport: api.transport })).toBe("flagged");
    expect(api.calls).toHaveLength(3);
  });

  it("resumes after each step without repeating a saved call", async () => {
    // Writer saved, then the critic call dies.
    const first = fakeApi({ writer: [GOOD], critic: [new Error("socket hang up")] });
    await expect(runGeneration(ids.generation, { db, transport: first.transport })).rejects.toThrow("socket hang up");
    expect(await post()).toMatchObject({ status: "generating", generationStep: "critic" });
    // The critic fails the draft, then the fix-round writer call dies.
    const second = fakeApi({ critic: [FAIL], writer: [new Error("Overloaded")] });
    await expect(runGeneration(ids.generation, { db, transport: second.transport })).rejects.toThrow("Overloaded");
    expect(second.calls.map((call) => call.role)).toEqual(["critic", "writer"]);
    // The last attempt finishes from round 2.
    const third = fakeApi({ writer: [GOOD], critic: [PASS] });
    expect(await runGeneration(ids.generation, { db, transport: third.transport })).toBe("in_review");
    expect(third.calls.map((call) => call.role)).toEqual(["writer", "critic"]);
    expect((await drafts()).map((draft) => draft.round)).toEqual([1, 2]);
    // A finished generation never calls the API again.
    const fourth = fakeApi({});
    expect(await runGeneration(ids.generation, { db, transport: fourth.transport })).toBe("already_finished");
    expect(fourth.calls).toHaveLength(0);
  });

  it("puts a post that could not finish back to Spec ready with the error", async () => {
    const api = fakeApi({ writer: [{ stop: "refusal" }] });
    const error = await runGeneration(ids.generation, { db, transport: api.transport }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModelRefusal);
    expect(isRetryable(error)).toBe(false);
    await failGeneration(ids.generation, error, db);
    expect(await generation()).toMatchObject({
      status: "failed",
      error: "claude-opus-5-5 declined to write this. Retry the post, or choose another model for the batch.",
    });
    expect((await generation()).finishedAt).not.toBeNull();
    expect(await post()).toMatchObject({ status: "spec_confirmed", generationStep: null });
    // A finished generation is not failed twice.
    await failGeneration(ids.generation, new Error("later"), db);
    expect((await generation()).error).toContain("declined");
  });

  describe("specs", () => {
    beforeEach(async () => {
      await db.update(posts).set({ status: "topic_set" }).where(eq(posts.id, ids.post));
      await db.delete(postGenerations);
      await db.delete(postSpecs);
    });

    async function drafting(version = 1, redraftNote: string | null = null) {
      const [row] = await db
        .insert(postSpecs)
        .values({ postId: ids.post, batchId: ids.batch, version, status: "drafting", lengthMin: 700, lengthMax: 900, cta: "Book", redraftNote })
        .returning();
      return row.id;
    }
    const spec = async (id: string) => (await db.select().from(postSpecs).where(eq(postSpecs.id, id)))[0];

    it("drafts a spec with the writer model, at medium effort, and applies the batch's FAQ rule", async () => {
      const id = await drafting();
      const api = fakeApi({ spec: [SPEC] });
      await draftSpec(id, { db, transport: api.transport });
      expect(api.calls[0].params).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "medium" } });
      expect(await spec(id)).toMatchObject({ status: "proposed", keyword: "wet room or shower tray", links: ["/contact"], faq: false });
      expect((await spec(id)).aiCallId).not.toBeNull();
      await draftSpec(id, { db, transport: fakeApi({}).transport });
    });

    it("sends a redraft the note and the spec Amir saw", async () => {
      const first = await drafting(1);
      await draftSpec(first, { db, transport: fakeApi({ spec: [SPEC] }).transport });
      const second = await drafting(2, "Focus on Loughton.");
      const api = fakeApi({ spec: [SPEC] });
      await draftSpec(second, { db, transport: api.transport });
      const message = api.calls[0].params.messages[0].content as string;
      expect(message).toContain("His note: Focus on Loughton.");
      expect(message).toContain('"keyword": "wet room or shower tray"');
    });

    it("fails a spec with a clear message", async () => {
      const id = await drafting();
      const error = await draftSpec(id, { db, transport: fakeApi({ spec: ['{"keyword": 1}'] }).transport }).catch((caught: unknown) => caught);
      await failSpec(id, error, db);
      expect(await spec(id)).toMatchObject({ status: "failed", error: "claude-opus-5-5 returned a reply in the wrong shape." });
    });
  });
});
