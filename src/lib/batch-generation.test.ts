import type { MessageBatchIndividualResponse } from "@anthropic-ai/sdk/resources/messages/batches";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { aiCalls, batches, clients, derivatives, derivedSlots, generationBatches, postGenerations, posts, postSpecs, projects, runs } from "@/db/schema";
import { BATCH_DISCOUNT, callCost } from "@/config/models";
import * as criticPrompt from "@/prompts/critic";
import * as specPrompt from "@/prompts/spec";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { runInput } from "@/test/runs";
import type { BatchRequest, BatchTransport } from "./ai/batch";
import { saveKnowledge } from "./knowledge";
import { confirmAutoSpec, customIdFor, dueRuns, duePosts, prepareGenerateNow, pollRound, stalledBatches, startFortnight, submitRound } from "./batch-generation";
import { queueDerivedSlots } from "./derivatives";
import { generatesOn, isDue, nextAfter, windowEnd } from "./fortnight";
import { activateRun } from "./planner";
import { createRun } from "./runs";

describe("the fortnight (orientation Q7)", () => {
  it("covers posts up to 27 days ahead and moves on 14 days", () => {
    expect(windowEnd("2026-11-18")).toBe("2026-12-15");
    expect(nextAfter("2026-11-18")).toBe("2026-12-02");
  });

  it("names the generation day that covers each post, catching up a missed day", () => {
    expect(generatesOn("2026-12-10", "2026-11-18", "2026-11-18")).toBe("2026-11-18");
    expect(generatesOn("2026-12-16", "2026-11-18", "2026-11-18")).toBe("2026-12-02");
    expect(generatesOn("2027-01-05", "2026-11-18", "2026-11-18")).toBe("2026-12-16");
    expect(generatesOn("2026-11-25", "2026-11-18", "2026-11-20")).toBe("2026-11-20");
    expect(generatesOn("2026-11-25", null, "2026-11-20")).toBeNull();
  });

  it("is due only for an active run with auto generation whose day has come", () => {
    const run = { status: "active", autoGenerate: true, nextGenerationOn: "2026-11-18" };
    expect(isDue(run, "2026-11-18")).toBe(true);
    expect(isDue(run, "2026-11-17")).toBe(false);
    expect(isDue({ ...run, autoGenerate: false }, "2026-11-18")).toBe(false);
    expect(isDue({ ...run, status: "plan_approved" }, "2026-11-18")).toBe(false);
  });

  it("prices batch calls at half", () => {
    const usage = { inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0 };
    expect(callCost("claude-opus-5-5", usage, { batch: true })).toBeCloseTo(callCost("claude-opus-5-5", usage) * BATCH_DISCOUNT, 6);
    expect(customIdFor("writer", 2, "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", 1)).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });
});

// The Phase 1 generation tests' passing draft and verdicts.
const GOOD = "# Wet room or shower tray?\n\nExcerpt: A short guide.\n\nA wet room suits small rooms well. " + "Plain words here. ".repeat(10) + "\n\n## Book a consultation\n\n[Contact us](/contact).";
const PASS = JSON.stringify({ summary: "Good.", issues: [], placeholders: [], scores: { voice: 8, usefulness: 8, specificity: 8 } });
const SPEC = JSON.stringify({ keyword: "wet room", postType: "guide", location: null, angle: "Answer first.", outline: ["Book a consultation"], facts: [], links: ["/contact"], faq: false });

type Answer = { kind: "text"; text: string } | { kind: "errored"; type: string } | { kind: "expired" };

