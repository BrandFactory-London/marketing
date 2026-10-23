import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { batches, googleTokens, postDrafts, postGenerations, postPublications, posts, postSpecs, projects, publishEvents, users } from "@/db/schema";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { FAKE_ACCOUNT, FAKE_KEY, FAKE_SITE, fakeWix } from "@/test/fake-wix";
import { runChecks } from "./checks";
import { createClient } from "./clients";
import { prepareCover, SINGLE_UPLOAD_MAX_BYTES } from "./cover-image";
import { encrypt } from "./crypto";
import { addPillar } from "./pillars";
import { createProject } from "./projects";
import { getPublication, publishPlan, publishPost, PublishError, restartLiveCheck, STALE_PUBLISH_MS } from "./publish";
import { reopenPost, ReviewError, savePublishingDetails } from "./review";
import { chooseWixMember, saveWixCredentials } from "./wix-credentials";

const SITE = "https://www.migssinteriors.com";
const BODY = "Wet rooms need care.\n\n## Week one\n\n- Check the **silicone**\n- Clear the drain\n\n## Book a visit\n\n[Contact us](/contact).";
const DRAFT = `# Wet room maintenance week by week\n\nExcerpt: How to keep a wet room watertight, week by week.\n\n${BODY}\n`;
const FOLDER = "application/vnd.google-apps.folder";

// A fake Drive holding the project folder, a Bathrooms subfolder and one photo.
function fakeDrive(photo: Uint8Array) {
  const downloads: string[] = [];
  const files = [
    { id: "root-migss", name: "Migss Interiors", mimeType: FOLDER, parents: ["my-drive"] },
    { id: "f-bathrooms", name: "Bathrooms", mimeType: FOLDER, parents: ["root-migss"] },
    { id: "img-bath-01", name: "bath-01.jpg", mimeType: "image/jpeg", parents: ["f-bathrooms"] },
  ];
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    const match = /\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    const file = match ? files.find((item) => item.id === decodeURIComponent(match[1])) : undefined;
    if (!file) return new Response("{}", { status: 404 });
    if (url.searchParams.get("alt") === "media") {
      downloads.push(file.id);
      return new Response(Buffer.from(photo), { headers: { "content-type": "image/jpeg", "content-length": String(photo.byteLength) } });
    }
    return Response.json(file);
  }) as typeof fetch;
  return { fetchImpl, downloads };
}

