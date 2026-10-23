import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import { aiCalls, posts, reviewEvents, ruleCandidates } from "@/db/schema";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import * as factsPrompt from "@/prompts/facts";
import type { Transport } from "./ai/client";
import { normaliseCandidate } from "./candidate-keys";
import { createClient } from "./clients";
import { latestRegenerateEvent, proposeFacts } from "./facts";
import { getCurrentKnowledge } from "./knowledge";
import { createProject } from "./projects";
import { acceptCandidate, proposeRuleCandidates } from "./rules";

function fakeApi(reply: unknown) {
  const calls: MessageCreateParamsNonStreaming[] = [];
  const transport: Transport = async (params) => {
    calls.push(params);
    const message = {
      id: "msg",
      type: "message",
      role: "assistant",
      model: params.model,
      content: [{ type: "text", text: JSON.stringify(reply), citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 400, output_tokens: 120, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0 },
    } as unknown as Message;
    return { message, requestId: `req_${calls.length}` };
  };
  return { transport, calls };
}

const GUARANTEE = { tier: "client", text: "Every Migss installation carries a 10-year labour guarantee.", quote: "we give a 10-year labour guarantee on every install", reason: "Posts can state the guarantee instead of a placeholder." };

describe("fact candidates (γ6 orientation Q7)", () => {
  it("normalises text so case, punctuation and curly quotes do not make a new candidate", () => {
    expect(normaliseCandidate("Every Migss installation carries a 10-year labour guarantee.")).toBe(normaliseCandidate("every migss installation carries a 10 year labour guarantee"));
    expect(normaliseCandidate("Migss’s team")).toBe(normaliseCandidate("Migss's team"));
  });

  it("tells the model to propose only stated facts, never edit instructions", () => {
    expect(factsPrompt.INSTRUCTIONS).toContain('instructions about this post, such as "shorten the opening"');
    expect(factsPrompt.factsUserMessage({ title: "Wet rooms", note: "Shorter." })).toBe("The post: Wet rooms\n\nAmir's note:\nShorter.");
  });
});

describe.skipIf(!testDatabaseUrl)("fact suggestions and duplicates (local Postgres)", () => {
  const { db, close } = createTestDb();
  let ids: { post: string; client: string; project: string };
  afterAll(close);

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject({ clientId: client.id, name: "Migss website", siteUrl: "https://www.migssinteriors.com", package: "entry", status: "paused", publishingTarget: "wix_blog" }, db);
    const [post] = await db.insert(posts).values({ projectId: project.id, status: "generating", slotDate: "2026-11-03", topic: "Wet room maintenance" }).returning();
    ids = { post: post.id, client: client.id, project: project.id };
  });

  async function regenerate(note: string, postId = ids.post) {
    const [event] = await db.insert(reviewEvents).values({ postId, action: "regenerate", note }).returning({ id: reviewEvents.id });
    return event.id;
  }

  it("proposes a fact the note states, as a client business fact Amir can add", async () => {
    const eventId = await regenerate("Fill the guarantee in: we give a 10-year labour guarantee on every install.");
    expect(await latestRegenerateEvent(ids.post, db)).toBe(eventId);
    const api = fakeApi({ facts: [GUARANTEE] });
    expect(await proposeFacts(eventId, { db, transport: api.transport })).toBe(1);
    const [candidate] = await db.select().from(ruleCandidates);
    expect(candidate).toMatchObject({ kind: "fact", tier: "client", section: "business_facts", text: GUARANTEE.text, before: null, after: GUARANTEE.quote, status: "proposed" });
    const [call] = await db.select().from(aiCalls).where(eq(aiCalls.id, candidate.aiCallId!));
    expect(call).toMatchObject({ purpose: "facts", promptVersion: "facts-1", effort: "low" });
    expect(api.calls[0].messages[0].content).toContain("we give a 10-year labour guarantee on every install");

    // Accepted like a rule: it joins the client's business facts as a new version.
    await acceptCandidate(candidate.id, { text: candidate.text, tier: "client", section: "business_facts" }, db);
    expect((await getCurrentKnowledge({ tier: "client", clientId: ids.client }, db))?.sections.business_facts).toBe(`- ${GUARANTEE.text}`);
  });

  it("reads each note once, and nothing but regenerate notes", async () => {
    const eventId = await regenerate("Shorten the opening.");
    const api = fakeApi({ facts: [] });
    expect(await proposeFacts(eventId, { db, transport: api.transport })).toBe(0);
    expect(api.calls).toHaveLength(1);
    const [reject] = await db.insert(reviewEvents).values({ postId: ids.post, action: "reject", note: "We give a 10-year guarantee." }).returning();
    expect(await proposeFacts(reject.id, { db, transport: api.transport })).toBe(0);
    expect(api.calls).toHaveLength(1);
    const withFact = await regenerate("We give a 10-year labour guarantee on every install.");
    await proposeFacts(withFact, { db, transport: fakeApi({ facts: [GUARANTEE] }).transport });
    const again = fakeApi({ facts: [GUARANTEE] });
    expect(await proposeFacts(withFact, { db, transport: again.transport })).toBe(0);
    expect(again.calls).toHaveLength(0);
  });

  it("skips a fact already waiting for the same client (backlog 21), but not one for another client", async () => {
    await proposeFacts(await regenerate("10-year guarantee, please."), { db, transport: fakeApi({ facts: [GUARANTEE] }).transport });
    const louder = { ...GUARANTEE, text: "every Migss installation carries a 10 year labour guarantee" };
    expect(await proposeFacts(await regenerate("Again: 10-year guarantee."), { db, transport: fakeApi({ facts: [louder] }).transport })).toBe(0);

    const other = await createClient({ name: "Other Interiors", mainContact: null, email: null, phone: null }, db);
    const otherProject = await createProject({ clientId: other.id, name: "Other site", siteUrl: "https://other.example", package: "entry", status: "paused", publishingTarget: "wix_blog" }, db);
    const [otherPost] = await db.insert(posts).values({ projectId: otherProject.id, status: "generating", slotDate: "2026-11-04", topic: "Kitchens" }).returning();
    expect(await proposeFacts(await regenerate("Same guarantee here.", otherPost.id), { db, transport: fakeApi({ facts: [GUARANTEE] }).transport })).toBe(1);
    expect(await db.select({ text: ruleCandidates.text }).from(ruleCandidates).orderBy(asc(ruleCandidates.createdAt))).toHaveLength(2);
  });

  it("skips a rule candidate already waiting for the same place (backlog 21)", async () => {
    const rule = { tier: "agency", section: "writing_rules", text: "Name the area in the first paragraph of local posts.", before: "a", after: "b", reason: "c" };
    await db.insert(ruleCandidates).values({ reviewEventId: await regenerate("x"), postId: ids.post, tier: "agency", section: "writing_rules", text: rule.text });
    const [approve] = await db.insert(reviewEvents).values({ postId: ids.post, action: "approve", diff: [{ before: "a", after: "b" }] }).returning();
    const api = fakeApi({ candidates: [rule, { ...rule, text: "Open cost guides with the price range." }] });
    expect(await proposeRuleCandidates(approve.id, { db, transport: api.transport })).toBe(1);
    const texts = (await db.select({ text: ruleCandidates.text }).from(ruleCandidates)).map((row) => row.text);
    expect(texts.sort()).toEqual(["Name the area in the first paragraph of local posts.", "Open cost guides with the price range."]);
  });
});