// A fake Message Batches API: each request is answered by its role, from a script, when its batch is read.
function fakeBatches(script: { spec?: Answer[]; writer?: Answer[]; critic?: Answer[] } = {}, prefix = "msgbatch_") {
  const queues = { spec: [...(script.spec ?? [])], writer: [...(script.writer ?? [])], critic: [...(script.critic ?? [])] };
  const submitted: { id: string; requests: BatchRequest[] }[] = [];
  let ended = true;
  const roleOf = (request: BatchRequest) => {
    const instructions = (request.params.system as { text: string }[])[1].text;
    return instructions === specPrompt.INSTRUCTIONS ? "spec" : instructions === criticPrompt.INSTRUCTIONS ? "critic" : "writer";
  };
  const fallback = { spec: SPEC, writer: GOOD, critic: PASS };
  const transport: BatchTransport = {
    async create(requests) {
      const id = `${prefix}${submitted.length + 1}`;
      submitted.push({ id, requests: [...requests] });
      return { id };
    },
    async retrieve() {
      return { processingStatus: ended ? "ended" : "in_progress", counts: { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 } };
    },
    async results(id) {
      const batch = submitted.find((item) => item.id === id)!;
      return batch.requests.map((request) => {
        const role = roleOf(request);
        const answer: Answer = queues[role].shift() ?? { kind: "text", text: fallback[role] };
        if (answer.kind === "expired") return { custom_id: request.custom_id, result: { type: "expired" } } as MessageBatchIndividualResponse;
        if (answer.kind === "errored") {
          return { custom_id: request.custom_id, result: { type: "errored", error: { type: "error", request_id: null, error: { type: answer.type, message: `Fake ${answer.type}` } } } } as unknown as MessageBatchIndividualResponse;
        }
        const message = {
          id: `msg_${request.custom_id}`,
          type: "message",
          role: "assistant",
          model: request.params.model,
          content: [{ type: "text", text: answer.text, citations: null }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        } as unknown as Message;
        return { custom_id: request.custom_id, result: { type: "succeeded", message } } as MessageBatchIndividualResponse;
      });
    },
  };
  return { transport, submitted, setEnded: (value: boolean) => (ended = value), roles: (index: number) => submitted[index].requests.map(roleOf) };
}

describe.skipIf(!testDatabaseUrl)("fortnightly generation (local Postgres)", () => {
  const { db, close } = createTestDb();
  const today = "2026-10-21";
  let runId: string;

  beforeEach(async () => {
    await resetDomainTables(db);
    const [client] = await db.insert(clients).values({ name: "Migss Interiors" }).returning();
    const [project] = await db.insert(projects).values({ clientId: client.id, name: "Migss Interiors Website", siteUrl: "https://www.migss.co.uk", status: "active" }).returning();
    await saveKnowledge({ tier: "project", projectId: project.id }, { allowed_links: "/contact", cta: "- Book a free design consultation at /contact" }, db);
    // Entry for two months (Tuesdays), with a GBP post the day after each; short posts, so the fake draft passes.
    const input = runInput("entry", today, 2, { lengthMin: 20, lengthMax: 200, faqMode: "never" });
    const run = await createRun(project.id, { ...input, channels: input.channels.map((channel) => (channel.contentType === "seo" || channel.contentType === "gmb" ? channel : { ...channel, amount: 0 })) }, db, { today });
    runId = run.id;
    // The approved plan, as approvePlan leaves it.
    const slots = await db.select().from(posts).where(eq(posts.runId, runId)).orderBy(asc(posts.slotDate));
    for (const [index, slot] of slots.entries()) {
      await db.update(posts).set({ status: "topic_set", topic: `Planned post ${index + 1}`, plannedExcerpt: `Excerpt ${index + 1}.` }).where(eq(posts.id, slot.id));
    }
    await db.update(runs).set({ status: "plan_approved" }).where(eq(runs.id, runId));
  });
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  const runRow = async () => (await db.select().from(runs).where(eq(runs.id, runId)))[0];
  // A batch's specs in the order its round sends them: by their post's date.
  const specsByDate = async (batchId: string) =>
    (await db.select({ spec: postSpecs }).from(postSpecs).innerJoin(posts, eq(posts.id, postSpecs.postId)).where(eq(postSpecs.batchId, batchId)).orderBy(asc(posts.slotDate))).map((row) => row.spec);

  it("activation turns generation on from today; the generation day takes four weeks of posts with specs from the plan", async () => {
    const active = await activateRun(runId, db, { today });
    expect(active).toMatchObject({ status: "active", autoGenerate: true, nextGenerationOn: today });
    expect((await dueRuns(today, db)).map((row) => row.id)).toEqual([runId]);
    const due = await duePosts(runId, today, db);
    expect(due.every((post) => post.slotDate <= windowEnd(today))).toBe(true);
    const { batchId, posts: count } = await startFortnight(runId, today, db);
    expect(count).toBe(due.length);
    expect((await runRow()).nextGenerationOn).toBe(nextAfter(today));
    const [batch] = await db.select().from(batches).where(eq(batches.id, batchId!));
    expect(batch).toMatchObject({ runId, name: "Run 1, from Wed 21 Oct 2026", cta: "Book a free design consultation at /contact", faqMode: "never" });
    const specs = await db.select().from(postSpecs).where(eq(postSpecs.batchId, batchId!));
    expect(specs.every((spec) => spec.auto && spec.status === "drafting" && spec.notes?.startsWith("Planned excerpt, from the approved plan: Excerpt"))).toBe(true);
    // A second look the same day finds nothing new.
    expect((await startFortnight(runId, today, db)).posts).toBe(0);
  });

  it("runs rounds through the half-price batch to Needs review: spec, writer, critic, then done", async () => {
    await activateRun(runId, db, { today });
    const { batchId, posts: count } = await startFortnight(runId, today, db);
    const api = fakeBatches();
    const deps = { db, batch: api.transport };
    for (let round = 0; round < 5; round++) {
      const row = await submitRound(batchId!, deps);
      if (!row) break;
      expect(row.anthropicBatchId).toBe(`msgbatch_${round + 1}`);
      expect(await pollRound(row.id, deps)).toBe("ended");
    }
    expect(api.submitted.map((_, index) => [...new Set(api.roles(index))])).toEqual([["spec"], ["writer"], ["critic"]]);
    expect(api.submitted[0].requests).toHaveLength(count);
    const members = await db.select().from(posts).where(eq(posts.batchId, batchId!));
    expect(members.every((post) => post.status === "in_review")).toBe(true);
    const calls = await db.select().from(aiCalls);
    expect(calls).toHaveLength(count * 3);
    expect(calls.every((call) => call.batch)).toBe(true);
    const usage = { inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0 };
    expect(calls.find((call) => call.purpose === "writer")!.costUsd).toBeCloseTo(callCost("claude-opus-5-5", usage, { batch: true }), 6);
    const [round] = await db.select().from(generationBatches).orderBy(asc(generationBatches.round));
    expect(round.requests.every((ref) => ref.outcome === "ok")).toBe(true);
  });

  it("waits while a batch is processing, and never submits a round twice", async () => {
    await activateRun(runId, db, { today });
    const { batchId } = await startFortnight(runId, today, db);
    const api = fakeBatches();
    api.setEnded(false);
    const deps = { db, batch: api.transport };
    const row = (await submitRound(batchId!, deps))!;
    expect(await pollRound(row.id, deps)).toBe("waiting");
    expect((await submitRound(batchId!, deps))!.id).toBe(row.id);
    expect(api.submitted).toHaveLength(1);
  });

  it("retries a server error or an expiry once, fails a post after a second, and fails a refused request at once", async () => {
    await activateRun(runId, db, { today });
    const { batchId } = await startFortnight(runId, today, db);
    const due = await specsByDate(batchId!);
    expect(due.length).toBeGreaterThanOrEqual(3);
    // Round 1: the first spec is refused, the second errors, the third expires; the rest succeed.
    const api = fakeBatches({ spec: [{ kind: "errored", type: "invalid_request_error" }, { kind: "errored", type: "overloaded_error" }, { kind: "expired" }] });
    const deps = { db, batch: api.transport };
    const first = (await submitRound(batchId!, deps))!;
    await pollRound(first.id, deps);
    const specs = await specsByDate(batchId!);
    expect(specs[0]).toMatchObject({ status: "failed", error: "The half-price batch returned an error (invalid_request_error): Fake invalid_request_error" });
    expect(specs[1].status).toBe("drafting");
    expect(specs[2].status).toBe("drafting");
    // Round 2: the two retried specs go out again with the writers for the rest; one expires again.
    const retry = fakeBatches({ spec: [{ kind: "expired" }] }, "msgbatch_retry_");
    const second = (await submitRound(batchId!, { db, batch: retry.transport }))!;
    expect(retry.roles(0).filter((role) => role === "spec")).toHaveLength(2);
    expect(second.requests.filter((ref) => ref.kind === "spec").every((ref) => ref.attempt === 2)).toBe(true);
    await pollRound(second.id, { db, batch: retry.transport });
    const after = await specsByDate(batchId!);
    expect(after[1].status).toBe("failed");
    expect(after[2].status).toBe("proposed");
    const failedCalls = await db.select().from(aiCalls).where(eq(aiCalls.purpose, "spec"));
    expect(failedCalls.filter((call) => call.error).length).toBe(4);
  });

  it("a batch never started is found for the morning run; Generate now has its own batch and real-time path", async () => {
    await activateRun(runId, db, { today });
    const { batchId } = await startFortnight(runId, today, db);
    await db.update(batches).set({ createdAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(batches.id, batchId!));
    expect(await stalledBatches(db)).toEqual([batchId]);

    const later = (await db.select().from(posts).where(eq(posts.runId, runId)).orderBy(asc(posts.slotDate))).find((post) => !post.batchId)!;
    const specId = await prepareGenerateNow(later.id, db);
    await expect(prepareGenerateNow(later.id, db)).rejects.toThrow("already being written");
    const [spec] = await db.select().from(postSpecs).where(eq(postSpecs.id, specId));
    expect(spec).toMatchObject({ auto: true, status: "drafting" });
    // Once the spec is drafted, it is confirmed and the generation queued.
    await db.update(postSpecs).set({ status: "proposed", keyword: "x" }).where(eq(postSpecs.id, specId));
    const generationId = await confirmAutoSpec(specId, db);
    const [generation] = await db.select().from(postGenerations).where(eq(postGenerations.id, generationId!));
    expect(generation.status).toBe("queued");
  });

  it("approving a post queues the run's derived channels for it, and only those", async () => {
    const [first] = await db.select().from(posts).where(eq(posts.runId, runId)).orderBy(asc(posts.slotDate));
    const slots = await db.select().from(derivedSlots).where(eq(derivedSlots.parentPostId, first.id));
    expect(slots.map((slot) => slot.contentType)).toEqual(["gmb"]);
    await db.update(posts).set({ status: "approved", slug: "planned-post-1" }).where(eq(posts.id, first.id));
    const queued = await queueDerivedSlots(first.id, db);
    expect(queued.map((row) => row.channel)).toEqual(["gmb"]);
    expect(await queueDerivedSlots(first.id, db)).toEqual([]);
    expect((await db.select().from(derivatives).where(eq(derivatives.postId, first.id))).map((row) => [row.channel, row.status])).toEqual([["gmb", "writing"]]);
  });
});
