import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { aiCalls, batches, derivatives, knowledgeVersions, postDrafts, postGenerations, posts, postSpecs, postVersions, reviewEvents, ruleCandidates } from "@/db/schema";
import * as learnPrompt from "@/prompts/learn";
import type { Transport } from "./ai/client";
import { normaliseCandidate } from "./candidate-keys";
import { runChecks } from "./checks";
import { createClient } from "./clients";
import { queueDerivative, saveDerivativeEdit, writeDerivative } from "./derivatives";
import { changedWords } from "./edit-diff";
import { getCurrentKnowledge, saveKnowledge } from "./knowledge";
import { candidateScope, DROP_REASONS, latestRegenerateEvent, MIN_CHANGED_WORDS, proposeCandidates } from "./learn";
import { unstoredNote } from "./drafts";
import { createProject } from "./projects";
import { acceptCandidate, appendRule, candidateOrigin, dismissCandidate, listCandidates, targetLabel } from "./rules";

// Replies in turn; JSON for the candidate call, text for a derivative.
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
      usage: { input_tokens: 600, output_tokens: 300, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0 },
    } as unknown as Message;
    return { message, requestId: `req_${calls.length}` };
  };
  return { transport, calls };
}

const instructionsOf = (call: MessageCreateParamsNonStreaming) => (call.system as { text: string }[])[1].text;
const userOf = (call: MessageCreateParamsNonStreaming) => call.messages[0].content as string;

const HUNKS = [
  { before: "Every installation carries a 10-year labour guarantee [CONFIRM].", after: "Every installation carries a 2-year labour guarantee." },
  { before: "We elevate every bathroom.", after: "We rebuild every bathroom to last." },
];

type Candidate = learnPrompt.LearnReply["candidates"][number];
const rule = (overrides: Partial<Candidate> = {}): Candidate => ({
  kind: "rule",
  tier: "agency",
  section: "writing_rules",
  scope: "linkedin",
  text: "Open LinkedIn posts with a plain statement of the article's main point, never a question.",
  before: "",
  after: "Don't open with a question.",
  reason: "Holds for every LinkedIn post.",
  ...overrides,
});
const GUARANTEE: Candidate = {
  kind: "fact",
  tier: "client",
  section: "business_facts",
  scope: "linkedin",
  text: "Every Migss installation carries a 10-year labour guarantee.",
  before: "",
  after: "we give a 10-year labour guarantee on every install",
  reason: "Posts can state the guarantee instead of a placeholder.",
};

const URL = "https://www.migssinteriors.com/blog/wet-room-maintenance";
const LINKEDIN = `Most wet room leaks start at the silicone, not the tiles.\n\nChecking the joints around the tray each month catches small leaks while they are cheap to fix.\n\nRead the full guide:\n${URL}`;
const GBP = "A wet room stays watertight when the seals are looked after. Check the silicone around the tray every month and clear the drain of hair and soap each week. Read the full guide for a week by week routine.";

