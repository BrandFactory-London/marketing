import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { batches, postDrafts, postGenerations, posts, postSpecs, postVersions, reviewEvents, sitePages } from "@/db/schema";
import { createClient } from "./clients";
import { createProject } from "./projects";
import { saveKnowledge } from "./knowledge";
import { runChecks } from "./checks";
import { editHunks } from "./edit-diff";
import { approvalState, composeMarkdown, slugFormatProblem, slugify, splitDraft } from "./review-rules";
import { approvePost, currentText, rejectPost, reopenPost, ReviewError, savePublishingDetails, saveVersion } from "./review";

// The production smoke post's placeholders (γ5 orientation approval).
const SMOKE_BODY =
  "[CONFIRM: Migss wet room specialism wording] We use our own tradespeople [CONFIRM], and specialist oversight is included in every Migss quote.\n\n" +
  "Every installation carries a 10-year labour guarantee [CONFIRM].\n\n" +
  "Plain words here. ".repeat(12) +
  "\n\n## Book a consultation\n\n[Contact us](/contact).";
const DRAFT = `# Wet room maintenance\n\nExcerpt: How to keep a wet room watertight.\n\n${SMOKE_BODY}\n`;

describe("review rules (pure)", () => {
  it("splits a draft into title, excerpt and body, and puts it back together", () => {
    const text = splitDraft(DRAFT);
    expect(text.title).toBe("Wet room maintenance");
    expect(text.excerpt).toBe("How to keep a wet room watertight.");
    expect(text.body.startsWith("[CONFIRM: Migss wet room")).toBe(true);
    expect(splitDraft(composeMarkdown(text))).toEqual(text);
  });

  it("blocks Approve on placeholders, dashes and banned phrases, and only warns on the rest", () => {
    const check = (markdown: string) =>
      approvalState(markdown, runChecks({ markdown, lengthMin: 1, lengthMax: 30, faq: false, allowedLinks: ["/contact"], bannedPhrases: [] }));
    const smoke = check(DRAFT);
    expect(smoke.placeholders.map((item) => item.text)).toEqual(["[CONFIRM: Migss wet room specialism wording]", "[CONFIRM]", "[CONFIRM]"]);
    expect(smoke.canApprove).toBe(false);
    expect(smoke.reason).toBe("Fill in 3 placeholders to approve.");
    expect(smoke.warnings.map((issue) => issue.check)).toEqual(["length"]);

    const filled = DRAFT.replace("[CONFIRM: Migss wet room specialism wording] ", "").replaceAll(" [CONFIRM]", "");
    expect(check(filled).canApprove).toBe(true);
    const dashed = check(filled.replace("Plain words", "Plain \u2014 words"));
    expect(dashed.canApprove).toBe(false);
    expect(dashed.reason).toBe("Remove 1 dash or banned phrase to approve.");
    expect(check(filled.replace("Plain words", "Seamless words")).blocking.map((issue) => issue.check)).toEqual(["banned"]);
  });

  it("makes slugs Wix accepts", () => {
    expect(slugify("Wet room or shower tray: which suits your bathroom?")).toBe("wet-room-or-shower-tray-which-suits-your-bathroom");
    expect(slugify("Kitchens & bathrooms in Chigwell’s homes")).toBe("kitchens-and-bathrooms-in-chigwells-homes");
    expect(slugify("a ".repeat(60)).length).toBeLessThanOrEqual(80);
    expect(slugFormatProblem("Wet-Room")).toMatch(/lower-case/);
    expect(slugFormatProblem("wet--room")).toMatch(/single hyphens/);
    expect(slugFormatProblem("wet-room")).toBeNull();
  });

  it("records each edit as a before and after pair", () => {
    const writer = "One sentence stays. Two is old. Three stays.";
    const amir = "One sentence stays. Two is new. Three stays.";
    expect(editHunks(writer, amir)).toEqual([{ before: "Two is old.", after: "Two is new." }]);
    expect(editHunks(writer, writer)).toEqual([]);
  });
});

