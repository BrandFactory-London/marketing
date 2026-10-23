import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import { aiCalls, batches, derivatives, postDrafts, postGenerations, posts, postSpecs } from "@/db/schema";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import * as derivativePrompt from "@/prompts/derivative";
import type { Transport } from "./ai/client";
import { runChecks } from "./checks";
import { createClient } from "./clients";
import { checkDerivative, findPhoneNumbers } from "./derivative-checks";
import { DerivativeError, queueDerivative, saveDerivativeEdit, writeDerivative } from "./derivatives";
import { createProject } from "./projects";
import { saveKnowledge } from "./knowledge";

const URL = "https://www.migssinteriors.com/blog/wet-room-maintenance";
const GMB = "A wet room stays watertight when the seals are looked after. Check the silicone around the tray every month and clear the drain of hair and soap each week. Small leaks are cheap to fix when caught early. Read the full guide for a week by week routine.";
const LINKEDIN = `Most wet room leaks start at the silicone, not the tiles.\n\nChecking the joints around the tray each month catches small leaks while they are cheap to fix.\n\nRead the full guide:\n${URL}\n\n#WetRooms #BathroomDesign`;

describe("derivative checks (γ6 orientation Q6, as amended)", () => {
  const opts = { bannedPhrases: ["dream bathroom"], postUrl: URL };

  it("passes clean GMB and LinkedIn copy", () => {
    expect(checkDerivative(GMB, "gmb", opts)).toMatchObject({ passed: true, issues: [] });
    expect(checkDerivative(LINKEDIN, "linkedin", opts)).toMatchObject({ passed: true, issues: [] });
  });

  it("fails a GMB post with a phone number in the text, in any common UK form", () => {
    for (const phone of ["020 8500 1234", "07700 900123", "+44 20 8500 1234", "(020) 8500-1234"]) {
      const result = checkDerivative(`${GMB} Call ${phone} today.`, "gmb", opts);
      expect(result.issues.map((issue) => issue.check), phone).toContain("phone");
    }
  });

  it("does not mistake prices, years or sizes for a phone number", () => {
    expect(findPhoneNumbers("From £8,000 to £12,000 in 2026, a 10-year guarantee, 1200 x 800 mm trays.")).toEqual([]);
  });

  it("fails a GMB post with a link, hashtags or Markdown", () => {
    const result = checkDerivative(`**Wet rooms** ${GMB} See ${URL}. #WetRooms`, "gmb", opts);
    expect(result.issues.map((issue) => issue.check)).toEqual(expect.arrayContaining(["link", "hashtags", "markdown"]));
  });

  it("fails LinkedIn copy without the post's link, with another link, or with too many hashtags", () => {
    expect(checkDerivative(LINKEDIN.replace(URL, ""), "linkedin", opts).issues.map((issue) => issue.message)).toContain(`The post's link (${URL}) is missing.`);
    expect(checkDerivative(`${LINKEDIN} https://example.com`, "linkedin", opts).issues.map((issue) => issue.check)).toContain("link");
    expect(checkDerivative(`${LINKEDIN} #A #B`, "linkedin", opts).issues.map((issue) => issue.message)).toContain("4 hashtags; use at most 3.");
    // The link may differ in www, scheme or a trailing slash.
    expect(checkDerivative(LINKEDIN.replace(URL, "migssinteriors.com/blog/wet-room-maintenance/"), "linkedin", opts).passed).toBe(false);
    expect(checkDerivative(LINKEDIN.replace(URL, "https://migssinteriors.com/blog/wet-room-maintenance/"), "linkedin", opts).passed).toBe(true);
  });

  it("fails over each platform's limit, dashes, banned phrases and placeholders", () => {
    expect(checkDerivative("x".repeat(1501), "gmb", opts).issues[0].message).toBe("1,501 characters; GMB posts take at most 1,500.");
    expect(checkDerivative(`${LINKEDIN} ${"y".repeat(3000)}`, "linkedin", opts).issues.map((issue) => issue.check)).toContain("length");
    const dashed = checkDerivative(`${GMB} Your dream bathroom — sorted [CONFIRM: price].`, "gmb", opts);
    expect(dashed.issues.map((issue) => issue.check)).toEqual(expect.arrayContaining(["em_dash", "banned", "placeholder"]));
  });

  it("tells the writer to leave contact details to the call button", () => {
    expect(derivativePrompt.derivativeUserMessage({ channel: "gmb", title: "T", excerpt: "E", body: "B", postUrl: URL, note: null })).toContain("leave contact to the call button");
  });
});

