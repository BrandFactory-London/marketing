import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { aiCalls, knowledgeVersions, posts, reviewEvents, ruleCandidates } from "@/db/schema";
import * as rulesPrompt from "@/prompts/rules";
import type { Transport } from "./ai/client";
import { createClient } from "./clients";
import { getCurrentKnowledge, saveKnowledge } from "./knowledge";
import { createProject } from "./projects";
import { acceptCandidate, appendRule, dismissCandidate, proposeRuleCandidates } from "./rules";

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
      usage: { input_tokens: 3000, output_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as unknown as Message;
    return { message, requestId: "req_rules" };
  };
  return { transport, calls };
}

const HUNKS = [
  { before: "Every installation carries a 10-year labour guarantee [CONFIRM].", after: "Every installation carries a 2-year labour guarantee." },
  { before: "We elevate every bathroom.", after: "We rebuild every bathroom to last." },
];

describe("rule candidate pieces (pure)", () => {
  it("appends a rule as a new list item without touching existing lines", () => {
    expect(appendRule("- Never use em dashes.\n- Plain British English.\n\n", "Name the area in the first paragraph.")).toBe(
      "- Never use em dashes.\n- Plain British English.\n- Name the area in the first paragraph.",
    );
    expect(appendRule(undefined, "  Two   spaces ")).toBe("- Two spaces");
  });

  it("only lets a candidate join the sections the orientation named", () => {
    expect(rulesPrompt.isCandidateTarget("client", "business_facts")).toBe(true);
    expect(rulesPrompt.isCandidateTarget("client", "examples")).toBe(false);
    expect(rulesPrompt.isCandidateTarget("project", "allowed_links")).toBe(false);
    expect(rulesPrompt.isCandidateTarget("agency", "business_facts")).toBe(false);
  });

  it("shows the model each edit as before and after, with Amir's notes", () => {
    const message = rulesPrompt.rulesUserMessage({ title: "Wet room care", hunks: HUNKS, notes: ["Say how often."] });
    expect(message).toContain("Edit 1\nBefore: Every installation carries a 10-year labour guarantee [CONFIRM].\nAfter: Every installation carries a 2-year labour guarantee.");
    expect(message).toContain("- Say how often.");
    expect(rulesPrompt.PROMPT_VERSION).toBe("rules-1");
  });
});