describe.skipIf(!testDatabaseUrl)("review (local Postgres)", () => {
  const { db, close } = createTestDb();
  afterAll(close);
  let ids: { post: string; project: string; generation: string; draft: string };

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss website", siteUrl: "https://www.migss.co.uk", package: "entry", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    await saveKnowledge({ tier: "project", projectId: project.id }, { allowed_links: "/contact" }, db);
    const [batch] = await db
      .insert(batches)
      .values({ projectId: project.id, name: "N", lengthMin: 20, lengthMax: 200, cta: "Book", faqMode: "never", writerModel: "claude-opus-5-5", criticModel: "claude-opus-5-5", derivativeModel: "claude-opus-5-5" })
      .returning();
    const [post] = await db.insert(posts).values({ projectId: project.id, status: "in_review", slotDate: "2026-11-03", topic: "Wet room maintenance", batchId: batch.id }).returning();
    const [spec] = await db
      .insert(postSpecs)
      .values({ postId: post.id, batchId: batch.id, version: 1, status: "confirmed", lengthMin: 20, lengthMax: 200, cta: "Book", faq: false })
      .returning();
    const [generation] = await db.insert(postGenerations).values({ postId: post.id, specId: spec.id, batchId: batch.id, status: "in_review", round: 1 }).returning();
    const checks = runChecks({ markdown: DRAFT, lengthMin: 20, lengthMax: 200, faq: false, allowedLinks: ["/contact"], bannedPhrases: [] });
    const [draft] = await db
      .insert(postDrafts)
      .values({ generationId: generation.id, round: 1, title: "Wet room maintenance", excerpt: checks.excerpt, bodyMd: DRAFT, wordCount: checks.wordCount, checks, checksPassed: true })
      .returning();
    ids = { post: post.id, project: project.id, generation: generation.id, draft: draft.id };
  });

  const post = async () => (await db.select().from(posts).where(eq(posts.id, ids.post)))[0];
  const filled = () => {
    const text = splitDraft(DRAFT);
    return { ...text, body: text.body.replace("[CONFIRM: Migss wet room specialism wording] ", "").replace(" [CONFIRM],", ",").replace("guarantee [CONFIRM].", "guarantee.") };
  };

  it("shows the writer's draft until Amir saves, then his newest version; the draft is never changed", async () => {
    expect((await currentText(ids.post, db))?.source.kind).toBe("draft");
    expect((await saveVersion(ids.post, splitDraft(DRAFT), db)).saved).toBe(false);
    expect((await saveVersion(ids.post, filled(), db)).saved).toBe(true);
    const edited = { ...filled(), title: "Looking after a wet room" };
    await saveVersion(ids.post, edited, db);
    const current = await currentText(ids.post, db);
    expect(current?.source.kind).toBe("version");
    expect(current?.text.title).toBe("Looking after a wet room");
    expect((await db.select().from(postVersions).orderBy(asc(postVersions.version))).map((row) => row.version)).toEqual([1, 2]);
    expect((await db.select().from(postDrafts).where(eq(postDrafts.id, ids.draft)))[0].bodyMd).toBe(DRAFT);
  });

  it("refuses to approve the smoke post while its placeholders remain, then approves it once they are filled", async () => {
    await expect(approvePost(ids.post, splitDraft(DRAFT), db)).rejects.toThrow("Fill in 3 placeholders to approve.");
    expect((await post()).status).toBe("in_review");

    const result = await approvePost(ids.post, filled(), db);
    expect(result.hasEdits).toBe(true);
    const approved = await post();
    expect(approved.status).toBe("approved");
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.slug).toBe("wet-room-maintenance");
    const [event] = await db.select().from(reviewEvents).where(eq(reviewEvents.id, result.reviewEventId));
    expect(event.action).toBe("approve");
    expect(event.draftId).toBe(ids.draft);
    expect(event.diff?.[0].before).toContain("[CONFIRM: Migss wet room specialism wording]");
    expect(event.warnings).toEqual([]);
  });

  it("locks the text once approved, and Reopen for editing brings it back to Needs review", async () => {
    await approvePost(ids.post, filled(), db);
    await expect(saveVersion(ids.post, { ...filled(), title: "Changed" }, db)).rejects.toThrow("Reopen it for editing first.");
    await reopenPost(ids.post, db);
    const reopened = await post();
    expect(reopened.status).toBe("in_review");
    expect(reopened.approvedAt).toBeNull();
    expect((await saveVersion(ids.post, { ...filled(), title: "Changed" }, db)).saved).toBe(true);
    await db.update(posts).set({ status: "published" }).where(eq(posts.id, ids.post));
    await expect(reopenPost(ids.post, db)).rejects.toThrow("Published posts cannot be reopened.");
  });

  it("rejects with a note, and needs one", async () => {
    await expect(rejectPost(ids.post, "  ", db)).rejects.toThrow(ReviewError);
    await rejectPost(ids.post, "Wrong angle for this month.", db);
    expect((await post()).status).toBe("rejected");
    const [event] = await db.select().from(reviewEvents).where(eq(reviewEvents.postId, ids.post));
    expect(event).toMatchObject({ action: "reject", note: "Wrong angle for this month." });
  });

  it("keeps slugs unique in the project and off existing site pages", async () => {
    await savePublishingDetails(ids.post, { slug: "wet-room-care", pillarId: null }, db);
    expect((await post()).slug).toBe("wet-room-care");
    const [other] = await db.insert(posts).values({ projectId: ids.project, status: "in_review", slotDate: "2026-11-05", topic: "Other" }).returning();
    await expect(savePublishingDetails(other.id, { slug: "wet-room-care", pillarId: null }, db)).rejects.toThrow("already uses this slug");
    await db.insert(sitePages).values({ projectId: ids.project, url: "https://www.migss.co.uk/blog/tiling", path: "/blog/tiling", title: "Tiling" });
    await expect(savePublishingDetails(other.id, { slug: "tiling", pillarId: null }, db)).rejects.toThrow("A page on the site already uses this address.");
    await expect(savePublishingDetails(other.id, { slug: "Bad Slug", pillarId: null }, db)).rejects.toThrow("lower-case");
  });
});