describe.skipIf(!testDatabaseUrl)("derivatives (local Postgres)", () => {
  const { db, close } = createTestDb();
  let postId: string;
  afterAll(close);

  function fakeApi(replies: string[]) {
    const calls: MessageCreateParamsNonStreaming[] = [];
    const transport: Transport = async (params) => {
      calls.push(params);
      const text = replies[Math.min(calls.length - 1, replies.length - 1)];
      const message = {
        id: "msg",
        type: "message",
        role: "assistant",
        model: params.model,
        content: [{ type: "text", text, citations: null }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 2500, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000 },
      } as unknown as Message;
      return { message, requestId: `req_${calls.length}` };
    };
    return { transport, calls };
  }

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject({ clientId: client.id, name: "Migss website", siteUrl: "https://www.migssinteriors.com", package: "entry", status: "paused", publishingTarget: "wix_blog" }, db);
    await saveKnowledge({ tier: "agency" }, { banned_phrases: "- dream bathroom" }, db);
    const [batch] = await db
      .insert(batches)
      .values({ projectId: project.id, name: "N", lengthMin: 20, lengthMax: 200, cta: "Book", faqMode: "never", writerModel: "claude-opus-5-5", criticModel: "claude-opus-5-5", derivativeModel: "claude-opus-5-5" })
      .returning();
    const [post] = await db.insert(posts).values({ projectId: project.id, status: "approved", slotDate: "2026-11-03", topic: "Wet rooms", batchId: batch.id, slug: "wet-room-maintenance" }).returning();
    const [spec] = await db.insert(postSpecs).values({ postId: post.id, batchId: batch.id, version: 1, status: "confirmed", lengthMin: 20, lengthMax: 200, cta: "Book", faq: false }).returning();
    const [generation] = await db.insert(postGenerations).values({ postId: post.id, specId: spec.id, batchId: batch.id, status: "in_review", round: 1 }).returning();
    const markdown = "# Wet room maintenance\n\nExcerpt: Keep it watertight.\n\nCheck the silicone every month.\n";
    const checks = runChecks({ markdown, lengthMin: 1, lengthMax: 200, faq: false, allowedLinks: [], bannedPhrases: [] });
    await db.insert(postDrafts).values({ generationId: generation.id, round: 1, title: "Wet room maintenance", excerpt: "Keep it watertight.", bodyMd: markdown, wordCount: checks.wordCount, checks, checksPassed: true });
    postId = post.id;
  });

  it("writes a GMB post from the approved text, with its link and cost recorded", async () => {
    const id = await queueDerivative(postId, "gmb", null, db);
    const api = fakeApi([GMB]);
    expect((await writeDerivative(id, { db, transport: api.transport }))?.passed).toBe(true);
    const [row] = await db.select().from(derivatives).where(eq(derivatives.id, id));
    expect(row).toMatchObject({ status: "ready", source: "model", version: 1, body: GMB });
    const user = api.calls[0].messages[0].content as string;
    expect(user).toContain(`The article's link: ${URL}`);
    expect(user).toContain("Check the silicone every month.");
    const [call] = await db.select().from(aiCalls).where(eq(aiCalls.id, row.aiCallId!));
    expect(call).toMatchObject({ purpose: "derivative", promptVersion: "derivative-1", effort: "medium", postId });
    expect(call.costUsd).toBeGreaterThan(0);
    // A retried run does not pay twice.
    expect(await writeDerivative(id, { db, transport: api.transport })).toBeNull();
    expect(api.calls).toHaveLength(1);
  });

  it("sends a failing version back once with its issues, then keeps what it has", async () => {
    const id = await queueDerivative(postId, "gmb", null, db);
    const api = fakeApi([`${GMB} Call 020 8500 1234.`, GMB]);
    expect((await writeDerivative(id, { db, transport: api.transport }))?.passed).toBe(true);
    expect(api.calls).toHaveLength(2);
    expect(api.calls[1].messages[0].content as string).toContain("Google rejects posts with a phone number");

    const second = await queueDerivative(postId, "gmb", "Lead with the drain.", db);
    const stubborn = fakeApi([`${GMB} Call 020 8500 1234.`]);
    const checks = await writeDerivative(second, { db, transport: stubborn.transport });
    expect(stubborn.calls).toHaveLength(2);
    expect(checks?.passed).toBe(false);
    const [row] = await db.select().from(derivatives).where(eq(derivatives.id, second));
    expect(row).toMatchObject({ status: "ready", version: 2, note: "Lead with the drain." });
    expect(stubborn.calls[0].messages[0].content as string).toContain("Amir's note for this version: Lead with the drain.");
  });

  it("refuses a second run while one is writing, and keeps every version", async () => {
    await queueDerivative(postId, "linkedin", null, db);
    await expect(queueDerivative(postId, "linkedin", null, db)).rejects.toThrow("The LinkedIn post is already being written.");
    await expect(saveDerivativeEdit(postId, "linkedin", LINKEDIN, db)).rejects.toThrow(DerivativeError);
    await db.update(derivatives).set({ status: "ready", body: LINKEDIN });
    await saveDerivativeEdit(postId, "linkedin", `${LINKEDIN}\n`, db);
    expect(await db.select().from(derivatives).orderBy(asc(derivatives.version))).toHaveLength(1);
    await saveDerivativeEdit(postId, "linkedin", LINKEDIN.replace("Most", "Nearly all"), db);
    const rows = await db.select().from(derivatives).orderBy(asc(derivatives.version));
    expect(rows.map((row) => [row.version, row.source])).toEqual([
      [1, "model"],
      [2, "edit"],
    ]);
  });

  it("only writes copy for approved or published posts", async () => {
    await db.update(posts).set({ status: "in_review" }).where(eq(posts.id, postId));
    await expect(queueDerivative(postId, "gmb", null, db)).rejects.toThrow("GMB and LinkedIn posts are written from approved or published posts.");
  });
});