describe.skipIf(!testDatabaseUrl)("rule candidates (local Postgres)", () => {
  const { db, close } = createTestDb();
  afterAll(close);
  let ids: { post: string; client: string; event: string };

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss website", siteUrl: "https://www.migss.co.uk", package: "entry", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    await saveKnowledge({ tier: "agency" }, { writing_rules: "- Never use em dashes.", banned_phrases: '- "seamless"' }, db);
    await saveKnowledge({ tier: "client", clientId: client.id }, { business_facts: "- Based in Chigwell.", voice: "Plain and practical." }, db);
    const [post] = await db.insert(posts).values({ projectId: project.id, status: "approved", slotDate: "2026-11-03", topic: "Wet room maintenance" }).returning();
    const [event] = await db.insert(reviewEvents).values({ postId: post.id, action: "approve", diff: HUNKS }).returning();
    await db.insert(reviewEvents).values({ postId: post.id, action: "regenerate", note: "Say how often to clear the drain." });
    ids = { post: post.id, client: client.id, event: event.id };
  });

  const reply = {
    candidates: [
      { tier: "client", section: "business_facts", text: "Every installation carries a 2-year labour guarantee.", before: HUNKS[0].before, after: HUNKS[0].after, reason: "Amir supplied the guarantee." },
      { tier: "agency", section: "banned_phrases", text: "elevate", before: HUNKS[1].before, after: HUNKS[1].after, reason: "Generic marketing verb." },
      { tier: "agency", section: "business_facts", text: "Wrong place.", before: "", after: "", reason: "" },
    ],
  };

  it("proposes candidates from the diff, keeps only valid places, and records the call", async () => {
    const api = fakeApi(reply);
    expect(await proposeRuleCandidates(ids.event, { db, transport: api.transport })).toBe(2);
    const user = api.calls[0].messages[0].content as string;
    expect(user).toContain("After: Every installation carries a 2-year labour guarantee.");
    expect(user).toContain("- Say how often to clear the drain.");
    expect((api.calls[0].system as { text: string }[])[1].text).toBe(rulesPrompt.INSTRUCTIONS);
    const rows = await db.select().from(ruleCandidates);
    expect(rows.map((row) => `${row.tier}:${row.section}`).sort()).toEqual(["agency:banned_phrases", "client:business_facts"]);
    const [call] = await db.select().from(aiCalls);
    expect(call).toMatchObject({ purpose: "rules", requestedModel: "claude-opus-5-5", effort: "medium", promptVersion: "rules-1" });
    expect(call.costUsd).toBeCloseTo((3000 * 4 + 900 * 20) / 1_000_000, 6);
  });

  it("never pays twice for one approval, and skips approvals with no edits", async () => {
    const api = fakeApi(reply);
    await proposeRuleCandidates(ids.event, { db, transport: api.transport });
    await proposeRuleCandidates(ids.event, { db, transport: api.transport });
    expect(api.calls).toHaveLength(1);
    const [empty] = await db.insert(reviewEvents).values({ postId: ids.post, action: "approve", diff: [] }).returning();
    expect(await proposeRuleCandidates(empty.id, { db, transport: api.transport })).toBe(0);
    expect(api.calls).toHaveLength(1);
  });

  it("accepting adds the rule to the end of its section as a new version and leaves the rest alone", async () => {
    await proposeRuleCandidates(ids.event, { db, transport: fakeApi(reply).transport });
    const rows = await db.select().from(ruleCandidates);
    const fact = rows.find((row) => row.section === "business_facts")!;
    const result = await acceptCandidate(fact.id, { text: "Every installation carries a 2-year labour guarantee.", tier: "client", section: "business_facts" }, db);
    expect(result).toEqual({ tier: "client", version: 2 });
    const current = await getCurrentKnowledge({ tier: "client", clientId: ids.client }, db);
    expect(current?.sections.business_facts).toBe("- Based in Chigwell.\n- Every installation carries a 2-year labour guarantee.");
    expect(current?.sections.voice).toBe("Plain and practical.");
    const [accepted] = await db.select().from(ruleCandidates).where(eq(ruleCandidates.id, fact.id));
    expect(accepted.status).toBe("accepted");
    expect(accepted.knowledgeVersionId).toBe(current?.id);
    await expect(acceptCandidate(fact.id, { text: "x", tier: "client", section: "business_facts" }, db)).rejects.toThrow("already been decided");
  });

  it("lets Amir edit the text and move it to another tier before accepting, or dismiss it", async () => {
    await proposeRuleCandidates(ids.event, { db, transport: fakeApi(reply).transport });
    const rows = await db.select().from(ruleCandidates);
    const banned = rows.find((row) => row.section === "banned_phrases")!;
    await acceptCandidate(banned.id, { text: "Never describe a bathroom as elevated.", tier: "agency", section: "writing_rules" }, db);
    const agency = await getCurrentKnowledge({ tier: "agency" }, db);
    expect(agency?.sections.writing_rules).toBe("- Never use em dashes.\n- Never describe a bathroom as elevated.");
    expect(agency?.sections.banned_phrases).toBe('- "seamless"');
    const fact = rows.find((row) => row.section === "business_facts")!;
    await expect(acceptCandidate(fact.id, { text: "x", tier: "client", section: "examples" }, db)).rejects.toThrow("Choose where the rule belongs.");
    await dismissCandidate(fact.id, db);
    expect((await db.select().from(ruleCandidates).where(eq(ruleCandidates.id, fact.id)))[0].status).toBe("dismissed");
    expect(await db.select().from(knowledgeVersions).where(eq(knowledgeVersions.tier, "client"))).toHaveLength(1);
  });
});