describe.skipIf(!testDatabaseUrl)("publish to Wix (γ6 orientation Q3, Q4)", () => {
  const { db, close } = createTestDb();
  const userId = "publish-test-user";
  let ids: { post: string; project: string };
  let liveChecks: string[];
  const photo = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);

  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  });
  afterAll(close);

  beforeEach(async () => {
    liveChecks = [];
    await resetDomainTables(db);
    await db.delete(googleTokens).where(eq(googleTokens.userId, userId));
    await db.insert(users).values({ id: userId, email: "publish-test@example.com" }).onConflictDoNothing();
    await db.insert(googleTokens).values({
      userId,
      refreshTokenEnc: encrypt("refresh", `google-refresh-token:${userId}`),
      accessTokenEnc: encrypt("access", `google-access-token:${userId}`),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      scope: "drive.readonly",
    });
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject({ clientId: client.id, name: "Migss website", siteUrl: SITE, package: "entry", status: "paused", publishingTarget: "wix_blog" }, db);
    await db.update(projects).set({ driveFolderId: "root-migss", driveFolderName: "Migss Interiors" }).where(eq(projects.id, project.id));
    const pillar = await addPillar(project.id, { label: "Bathroom Renovation", slug: "bathroom-renovation" }, db);
    await saveWixCredentials(project.id, { apiKey: FAKE_KEY, accountId: FAKE_ACCOUNT, siteId: FAKE_SITE }, db);
    await chooseWixMember(project.id, "fa29eebd-77ca-40d3-a742-64c80d431737", { db, fetchImpl: fakeWix().fetchImpl });
    const [batch] = await db
      .insert(batches)
      .values({ projectId: project.id, name: "N", lengthMin: 20, lengthMax: 200, cta: "Book", faqMode: "never", writerModel: "claude-opus-5-5", criticModel: "claude-opus-5-5", derivativeModel: "claude-opus-5-5" })
      .returning();
    const [post] = await db
      .insert(posts)
      .values({
        projectId: project.id,
        status: "approved",
        slotDate: "2026-11-03",
        topic: "Wet room maintenance",
        batchId: batch.id,
        pillarId: pillar.id,
        slug: "wet-room-maintenance-week-by-week",
        coverDriveFileId: "img-bath-01",
        coverName: "bath-01.jpg",
        coverPath: "Migss Interiors / Bathrooms",
        approvedAt: new Date(),
      })
      .returning();
    const [spec] = await db.insert(postSpecs).values({ postId: post.id, batchId: batch.id, version: 1, status: "confirmed", lengthMin: 20, lengthMax: 200, cta: "Book", faq: false }).returning();
    const [generation] = await db.insert(postGenerations).values({ postId: post.id, specId: spec.id, batchId: batch.id, status: "in_review", round: 1 }).returning();
    const checks = runChecks({ markdown: DRAFT, lengthMin: 20, lengthMax: 200, faq: false, allowedLinks: ["/contact"], bannedPhrases: [] });
    await db.insert(postDrafts).values({ generationId: generation.id, round: 1, title: "Wet room maintenance week by week", excerpt: checks.excerpt, bodyMd: DRAFT, wordCount: checks.wordCount, checks, checksPassed: true });
    ids = { post: post.id, project: project.id };
  });

  const deps = (wix: ReturnType<typeof fakeWix>, drive = fakeDrive(photo)) => ({
    db,
    wixFetch: wix.fetchImpl,
    googleFetch: drive.fetchImpl,
    startLiveCheck: async (publicationId: string) => {
      liveChecks.push(publicationId);
      return `run_${liveChecks.length}`;
    },
  });
  const events = async () => {
    const publication = await getPublication(ids.post, db);
    if (!publication) return [];
    const rows = await db.select().from(publishEvents).where(eq(publishEvents.publicationId, publication.id)).orderBy(asc(publishEvents.createdAt));
    return rows.map((row) => `${row.step}:${row.result}`);
  };

  it("uploads the cover, finds the tag, creates the draft, publishes it, and starts the live check", async () => {
    const wix = fakeWix();
    const drive = fakeDrive(photo);
    const outcome = await publishPost(ids.post, userId, deps(wix, drive));
    expect(outcome).toEqual({ ok: true, liveUrl: `${SITE}/blog/wet-room-maintenance-week-by-week` });
    expect(await events()).toEqual(["cover:ok", "tag:ok", "draft:ok", "publish:ok"]);
    expect(drive.downloads).toEqual(["img-bath-01"]);
    expect(wix.state.files).toEqual([{ id: expect.stringMatching(/~mv2\.jpg$/), name: "bath-01.jpg", size: photo.byteLength, mimeType: "image/jpeg" }]);
    const sent = wix.state.drafts[0].body as { draftPost: Record<string, unknown>; publish: boolean };
    expect(sent.publish).toBe(false);
    expect(sent.draftPost).toMatchObject({
      title: "Wet room maintenance week by week",
      memberId: "fa29eebd-77ca-40d3-a742-64c80d431737",
      tagIds: ["tag-bath"],
      excerpt: "How to keep a wet room watertight, week by week.",
      seoSlug: "wet-room-maintenance-week-by-week",
      media: { wixMedia: { image: { id: wix.state.files[0].id } }, displayed: true, custom: true },
    });
    expect((sent.draftPost.richContent as { nodes: { type: string }[] }).nodes.map((node) => node.type)).toEqual(["PARAGRAPH", "HEADING", "BULLETED_LIST", "HEADING", "PARAGRAPH"]);
    expect(wix.state.posts).toHaveLength(1);
    const publication = await getPublication(ids.post, db);
    expect(publication).toMatchObject({ state: "checking", step: "live", wixPostId: wix.state.posts[0].id, wixSlug: "wet-room-maintenance-week-by-week", triggerRunId: "run_1" });
    expect(liveChecks).toEqual([publication!.id]);
    // Not Published until the live check sees it.
    expect((await db.select().from(posts).where(eq(posts.id, ids.post)))[0].status).toBe("approved");
  });

  it("locks the text, the details and Reopen once Wix has a draft", async () => {
    await publishPost(ids.post, userId, deps(fakeWix()));
    await expect(reopenPost(ids.post, db)).rejects.toThrow(ReviewError);
    await expect(savePublishingDetails(ids.post, { slug: "another-slug", pillarId: null }, db)).rejects.toThrow("Wix already has this post");
  });

  it.each(["upload", "tags", "createDraft", "publish"] as const)("resumes after %s fails, without a second upload or a second post", async (route) => {
    const wix = fakeWix();
    wix.failOnce(route, 503, "Service unavailable");
    const failed = await publishPost(ids.post, userId, deps(wix));
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.message).toBe("Wix: 503: Service unavailable: FAKE_FAILURE");
    const publication = await getPublication(ids.post, db);
    expect(publication?.state).toBe("failed");
    expect(publication?.error).toContain("503");
    const retried = await publishPost(ids.post, userId, deps(wix));
    expect(retried.ok).toBe(true);
    expect(wix.state.files).toHaveLength(1);
    expect(wix.state.drafts).toHaveLength(1);
    expect(wix.state.posts).toHaveLength(1);
    expect((await events()).filter((event) => event.endsWith(":failed"))).toHaveLength(1);
  });

  it("names the step that failed", async () => {
    const wix = fakeWix();
    wix.failOnce("publish", 500, "Internal error");
    const failed = await publishPost(ids.post, userId, deps(wix));
    expect(failed).toEqual({ ok: false, step: "publish", message: "Wix: 500: Internal error: FAKE_FAILURE" });
    expect(await events()).toEqual(["cover:ok", "tag:ok", "draft:ok", "publish:failed"]);
  });

  it("adopts the draft Wix made when its reply was lost, instead of creating another", async () => {
    const wix = fakeWix();
    wix.state.loseCreateReply = true;
    const failed = await publishPost(ids.post, userId, deps(wix));
    expect(failed).toMatchObject({ ok: false, step: "draft" });
    expect(wix.state.drafts).toHaveLength(1);
    expect((await publishPost(ids.post, userId, deps(wix))).ok).toBe(true);
    expect(wix.state.drafts).toHaveLength(1);
    expect(wix.state.posts).toHaveLength(1);
  });

  it("stops before creating anything when another Wix post already has the slug", async () => {
    const wix = fakeWix();
    wix.state.posts.push({ id: "post-old", title: "An older post", slug: "wet-room-maintenance-week-by-week" });
    const failed = await publishPost(ids.post, userId, deps(wix));
    expect(failed).toEqual({
      ok: false,
      step: "draft",
      message: 'A post at /blog/wet-room-maintenance-week-by-week already exists on Wix ("An older post"). Change the slug in Publishing details, or check the Wix Blog.',
    });
    expect(wix.state.drafts).toHaveLength(0);
  });

  it("builds the live URL from the slug Wix actually used, and says so", async () => {
    const wix = fakeWix();
    wix.state.publishSlug = "wet-room-maintenance-week-by-week-1";
    expect(await publishPost(ids.post, userId, deps(wix))).toEqual({ ok: true, liveUrl: `${SITE}/blog/wet-room-maintenance-week-by-week-1` });
    const publication = await getPublication(ids.post, db);
    expect(publication).toMatchObject({ wixSlug: "wet-room-maintenance-week-by-week-1", liveUrl: `${SITE}/blog/wet-room-maintenance-week-by-week-1` });
    const [event] = await db.select().from(publishEvents).where(eq(publishEvents.step, "publish"));
    expect(event.message).toBe("Wix published the post at /blog/wet-room-maintenance-week-by-week-1, not /blog/wet-room-maintenance-week-by-week.");
  });

  it("refuses while another publish is running, and lets a stopped one be tried again", async () => {
    await db.insert(postPublications).values({ postId: ids.post, state: "running", heartbeatAt: new Date() });
    await expect(publishPost(ids.post, userId, deps(fakeWix()))).rejects.toThrow("Publishing is already in progress.");
    await db.update(postPublications).set({ heartbeatAt: new Date(Date.now() - STALE_PUBLISH_MS - 1000) }).where(eq(postPublications.postId, ids.post));
    expect((await publishPost(ids.post, userId, deps(fakeWix()))).ok).toBe(true);
    await expect(publishPost(ids.post, userId, deps(fakeWix()))).rejects.toThrow("Wix has the post. The live check is running.");
  });

  it("lists what stops publishing, and refuses until it is fixed", async () => {
    await db.update(posts).set({ coverDriveFileId: null, pillarId: null }).where(eq(posts.id, ids.post));
    const plan = await publishPlan(ids.post, db);
    expect(plan?.problems).toEqual(["Choose a cover first.", "Choose a pillar tag in Publishing details, so the post appears on its resources page."]);
    await expect(publishPost(ids.post, userId, deps(fakeWix()))).rejects.toThrow(PublishError);
    expect(await getPublication(ids.post, db)).toBeNull();
  });

  it("refuses a body the Migss blog cannot show before sending anything", async () => {
    const table = DRAFT.replace("Wet rooms need care.", "| Week | Job |\n| --- | --- |\n| 1 | Silicone |");
    await db.update(postDrafts).set({ bodyMd: table });
    const plan = await publishPlan(ids.post, db);
    expect(plan?.problems[0]).toMatch(/^Body line 1: A table\./);
    const wix = fakeWix();
    await expect(publishPost(ids.post, userId, deps(wix))).rejects.toThrow(/A table/);
    expect(wix.state.calls).toEqual([]);
  });

  it("only publishes approved posts", async () => {
    await db.update(posts).set({ status: "in_review" }).where(eq(posts.id, ids.post));
    await expect(publishPost(ids.post, userId, deps(fakeWix()))).rejects.toThrow("Only approved posts can be published.");
  });

  it("Check again restarts the live check only once Wix has the post", async () => {
    await expect(restartLiveCheck(ids.post, { db, startLiveCheck: async () => "run" })).rejects.toThrow("Wix does not have this post yet");
    await publishPost(ids.post, userId, deps(fakeWix()));
    await expect(restartLiveCheck(ids.post, { db, startLiveCheck: async () => "run" })).rejects.toThrow("The live check is already running.");
    await db.update(postPublications).set({ state: "not_confirmed" }).where(eq(postPublications.postId, ids.post));
    await restartLiveCheck(ids.post, { db, startLiveCheck: async () => "run_again" });
    expect(await getPublication(ids.post, db)).toMatchObject({ state: "checking", triggerRunId: "run_again", error: null });
  });
});

describe("cover downscaling (γ6 orientation approval, Q3)", () => {
  it("sends covers up to 10 MB unchanged", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await prepareCover({ bytes, mimeType: "image/png", fileName: "a.png" })).toEqual({ bytes, mimeType: "image/png", fileName: "a.png", downscaled: false, originalBytes: 3 });
  });

  it("downscales a larger photo to 2,400px on the long edge as JPEG", async () => {
    const width = 3600;
    const height = 2400;
    const noise = Buffer.alloc(width * height * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
    const big = new Uint8Array(await sharp(noise, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer());
    expect(big.byteLength).toBeGreaterThan(SINGLE_UPLOAD_MAX_BYTES);
    const prepared = await prepareCover({ bytes: big, mimeType: "image/png", fileName: "kitchen island.png" });
    expect(prepared).toMatchObject({ mimeType: "image/jpeg", fileName: "kitchen island.jpg", downscaled: true, originalBytes: big.byteLength });
    expect(prepared.bytes.byteLength).toBeLessThanOrEqual(SINGLE_UPLOAD_MAX_BYTES);
    const meta = await sharp(prepared.bytes).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([2400, 1600, "jpeg"]);
  });
});
