import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { aiCalls, clients, planDrafts, planFeedback, planItems, posts, projectCategories, projectPillars, projects, ruleCandidates, runs } from "@/db/schema";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { runInput } from "@/test/runs";
import * as plannerPrompt from "@/prompts/planner";
import type { Transport } from "./ai/client";
import { addCategory, categoryLabels, CategoryError, removeCategory } from "./categories";
import { proposeCandidates } from "./learn";
import { closeTo, overlap, significantWords } from "./plan-overlap";
import { activateRun, approvePlan, currentItems, draftPlan, failPlanDraft, PlanError, plannerContext, planView, requestItem, requestPlan } from "./planner";
import { listCandidates, planOrigin } from "./rules";
import { createRun } from "./runs";

function fakeApi(...replies: unknown[]) {
  const calls: MessageCreateParamsNonStreaming[] = [];
  const transport: Transport = async (params) => {
    calls.push(params);
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    const message = {
      id: "msg",
      type: "message",
      role: "assistant",
      model: params.model,
      content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply), citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 2000, output_tokens: 1500, cache_creation_input_tokens: 4000, cache_read_input_tokens: 0 },
    } as unknown as Message;
    return { message, requestId: `req_${calls.length}` };
  };
  return { transport, calls };
}

const userOf = (call: MessageCreateParamsNonStreaming) => call.messages[0].content as string;

describe("the overlap check (orientation Q5)", () => {
  it("compares meaningful words, plurals as one", () => {
    expect(significantWords("How to choose the right shower trays for a wet room")).toEqual(["choose", "right", "shower", "tray", "wet", "room"]);
    expect(overlap("Wet room maintenance week by week", "Wet room maintenance: a weekly guide")).toBeCloseTo(3 / 4);
  });

  it("names the covered title over 60%, and nothing under", () => {
    expect(closeTo("Wet room or shower tray: which suits you", ["Wet room or shower tray", "Kitchen worktops compared"])).toBe("Wet room or shower tray");
    expect(closeTo("Kitchen island costs in Essex", ["Wet room or shower tray", "Kitchen worktops compared"])).toBeNull();
  });
});

describe("the planner prompt (planner-1)", () => {
  const base = {
    runName: "Run 2",
    startsOn: "2026-11-18",
    endsOn: "2027-02-17",
    priorityNotes: "A big push on bathrooms.",
    slots: [
      { slot: 1, date: "Thu 19 Nov 2026" },
      { slot: 2, date: "Tue 24 Nov 2026" },
    ],
    pillars: ["Bathroom Renovation"],
    categories: ["Cost", "Other"],
    covered: ["Wet room or shower tray"],
    pages: [{ path: "/renovation-services/bathroom", title: "Bathroom Renovation" }],
    insights: [],
  };

  it("lists the slots, the covered topics, pages, pillars and categories", () => {
    const user = plannerPrompt.plannerUserMessage(base);
    expect(user).toContain("Priority notes for this run: A big push on bathrooms.");
    expect(user).toContain("Slots to plan:\n1. Thu 19 Nov 2026\n2. Tue 24 Nov 2026");
    expect(user).toContain("- Wet room or shower tray");
    expect(user).toContain("- /renovation-services/bathroom (Bathroom Renovation)");
    expect(user).toContain("Categories:\n- Cost\n- Other");
    expect(user).toContain("What search data says about the site:\nNothing yet.");
    expect(plannerPrompt.INSTRUCTIONS).not.toMatch(/—/);
  });

  it("redoes one slot with the note and the rest of the plan", () => {
    const current = [{ slot: 1, title: "A", excerpt: "a", pillar: null, category: "Cost" }, { slot: 2, title: "B", excerpt: "b", pillar: "Bathroom Renovation", category: "Other" }];
    const user = plannerPrompt.plannerUserMessage({ ...base, redo: { note: "Make it about tiles.", slot: 2, current } });
    expect(user).toContain("Plan slot 2 again (Tue 24 Nov 2026). Give one item, for that slot only.");
    expect(user).toContain("Amir's note on it: Make it about tiles.");
    expect(user).toContain("1. A | a | pillar: none | category: Cost");
    expect(user).not.toContain("Slots to plan:");
  });

  it("cuts a long excerpt at a whole word, within 160 characters", () => {
    const long = `${"Tiles ".repeat(40)}end.`;
    const fitted = plannerPrompt.fitExcerpt(long);
    expect(fitted.length).toBeLessThanOrEqual(160);
    expect(fitted.endsWith("…")).toBe(true);
    expect(plannerPrompt.fitExcerpt("  Short   and fine. ")).toBe("Short and fine.");
  });
});

