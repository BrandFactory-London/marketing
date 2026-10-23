import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { batches, postDrafts, postGenerations, postPublications, posts, postSpecs, projectPillars, publishEvents } from "@/db/schema";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { runChecks } from "./checks";
import { createClient } from "./clients";
import { decodeEntities, fetchPage, readPage, runLiveCheck } from "./live-check";
import { createProject } from "./projects";

const TITLE = "Wet room maintenance: what’s worth doing week by week";
const EXCERPT = "How to keep a wet room watertight & tidy, week by week.";
const FILE = "8bde49_cover-1~mv2.jpg";

// Modelled on a real Migss post page (read 23 Oct 2026): the title in <h1> and <title>, the excerpt as the meta
// description, the cover as og:image, the tag label on the page.
function page(title = TITLE) {
  const html = (text: string) => text.replace(/&/g, "&amp;").replace(/’/g, "&#x27;");
  return `<!DOCTYPE html><html><head><title>${html(title)} | Migss Interiors</title>
<meta name="description" content="${html(EXCERPT)}"/><meta property="og:image" content="https://static.wixstatic.com/media/${FILE}"/></head>
<body><p class="x">Bathroom Renovation</p><h1 class="text-4xl">${html(title)}</h1><p>Body</p></body></html>`;
}

const EXPECTED = { title: TITLE, excerpt: EXCERPT, wixFileId: FILE, tagLabel: "Bathroom Renovation" };

describe("reading the live page (γ6 orientation Q5)", () => {
  it("finds the title through entities and curly quotes, and records what else it saw", () => {
    expect(readPage(page(), EXPECTED)).toEqual({ titleFound: true, seen: { h1: true, titleTag: true, metaDescription: true, cover: true, tag: true } });
  });

  it("does not confirm a page without the title", () => {
    const reading = readPage(page("Another post"), EXPECTED);
    expect(reading.titleFound).toBe(false);
    expect(reading.seen.h1).toBe(false);
  });

  it("decodes named and numeric entities", () => {
    expect(decodeEntities("Tom &amp; Jerry&#39;s &#x27;wet&#x27; room &pound;8k")).toBe("Tom & Jerry's 'wet' room £8k");
  });

  it("follows redirects from the bare domain to www", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.startsWith("https://migssinteriors.com/")) return new Response(null, { status: 308, headers: { location: url.replace("https://", "https://www.") } });
      return new Response(page(), { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const result = await fetchPage("https://migssinteriors.com/blog/wet-rooms", fetchImpl);
    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe("https://www.migssinteriors.com/blog/wet-rooms");
    expect(seen).toEqual(["https://migssinteriors.com/blog/wet-rooms", "https://www.migssinteriors.com/blog/wet-rooms"]);
  });
});