describe("candidate pieces (pure)", () => {
  it("appends a rule as a new list item without touching existing lines", () => {
    expect(appendRule("- Never use em dashes.\n- Plain British English.\n\n", "Name the area in the first paragraph.")).toBe(
      "- Never use em dashes.\n- Plain British English.\n- Name the area in the first paragraph.",
    );
    expect(appendRule(undefined, "  Two   spaces ")).toBe("- Two spaces");
  });

  it("only lets a candidate join the sections the orientation named", () => {
    expect(learnPrompt.isCandidateTarget("client", "business_facts")).toBe(true);
    expect(learnPrompt.isCandidateTarget("client", "examples")).toBe(false);
    expect(learnPrompt.isCandidateTarget("project", "allowed_links")).toBe(false);
    expect(learnPrompt.isCandidateTarget("agency", "business_facts")).toBe(false);
  });

  it("normalises text so case, punctuation and curly quotes do not make a new candidate", () => {
    expect(normaliseCandidate("Every Migss installation carries a 10-year labour guarantee.")).toBe(normaliseCandidate("every migss installation carries a 10 year labour guarantee"));
    expect(normaliseCandidate("Migss’s team")).toBe(normaliseCandidate("Migss's team"));
  });

  it("scopes only writing rules and voice to one channel, and never a fact", () => {
    expect(candidateScope("rule", "agency", "writing_rules", "linkedin")).toBe("linkedin");
    expect(candidateScope("rule", "client", "voice", "gmb")).toBe("gmb");
    expect(candidateScope("rule", "agency", "banned_phrases", "linkedin")).toBe("all");
    expect(candidateScope("rule", "project", "cta", "blog")).toBe("all");
    expect(candidateScope("fact", "client", "business_facts", "linkedin")).toBe("all");
  });

  it("counts a typo or a one-word swap as too small to learn from (γ7 orientation Q3)", () => {
    expect(changedWords("Check the silicon every month.", "Check the silicone every month.")).toBe(1);
    expect(changedWords("Check it monthly.", "Check the silicone around the tray every month.")).toBeGreaterThanOrEqual(MIN_CHANGED_WORDS);
    expect(changedWords("Same text.", "Same text.")).toBe(0);
  });

  it("tells the model where the feedback came from, its channel, and the rules already set per channel", () => {
    const note = learnPrompt.learnUserMessage({ source: "derivative_note", channel: "linkedin", title: "Wet rooms", note: "Don't open with a question.", version: "Is your wet room leaking?", channelRules: "" });
    expect(note).toContain('The channel: LinkedIn post ("linkedin")');
    expect(note).toContain("Amir asked the writer to redo this version, saying what was wrong with it.");
    expect(note).toContain("Amir's note:\nDon't open with a question.");
    expect(note).toContain("The version the note is about:\n\nIs your wet room leaking?");
    expect(note).toContain("Rules already set for single channels:\nNone.");
    const approve = learnPrompt.learnUserMessage({ source: "blog_approve", channel: "blog", title: "Wet rooms", hunks: HUNKS, channelRules: "## Rules for LinkedIn posts only" });
    expect(approve).toContain("Edit 1\nBefore: Every installation carries a 10-year labour guarantee [CONFIRM].\nAfter: Every installation carries a 2-year labour guarantee.");
    expect(approve).toContain("## Rules for LinkedIn posts only");
  });

  it("asks the one-off question and names the drainage example (γ7 orientation Q4)", () => {
    expect(learnPrompt.INSTRUCTIONS).toContain("would it still be right for a different post on a different topic?");
    expect(learnPrompt.INSTRUCTIONS).toContain('"Lead with the drainage point" is about this post\'s topic: nothing.');
    expect(learnPrompt.INSTRUCTIONS).not.toMatch(/[–—]/);
    expect(learnPrompt.PROMPT_VERSION).toBe("learn-2");
  });

  it("says where each candidate came from in Amir's words (γ7 handoff item 5)", () => {
    const post = "Wet room maintenance week by week";
    expect(candidateOrigin({ postTitle: post, channel: "linkedin", derivativeSource: "model" })).toBe(`From your note on the LinkedIn post for "${post}"`);
    expect(candidateOrigin({ postTitle: post, channel: "gmb", derivativeSource: "edit" })).toBe(`From your edit to the GBP post for "${post}"`);
    expect(candidateOrigin({ postTitle: post, channel: "blog", action: "reject" })).toBe(`From your reject note on "${post}"`);
    expect(candidateOrigin({ postTitle: post, channel: "blog", action: "regenerate" })).toBe(`From your regenerate note on "${post}"`);
    expect(candidateOrigin({ postTitle: post, channel: "blog", action: "approve" })).toBe(`From your edits when approving "${post}"`);
  });

  it("labels an accepted rule by the channel section it joined", () => {
    expect(targetLabel("agency", "writing_rules", "linkedin")).toBe("BrandFactory rules: LinkedIn post rules");
    expect(targetLabel("client", "voice", "pinterest")).toBe("Client knowledge: Pinterest pin voice");
    expect(targetLabel("agency", "writing_rules")).toBe("BrandFactory rules: Writing rules");
  });
});

