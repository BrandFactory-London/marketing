import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clients, planFeedback, planShares, posts, projects, ruleCandidates, runs } from "@/db/schema";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { runInput } from "@/test/runs";
import type { Transport } from "./ai/client";
import { proposeCandidates } from "./learn";
import { activeShare, clientFeedback, createShare, hashIp, hashToken, markSeen, PER_HOUR, publicPlan, revokeShares, shareState, submitFeedback, unseenCount } from "./plan-share";
import { activateRun, approvePlan, currentItems, draftPlan, requestPlan } from "./planner";
import { listCandidates } from "./rules";
import { createRun } from "./runs";

function fakeApi(reply: unknown) {
  const transport: Transport = async (params) => ({
    message: {
      id: "msg",
      type: "message",
      role: "assistant",
      model: params.model,
      content: [{ type: "text", text: JSON.stringify(reply), citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as unknown as Message,
    requestId: "req",
  });
  return transport;
}

describe("plan link tokens", () => {
  it("stores only a SHA-256 of the token, and a salted hash of the address", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashIp("203.0.113.7", "s")).toHaveLength(32);
    expect(hashIp("203.0.113.7", "s")).not.toBe(hashIp("203.0.113.7", "t"));
    expect(hashIp(null)).toBeNull();
  });
});

describe.skipIf(!testDatabaseUrl)("the client link (local Postgres)", () => {
  const { db, close } = createTestDb();
  const today = "2026-10-21";
  let runId: string;
  let projectId: string;

  beforeEach(async () => {
    await resetDomainTables(db);
    const [client] = await db.insert(clients).values({ name: "Migss Interiors" }).returning();
    [{ id: projectId }] = await db.insert(projects).values({ clientId: client.id, name: "Migss Interiors Website", siteUrl: "https://www.migssinteriors.com", status: "active" }).returning({ id: projects.id });
    // Entry, one month, with LinkedIn the day after each SEO post.
    const input = runInput("entry", today);
    runId = (await createRun(projectId, { ...input, channels: input.channels.map((channel) => (channel.contentType === "seo" || channel.contentType === "linkedin" ? channel : { ...channel, amount: 0 })) }, db, { today })).id;
    const slots = await db.select().from(posts).where(eq(posts.runId, runId));
    const { planDraftId } = await requestPlan(runId, {}, db);
    await draftPlan(planDraftId, {
      db,
      transport: fakeApi({
        items: slots.map((_, index) => ({ slot: index + 1, title: `Planned post ${index + 1}`, excerpt: `Excerpt ${index + 1}.`, pillar: "", category: "Other", reason: `Internal reason ${index + 1}` })),
      }),
    });
  });
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  it("shows the client titles, excerpts, dates and channel counts, and nothing internal", async () => {
    await expect(createShare("not-a-uuid", db)).rejects.toThrow();
    const { token, expiresAt } = await createShare(runId, db);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Math.round((expiresAt.getTime() - Date.now()) / 86_400_000)).toBe(60);
    const [stored] = await db.select().from(planShares);
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect((await shareState(runId, db)).line.label).toBe("Sent to client");

    const plan = (await publicPlan(token, db))!;
    expect(plan.items.map((item) => item.title)).toEqual(plan.items.map((_, index) => `Planned post ${index + 1}`));
    expect(plan.items.every((item) => item.date >= today)).toBe(true);
    expect(plan.derived).toEqual([{ label: "LinkedIn post", count: plan.items.length }]);
    expect(JSON.stringify(plan)).not.toContain("Internal reason");
    expect((await shareState(runId, db)).line.label).toBe("Viewed by client");
  });

  it("an unknown, revoked or expired link is not active, and a new link revokes the old", async () => {
    expect(await publicPlan("x".repeat(43), db)).toBeNull();
    expect(await publicPlan("short", db)).toBeNull();
    const first = await createShare(runId, db);
    const second = await createShare(runId, db);
    expect(await activeShare(first.token, db)).toBeNull();
    expect(await activeShare(second.token, db)).not.toBeNull();
    expect(await activeShare(second.token, db, new Date(Date.now() + 61 * 86_400_000))).toBeNull();
    await revokeShares(runId, db);
    expect(await publicPlan(second.token, db)).toBeNull();
    expect((await shareState(runId, db)).line.label).toBe("Not sent");
  });

  it("takes comments and suggestions with a name, starts suggestions from them, and records the approval", async () => {
    const { token } = await createShare(runId, db);
    const [item] = (await currentItems(db, runId)).sort((a, b) => a.title.localeCompare(b.title));
    await expect(submitFeedback(token, { kind: "comment", itemId: item.id, name: " ", body: "Nice" }, null, db)).rejects.toThrow("Enter your name.");
    await expect(submitFeedback(token, { kind: "suggest", itemId: item.id, name: "Ana", body: "" }, null, db)).rejects.toThrow("Write your suggestion.");
    await expect(submitFeedback(token, { kind: "comment", itemId: item.id, name: "Ana", body: "x".repeat(2001) }, null, db)).rejects.toThrow("under 2,000");
    const sent = await submitFeedback(token, { kind: "suggest", itemId: item.id, name: "Ana", body: "We now offer a 10-year guarantee on every bathroom." }, "203.0.113.7", db);
    expect(sent.kind).toBe("suggest");
    const [row] = await db.select().from(planFeedback);
    expect(row).toMatchObject({ kind: "suggest", name: "Ana", postId: item.postId, planItemId: item.id });
    expect(row.ipHash).toHaveLength(32);
    expect(await unseenCount(projectId, db)).toBe(1);
    expect((await shareState(runId, db)).line.label).toBe("Client commented");

    const transport = fakeApi({ candidates: [{ kind: "fact", tier: "client", section: "business_facts", scope: "all", text: "Every bathroom carries a 10-year guarantee.", before: "", after: "We now offer a 10-year guarantee on every bathroom.", reason: "A lasting fact." }] });
    expect(await proposeCandidates({ planFeedbackId: sent.feedbackId! }, { db, transport })).toBe(1);
    const { proposed } = await listCandidates(db);
    expect(proposed[0].from).toBe(`From the client's suggestion for "${item.title}"`);
    expect((await db.select().from(ruleCandidates))[0]).toMatchObject({ kind: "fact", planFeedbackId: sent.feedbackId });

    await submitFeedback(token, { kind: "approve", name: "Ana" }, null, db);
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    expect(run).toMatchObject({ clientApprovedBy: "Ana" });
    expect((await shareState(runId, db)).line.label).toBe("Approved by client");
    // An approval holds nothing to learn from.
    const approval = (await clientFeedback(runId, db)).find((entry) => entry.kind === "approve")!;
    expect(await proposeCandidates({ planFeedbackId: approval.id }, { db, transport })).toBe(0);
    await markSeen(runId, db);
    expect(await unseenCount(projectId, db)).toBe(0);
  });

  it("answers a filled honeypot as if saved and stores nothing; limits each link per hour", async () => {
    const { token } = await createShare(runId, db);
    expect(await submitFeedback(token, { kind: "comment", name: "Bot", body: "Buy now", website: "spam.example" }, null, db)).toEqual({ feedbackId: null, kind: "comment" });
    expect(await db.select().from(planFeedback)).toHaveLength(0);
    for (let index = 0; index < PER_HOUR; index++) await submitFeedback(token, { kind: "comment", name: "Ana", body: `Comment ${index}` }, null, db);
    await expect(submitFeedback(token, { kind: "comment", name: "Ana", body: "One more" }, null, db)).rejects.toThrow("Too many messages in the last hour.");
  });

  it("after activation the link still shows the plan but takes no more feedback", async () => {
    const { token } = await createShare(runId, db);
    await approvePlan(runId, db);
    await activateRun(runId, db);
    const plan = (await publicPlan(token, db))!;
    expect(plan.open).toBe(false);
    await expect(submitFeedback(token, { kind: "comment", name: "Ana", body: "Late" }, null, db)).rejects.toThrow("This plan is final");
  });
});