describe.skipIf(!testDatabaseUrl)("the live check (local Postgres)", () => {
  const { db, close } = createTestDb();
  let ids: { post: string; publication: string };
  afterAll(close);

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss website", siteUrl: "https://migssinteriors.com", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    const [pillar] = await db.insert(projectPillars).values({ projectId: project.id, label: "Bathroom Renovation", slug: "bathroom-renovation" }).returning();
    const [batch] = await db
      .insert(batches)
      .values({ projectId: project.id, name: "N", lengthMin: 20, lengthMax: 200, cta: "Book", faqMode: "never", writerModel: "claude-opus-5-5", criticModel: "claude-opus-5-5", derivativeModel: "claude-opus-5-5" })
      .returning();
    const [post] = await db
      .insert(posts)
      .values({ projectId: project.id, status: "approved", slotDate: "2026-11-03", topic: "Wet rooms", batchId: batch.id, pillarId: pillar.id, slug: "wet-rooms" })
      .returning();
    const [spec] = await db.insert(postSpecs).values({ postId: post.id, batchId: batch.id, version: 1, status: "confirmed", lengthMin: 20, lengthMax: 200, cta: "Book", faq: false }).returning();
    const [generation] = await db.insert(postGenerations).values({ postId: post.id, specId: spec.id, batchId: batch.id, status: "in_review", round: 1 }).returning();
    const markdown = `# ${TITLE}\n\nExcerpt: ${EXCERPT}\n\nBody text.\n`;
    const checks = runChecks({ markdown, lengthMin: 1, lengthMax: 200, faq: false, allowedLinks: [], bannedPhrases: [] });
    await db.insert(postDrafts).values({ generationId: generation.id, round: 1, title: TITLE, excerpt: EXCERPT, bodyMd: markdown, wordCount: checks.wordCount, checks, checksPassed: true });
    const [publication] = await db
      .insert(postPublications)
      .values({ postId: post.id, state: "checking", step: "live", wixFileId: FILE, wixPostId: "post-1", wixSlug: "wet-rooms", liveUrl: "https://migssinteriors.com/blog/wet-rooms", checkStartedAt: new Date() })
      .returning();
    ids = { post: post.id, publication: publication.id };
  });

  // A clock that moves on by each sleep, so 5 minutes of looks run instantly.
  function clock() {
    let now = 0;
    return { now: () => now, sleep: async (ms: number) => void (now += ms) };
  }

  it("keeps looking while the blog has not refreshed, then marks the post Published with the URL it ended on", async () => {
    let looks = 0;
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (!url.includes("www.")) return new Response(null, { status: 301, headers: { location: url.replace("https://", "https://www.") } });
      looks++;
      return looks < 3 ? new Response("Not found", { status: 404 }) : new Response(page(), { status: 200 });
    }) as typeof fetch;
    const result = await runLiveCheck(ids.publication, { db, fetchImpl, ...clock() });
    expect(result).toEqual({ confirmed: true, attempts: 3, lastStatus: 200, finalUrl: "https://www.migssinteriors.com/blog/wet-rooms", reason: null });
    const [post] = await db.select().from(posts).where(eq(posts.id, ids.post));
    expect(post.status).toBe("published");
    expect(post.liveUrl).toBe("https://www.migssinteriors.com/blog/wet-rooms");
    expect(post.publishedAt).toBeInstanceOf(Date);
    const [publication] = await db.select().from(postPublications).where(eq(postPublications.id, ids.publication));
    expect(publication.state).toBe("live");
    const [event] = await db.select().from(publishEvents).where(eq(publishEvents.publicationId, ids.publication));
    expect(event).toMatchObject({ step: "live", result: "ok", message: "The live page shows the title (after 3 looks)." });
    expect(event.details).toMatchObject({ seen: { h1: true, titleTag: true, metaDescription: true, cover: true, tag: true } });
  });

  it("never marks Published when the title does not appear within 5 minutes", async () => {
    let looks = 0;
    const fetchImpl = (async () => (looks++, new Response(page("An older post"), { status: 200 }))) as typeof fetch;
    const result = await runLiveCheck(ids.publication, { db, fetchImpl, ...clock() });
    expect(result.confirmed).toBe(false);
    expect(looks).toBe(15);
    const [post] = await db.select().from(posts).where(eq(posts.id, ids.post));
    expect(post.status).toBe("approved");
    const [publication] = await db.select().from(postPublications).where(eq(postPublications.id, ids.publication));
    expect(publication.state).toBe("not_confirmed");
    expect(publication.error).toBe("Wix accepted this post, but the live page did not show it within 5 minutes: the page loaded, but the post's title was not on it.");
  });

  it("reports a page it could not reach", async () => {
    const fetchImpl = (async () => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    const result = await runLiveCheck(ids.publication, { db, fetchImpl, ...clock(), budgetMs: 40_000 });
    expect(result).toMatchObject({ confirmed: false, attempts: 2, reason: "the page could not be reached (fetch failed)" });
  });

  it("does nothing for a publication that is not being checked", async () => {
    await db.update(postPublications).set({ state: "failed" }).where(eq(postPublications.id, ids.publication));
    const fetchImpl = (async () => {
      throw new Error("should not fetch");
    }) as typeof fetch;
    expect((await runLiveCheck(ids.publication, { db, fetchImpl, ...clock() })).attempts).toBe(0);
  });
});