describe.skipIf(!testDatabaseUrl)("the planner (local Postgres)", () => {
  const { db, close } = createTestDb();
  const today = "2026-10-21";
  let projectId: string;
  let runId: string;

  beforeEach(async () => {
    await resetDomainTables(db);
    const [client] = await db.insert(clients).values({ name: "Migss Interiors" }).returning();
    [{ id: projectId }] = await db.insert(projects).values({ clientId: client.id, name: "Migss Interiors Website", siteUrl: "https://www.migssinteriors.com", status: "active" }).returning({ id: projects.id });
    await db.insert(projectPillars).values({ projectId, label: "Bathroom Renovation", slug: "bathroom-renovation" });
    await db.insert(projectCategories).values([{ projectId, label: "Cost", position: 0 }, { projectId, label: "Technical", position: 1 }]);
    // Entry, one month: four or five Tuesdays, SEO only.
    const input = runInput("entry", today);
    runId = (await createRun(projectId, { ...input, channels: input.channels.map((channel) => (channel.contentType === "seo" ? channel : { ...channel, amount: 0 })) }, db, { today })).id;
    await db.insert(posts).values({ projectId, slotDate: "2026-10-01", status: "published", topic: "Wet room or shower tray", liveUrl: "https://www.migssinteriors.com/post/wet-room" });
  });
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  const slotPosts = () => db.select().from(posts).where(eq(posts.runId, runId)).orderBy(asc(posts.slotDate));

  function reply(count: number, overrides: (slot: number) => Partial<plannerPrompt.PlanReply["items"][number]> = () => ({})) {
    return {
      items: Array.from({ length: count }, (_, index) => ({
        slot: index + 1,
        title: `Bathroom question number ${index + 1}`,
        excerpt: `What a homeowner should know about question ${index + 1}.`,
        pillar: "bathroom renovation",
        category: index === 0 ? "cost" : "Unknown",
        reason: "A gap in the site's pages.",
        ...overrides(index + 1),
      })),
    };
  }

  it("keeps a per-project category list with Other last", async () => {
    expect(await categoryLabels(projectId, db)).toEqual(["Cost", "Technical", "Other"]);
    await addCategory(projectId, "Guarantee", db);
    await expect(addCategory(projectId, "cost", db)).rejects.toThrow("This project already has that category.");
    await expect(addCategory(projectId, "Other", db)).rejects.toBeInstanceOf(CategoryError);
    const [technical] = await db.select().from(projectCategories).where(eq(projectCategories.label, "Technical"));
    await removeCategory(projectId, technical.id, db);
    expect(await categoryLabels(projectId, db)).toEqual(["Cost", "Guarantee", "Other"]);
  });

  it("reads the run's slots, pillars, categories, covered topics and an empty insights list", async () => {
    const context = await plannerContext(runId, db);
    expect(context.slots.length).toBe((await slotPosts()).length);
    expect(context.categories).toEqual(["Cost", "Technical", "Other"]);
    expect(context.covered).toEqual(["Wet room or shower tray"]);
    expect(context.insights).toEqual([]);
  });

  it("drafts a plan: one item per slot, pillar and category matched, the call recorded as plan", async () => {
    const slots = await slotPosts();
    const { planDraftId } = await requestPlan(runId, {}, db);
    expect((await db.select().from(runs).where(eq(runs.id, runId)))[0].status).toBe("planning");
    await expect(requestPlan(runId, {}, db)).rejects.toThrow("The plan is being drafted.");
    const api = fakeApi(reply(slots.length, (slot) => (slot === 2 ? { title: "Wet room or shower tray: which is right" } : {})));
    expect(await draftPlan(planDraftId, { db, transport: api.transport })).toBe(slots.length);
    // A retried run does nothing and pays nothing.
    expect(await draftPlan(planDraftId, { db, transport: api.transport })).toBe(0);
    expect(api.calls).toHaveLength(1);
    expect(userOf(api.calls[0])).toContain("- Wet room or shower tray");
    const items = (await currentItems(db, runId)).sort((a, b) => a.title.localeCompare(b.title));
    expect(items).toHaveLength(slots.length);
    const first = items.find((item) => item.title === "Bathroom question number 1")!;
    expect(first).toMatchObject({ category: "Cost", status: "proposed", version: 1 });
    expect(first.pillarId).not.toBeNull();
    expect(items.find((item) => item.title === "Bathroom question number 3")?.category).toBe("Other");
    expect(items.find((item) => item.title.startsWith("Wet room"))?.closeTo).toBe("Wet room or shower tray");
    const [call] = await db.select().from(aiCalls);
    expect(call).toMatchObject({ purpose: "plan", promptVersion: "planner-1", effort: "high", postId: null });
    expect((await planView(runId, db)).drafting).toBe(false);
  });

  it("redoes one item with a note, keeping the old version as replaced, and feeds the note to the learning loop", async () => {
    const slots = await slotPosts();
    const first = await requestPlan(runId, {}, db);
    await draftPlan(first.planDraftId, { db, transport: fakeApi(reply(slots.length)).transport });
    const again = await requestItem(runId, slots[0].id, { note: "Make it about tile choice." }, db);
    expect(again.noteFeedbackId).not.toBeNull();
    const api = fakeApi({ items: [{ slot: 1, title: "Choosing bathroom tiles", excerpt: "How to pick tiles that last.", pillar: "", category: "Technical", reason: "Tiles are a common question." }] });
    expect(await draftPlan(again.planDraftId, { db, transport: api.transport })).toBe(1);
    expect(userOf(api.calls[0])).toContain("Amir's note on it: Make it about tile choice.");
    const versions = await db.select().from(planItems).where(eq(planItems.postId, slots[0].id)).orderBy(asc(planItems.version));
    expect(versions.map((row) => [row.version, row.status])).toEqual([
      [1, "replaced"],
      [2, "proposed"],
    ]);
    expect(versions[1]).toMatchObject({ title: "Choosing bathroom tiles", pillarId: null, category: "Technical" });

    const learn = fakeApi({ candidates: [{ kind: "rule", tier: "client", section: "voice", scope: "all", text: "Talk about tile choice plainly.", before: "", after: "Make it about tile choice.", reason: "Voice." }] });
    expect(await proposeCandidates({ planFeedbackId: again.noteFeedbackId! }, { db, transport: learn.transport })).toBe(1);
    expect(userOf(learn.calls[0])).toContain("Amir asked the planner to redo part of a content plan");
    const [candidate] = await db.select().from(ruleCandidates);
    expect(candidate).toMatchObject({ planFeedbackId: again.noteFeedbackId, postId: slots[0].id });
    const { proposed } = await listCandidates(db);
    expect(proposed[0].from).toBe('From your note on "Bathroom question number 1" in the plan for Run 1');
  });

  it("a whole-plan note is about no single post, and its candidate still finds its project", async () => {
    const slots = await slotPosts();
    const first = await requestPlan(runId, {}, db);
    await draftPlan(first.planDraftId, { db, transport: fakeApi(reply(slots.length)).transport });
    const again = await requestPlan(runId, { note: "More about cost, please." }, db);
    const api = fakeApi(reply(slots.length));
    await draftPlan(again.planDraftId, { db, transport: api.transport });
    expect(userOf(api.calls[0])).toContain("Amir asked for the whole plan again.");
    const learn = fakeApi({ candidates: [{ kind: "rule", tier: "project", section: "cta", scope: "all", text: "End with the free consultation.", before: "", after: "More about cost, please.", reason: "CTA." }] });
    expect(await proposeCandidates({ planFeedbackId: again.noteFeedbackId! }, { db, transport: learn.transport })).toBe(1);
    const [candidate] = await db.select().from(ruleCandidates);
    expect(candidate.postId).toBeNull();
    const { proposed } = await listCandidates(db);
    expect(proposed[0]).toMatchObject({ projectName: "Migss Interiors Website", from: "From your note on the plan for Run 1" });
    expect(planOrigin({ kind: "suggest", itemTitle: "Tiles", runName: "Run 2" })).toBe('From the client\'s suggestion for "Tiles"');
  });

  it("approves the plan into topics and planned excerpts, then activates; activation needs approval", async () => {
    const slots = await slotPosts();
    await expect(approvePlan(runId, db)).rejects.toBeInstanceOf(PlanError);
    const { planDraftId } = await requestPlan(runId, {}, db);
    await draftPlan(planDraftId, { db, transport: fakeApi(reply(slots.length)).transport });
    await expect(activateRun(runId, db)).rejects.toThrow("Approve the plan first.");
    expect(await approvePlan(runId, db)).toBe(slots.length);
    const after = await slotPosts();
    expect(after.every((post) => post.status === "topic_set" && post.topic?.startsWith("Bathroom question") && post.plannedExcerpt?.startsWith("What a homeowner"))).toBe(true);
    expect((await db.select().from(runs).where(eq(runs.id, runId)))[0]).toMatchObject({ status: "plan_approved" });
    expect((await currentItems(db, runId)).every((item) => item.status === "approved")).toBe(true);
    // An approved plan's slots stay plannable, so one can be redone before activation.
    expect((await plannerContext(runId, db)).slots).toHaveLength(slots.length);
    const active = await activateRun(runId, db);
    expect(active.status).toBe("active");
    await expect(requestPlan(runId, {}, db)).rejects.toThrow("This run is active.");
  });

  it("a failed draft is marked with its reason, and an imported run has no plan", async () => {
    const { planDraftId } = await requestPlan(runId, {}, db);
    await failPlanDraft(planDraftId, new Error("Trigger.dev could not be reached."), db);
    expect((await planView(runId, db)).failed).toBe("Trigger.dev could not be reached.");
    expect((await db.select().from(planDrafts).where(eq(planDrafts.id, planDraftId)))[0].status).toBe("failed");
    await db.update(runs).set({ imported: true }).where(eq(runs.id, runId));
    await expect(requestPlan(runId, {}, db)).rejects.toThrow("made from the Phase 1 slots");
    expect(await db.select().from(planFeedback)).toHaveLength(0);
  });
});