describe.skipIf(!testDatabaseUrl)("candidates from every source (local Postgres)", () => {
  const { db, close } = createTestDb();
  afterAll(close);
  let ids: { post: string; client: string; project: string; draft: string; generation: string };

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss website", siteUrl: "https://www.migssinteriors.com", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    await saveKnowledge({ tier: "agency" }, { writing_rules: "- Never use em dashes.", banned_phrases: '- "seamless"' }, db);
    await saveKnowledge({ tier: "client", clientId: client.id }, { business_facts: "- Based in Chigwell.", voice: "Plain and practical." }, db);
    const [batch] = await db
      .insert(batches)
      .values({ projectId: project.id, name: "N", lengthMin: 20, lengthMax: 200, cta: "Book", faqMode: "never", writerModel: "claude-opus-5-5", criticModel: "claude-opus-5-5", derivativeModel: "claude-opus-5-5" })
      .returning();
    const [post] = await db.insert(posts).values({ projectId: project.id, status: "approved", slotDate: "2026-11-03", topic: "Wet room maintenance", batchId: batch.id, slug: "wet-room-maintenance" }).returning();
    const [spec] = await db.insert(postSpecs).values({ postId: post.id, batchId: batch.id, version: 1, status: "confirmed", lengthMin: 20, lengthMax: 200, cta: "Book", faq: false }).returning();
    const [generation] = await db.insert(postGenerations).values({ postId: post.id, specId: spec.id, batchId: batch.id, status: "in_review", round: 1 }).returning();
    const markdown = "# Wet room maintenance\n\nExcerpt: Keep it watertight.\n\nCheck the silicone every month.\n";
    const checks = runChecks({ markdown, lengthMin: 1, lengthMax: 200, faq: false, allowedLinks: [], bannedPhrases: [] });
    const [draft] = await db
      .insert(postDrafts)
      .values({ generationId: generation.id, round: 1, title: "Wet room maintenance", excerpt: "Keep it watertight.", bodyMd: markdown, wordCount: checks.wordCount, checks, checksPassed: true })
      .returning();
    ids = { post: post.id, client: client.id, project: project.id, draft: draft.id, generation: generation.id };
  });

  async function event(action: "approve" | "reject" | "regenerate", values: { note?: string; diff?: typeof HUNKS } = {}) {
    const [row] = await db.insert(reviewEvents).values({ postId: ids.post, action, ...values }).returning({ id: reviewEvents.id });
    return row.id;
  }

  async function linkedinVersion(note: string | null = null) {
    const id = await queueDerivative(ids.post, "linkedin", note, db);
    await writeDerivative(id, { db, transport: fakeApi(LINKEDIN).transport });
    return id;
  }

  it("reads the approve diff alone, keeps only valid places, and records the call", async () => {
    await event("regenerate", { note: "Say how often to clear the drain." });
    const approve = await event("approve", { diff: HUNKS });
    const api = fakeApi({
      candidates: [
        { ...GUARANTEE, after: HUNKS[0].after, text: "Every installation carries a 2-year labour guarantee." },
        rule({ section: "banned_phrases", text: "elevate", scope: "blog" }),
        rule({ tier: "agency", section: "business_facts", text: "Wrong place." }),
      ],
    });
    expect(await proposeCandidates({ reviewEventId: approve }, { db, transport: api.transport })).toBe(2);
    const user = userOf(api.calls[0]);
    expect(user).toContain("These are his edits, from the writer's last draft to the approved text.");
    expect(user).toContain("After: Every installation carries a 2-year labour guarantee.");
    // The notes were read when they were saved, so they are not sent again.
    expect(user).not.toContain("Say how often");
    expect(instructionsOf(api.calls[0])).toBe(learnPrompt.INSTRUCTIONS);
    const rows = await db.select().from(ruleCandidates).orderBy(asc(ruleCandidates.section));
    expect(rows.map((row) => [row.kind, `${row.tier}:${row.section}`, row.scope])).toEqual([
      ["rule", "agency:banned_phrases", "all"],
      ["fact", "client:business_facts", "all"],
    ]);
    const [call] = await db.select().from(aiCalls);
    expect(call).toMatchObject({ purpose: "rules", requestedModel: "claude-opus-5-5", effort: "medium", promptVersion: "learn-2" });
    expect(call.costUsd).toBeCloseTo((600 * 4 + 300 * 20 + 3000 * 5) / 1_000_000, 6);
  });

  it("reads a regenerate or reject note on the blog post as soon as it is saved (γ7 handoff item 3)", async () => {
    const regenerate = await event("regenerate", { note: "Fill the guarantee in: we give a 10-year labour guarantee on every install." });
    expect(await latestRegenerateEvent(ids.post, db)).toBe(regenerate);
    const api = fakeApi({ candidates: [GUARANTEE] });
    expect(await proposeCandidates({ reviewEventId: regenerate }, { db, transport: api.transport })).toBe(1);
    expect(userOf(api.calls[0])).toContain("Amir asked the writer to redo the blog post, with this note.");
    expect(userOf(api.calls[0])).toContain('The channel: Blog post ("blog")');
    const [fact] = await db.select().from(ruleCandidates);
    expect(fact).toMatchObject({ kind: "fact", tier: "client", section: "business_facts", scope: "all", reviewEventId: regenerate, derivativeId: null, after: GUARANTEE.after });

    const reject = await event("reject", { note: "Never open a blog post with a question." });
    const rejectApi = fakeApi({ candidates: [rule({ scope: "blog", text: "Never open a blog post with a question." })] });
    expect(await proposeCandidates({ reviewEventId: reject }, { db, transport: rejectApi.transport })).toBe(1);
    expect(userOf(rejectApi.calls[0])).toContain("Amir rejected the blog post, with this note.");
    const { proposed } = await listCandidates(db);
    expect(proposed.map((row) => row.from)).toEqual(['From your reject note on "Wet room maintenance"', 'From your regenerate note on "Wet room maintenance"']);
    expect(proposed[0]).toMatchObject({ channel: "blog", scope: "blog" });
  });

  it("sends the edit a regenerate started from along with its note", async () => {
    const [version] = await db
      .insert(postVersions)
      .values({ postId: ids.post, generationId: ids.generation, version: 1, title: "Wet room maintenance", excerpt: "Keep it watertight.", bodyMd: "Check the silicone around the tray and the drain every single month.", wordCount: 12, checks: {} })
      .returning();
    const [row] = await db.insert(reviewEvents).values({ postId: ids.post, action: "regenerate", note: "Shorter.", versionId: version.id, draftId: ids.draft }).returning();
    const api = fakeApi({ candidates: [] });
    expect(await proposeCandidates({ reviewEventId: row.id }, { db, transport: api.transport })).toBe(0);
    expect(userOf(api.calls[0])).toContain("He also edited the text first:");
    expect(userOf(api.calls[0])).toContain("After: Check the silicone around the tray and the drain every single month.");
  });

  it("reads a derivative note with the version it is about, scoped to that channel (γ7 handoff item 2)", async () => {
    await linkedinVersion();
    const regenerate = await queueDerivative(ids.post, "linkedin", "Don't open with a question.", db);
    const api = fakeApi({ candidates: [rule()] });
    expect(await proposeCandidates({ derivativeId: regenerate }, { db, transport: api.transport })).toBe(1);
    const user = userOf(api.calls[0]);
    expect(user).toContain('The channel: LinkedIn post ("linkedin")');
    expect(user).toContain("Amir's note:\nDon't open with a question.");
    expect(user).toContain(`The version the note is about:\n\n${LINKEDIN}`);
    const [candidate] = await db.select().from(ruleCandidates);
    expect(candidate).toMatchObject({ derivativeId: regenerate, reviewEventId: null, scope: "linkedin", tier: "agency", section: "writing_rules" });
    const { proposed } = await listCandidates(db);
    expect(proposed[0]).toMatchObject({ channel: "linkedin", from: 'From your note on the LinkedIn post for "Wet room maintenance"' });
    // A retried run never pays twice; a first generation with no note has nothing to read.
    expect(await proposeCandidates({ derivativeId: regenerate }, { db, transport: api.transport })).toBe(0);
    const first = (await db.select().from(derivatives).orderBy(asc(derivatives.version)))[0];
    expect(await proposeCandidates({ derivativeId: first.id }, { db, transport: api.transport })).toBe(0);
    expect(api.calls).toHaveLength(1);
  });

  it("reads a derivative edit against the model version, and skips a small one at no cost (γ7 orientation Q3)", async () => {
    await linkedinVersion();
    const typo = await saveDerivativeEdit(ids.post, "linkedin", LINKEDIN.replace("silicone", "silicon"), db);
    const api = fakeApi({ candidates: [rule({ text: "Keep LinkedIn posts under 600 characters.", before: "Checking the joints", after: "" })] });
    expect(await proposeCandidates({ derivativeId: typo.derivativeId! }, { db, transport: api.transport })).toBe(0);
    expect(api.calls).toHaveLength(0);

    const edit = await saveDerivativeEdit(ids.post, "linkedin", LINKEDIN.replace("Checking the joints around the tray each month catches small leaks while they are cheap to fix.\n\n", ""), db);
    expect(await proposeCandidates({ derivativeId: edit.derivativeId! }, { db, transport: api.transport })).toBe(1);
    const user = userOf(api.calls[0]);
    expect(user).toContain("Amir edited this version before posting it.");
    expect(user).toContain("Before: Checking the joints around the tray each month catches small leaks while they are cheap to fix.");
    const { proposed } = await listCandidates(db);
    expect(proposed[0].from).toBe('From your edit to the LinkedIn post for "Wet room maintenance"');
  });

  it("accepts a LinkedIn rule into LinkedIn's own section: the next LinkedIn call gets it and the GBP call does not (γ7 handoff item 6)", async () => {
    await linkedinVersion();
    const regenerate = await queueDerivative(ids.post, "linkedin", "Don't open with a question.", db);
    await proposeCandidates({ derivativeId: regenerate }, { db, transport: fakeApi({ candidates: [rule()] }).transport });
    const [candidate] = await db.select().from(ruleCandidates);
    await acceptCandidate(candidate.id, { text: candidate.text, tier: "agency", section: "writing_rules", scope: "linkedin" }, db);
    const agency = await getCurrentKnowledge({ tier: "agency" }, db);
    expect(agency?.sections.writing_rules).toBe("- Never use em dashes.");
    expect(agency?.sections.writing_rules_linkedin).toBe(`- ${rule().text}`);
    expect((await db.select().from(ruleCandidates))[0]).toMatchObject({ status: "accepted", scope: "linkedin", section: "writing_rules" });

    const linkedin = fakeApi(LINKEDIN);
    await writeDerivative(regenerate, { db, transport: linkedin.transport });
    const gbp = fakeApi(GBP);
    await writeDerivative(await queueDerivative(ids.post, "gmb", null, db), { db, transport: gbp.transport });
    expect(instructionsOf(linkedin.calls[0])).toContain("## Rules for LinkedIn posts only");
    expect(instructionsOf(linkedin.calls[0])).toContain(rule().text);
    expect(instructionsOf(gbp.calls[0])).not.toContain(rule().text);
    // The cached pack is the same text for both, so they still share the cache.
    expect((linkedin.calls[0].system as { text: string }[])[0].text).toBe((gbp.calls[0].system as { text: string }[])[0].text);
    expect((linkedin.calls[0].system as { text: string }[])[0].text).not.toContain(rule().text);
  });

  it("lets Amir change the scope or the place before accepting, refuses a scope that cannot apply, or dismisses", async () => {
    const reject = await event("reject", { note: "Too salesy." });
    await proposeCandidates(
      { reviewEventId: reject },
      { db, transport: fakeApi({ candidates: [rule({ scope: "blog", text: "No sales language in openings." }), rule({ section: "banned_phrases", text: "elevate", scope: "all" })] }).transport },
    );
    const rows = await db.select().from(ruleCandidates).orderBy(asc(ruleCandidates.section));
    const [banned, writing] = rows;
    await expect(acceptCandidate(banned.id, { text: "elevate", tier: "agency", section: "banned_phrases", scope: "gmb" }, db)).rejects.toThrow("Only writing rules and voice can apply to one channel.");
    await expect(acceptCandidate(writing.id, { text: "x", tier: "agency", section: "writing_rules", scope: "tiktok" }, db)).rejects.toThrow("Choose which channels it applies to.");
    await acceptCandidate(writing.id, { text: "Keep openings free of sales language.", tier: "client", section: "voice", scope: "all" }, db);
    const client = await getCurrentKnowledge({ tier: "client", clientId: ids.client }, db);
    expect(client?.sections.voice).toBe("Plain and practical.\n- Keep openings free of sales language.");
    await dismissCandidate(banned.id, db);
    expect((await db.select().from(ruleCandidates).where(eq(ruleCandidates.id, banned.id)))[0].status).toBe("dismissed");
    expect(await db.select().from(knowledgeVersions).where(eq(knowledgeVersions.tier, "agency"))).toHaveLength(1);
  });

  it("skips a candidate already waiting for the same place from any source (backlog 21), but not for another client", async () => {
    const reject = await event("reject", { note: "10-year guarantee, please." });
    await proposeCandidates({ reviewEventId: reject }, { db, transport: fakeApi({ candidates: [GUARANTEE] }).transport });
    await linkedinVersion();
    const regenerate = await queueDerivative(ids.post, "linkedin", "Mention the 10-year guarantee.", db);
    const louder = { ...GUARANTEE, text: "every Migss installation carries a 10 year labour guarantee" };
    expect(await proposeCandidates({ derivativeId: regenerate }, { db, transport: fakeApi({ candidates: [louder] }).transport })).toBe(0);
    // Same text, different scope: still the same rule.
    const approve = await event("approve", { diff: HUNKS });
    const scoped = rule({ text: "Name the area in the first paragraph." });
    await db.insert(ruleCandidates).values({ reviewEventId: reject, postId: ids.post, tier: "agency", section: "writing_rules", text: scoped.text, scope: "blog" });
    expect(await proposeCandidates({ reviewEventId: approve }, { db, transport: fakeApi({ candidates: [scoped] }).transport })).toBe(0);

    const other = await createClient({ name: "Other Interiors", mainContact: null, email: null, phone: null }, db);
    const otherProject = await createProject({ clientId: other.id, name: "Other site", siteUrl: "https://other.example", status: "paused", publishingTarget: "wix_blog" }, db);
    const [otherPost] = await db.insert(posts).values({ projectId: otherProject.id, status: "rejected", slotDate: "2026-11-04", topic: "Kitchens" }).returning();
    const [otherReject] = await db.insert(reviewEvents).values({ postId: otherPost.id, action: "reject", note: "Same guarantee here." }).returning();
    expect(await proposeCandidates({ reviewEventId: otherReject.id }, { db, transport: fakeApi({ candidates: [GUARANTEE] }).transport })).toBe(1);
  });

  it("holds exactly one source per candidate (migration 0006)", async () => {
    await expect(db.insert(ruleCandidates).values({ postId: ids.post, tier: "agency", section: "writing_rules", text: "x" })).rejects.toThrow();
    await expect(db.insert(ruleCandidates).values({ postId: ids.post, tier: "agency", section: "writing_rules", text: "x", scope: "tiktok" as never, reviewEventId: await event("reject", { note: "n" }) })).rejects.toThrow();
  });

  it("keeps what a run could not store, with the reason, on its call (backlog 24)", async () => {
    const reject = await event("reject", { note: "10-year guarantee, please." });
    await proposeCandidates({ reviewEventId: reject }, { db, transport: fakeApi({ candidates: [GUARANTEE] }).transport });
    const [waiting] = await db.select().from(ruleCandidates);
    const [clean] = await db.select().from(aiCalls);
    expect(clean.unstored).toBeNull();

    const again = await event("reject", { note: "Again: the guarantee." });
    const reply = { candidates: [GUARANTEE, rule({ tier: "agency", section: "business_facts", text: "Wrong place." }), rule({ text: "  " })] };
    expect(await proposeCandidates({ reviewEventId: again }, { db, transport: fakeApi(reply).transport })).toBe(0);
    const [, call] = await db.select().from(aiCalls).orderBy(asc(aiCalls.createdAt));
    expect(call.unstored?.dropped?.map((item) => [item.reason, item.matched ?? null])).toEqual([
      [DROP_REASONS.waiting, waiting.id],
      [DROP_REASONS.badPlace, null],
      [DROP_REASONS.empty, null],
    ]);
    expect((call.unstored?.dropped?.[0].candidate as { text: string }).text).toBe(GUARANTEE.text);
    expect(unstoredNote(call.unstored)).toBe(" (3 not added: already waiting, not a place a suggestion can go, empty text)");
  });

  it("keeps a reply it cannot read, cut to 20,000 characters, and names it on the cost line (backlog 24)", async () => {
    const reject = await event("reject", { note: "Anything." });
    const garbled = `not json ${"x".repeat(25_000)}`;
    await expect(proposeCandidates({ reviewEventId: reject }, { db, transport: fakeApi(garbled).transport })).rejects.toThrow("returned a reply that is not JSON.");
    const [call] = await db.select().from(aiCalls);
    expect(call.error).toBe("claude-opus-5-5 returned a reply that is not JSON.");
    expect(call.unstored?.raw).toHaveLength(20_000);
    expect(call.unstored?.raw?.startsWith("not json")).toBe(true);
    expect(unstoredNote(call.unstored)).toBe(" (reply could not be read; it is kept on the call)");
    expect(unstoredNote(null)).toBe("");
  });
});
