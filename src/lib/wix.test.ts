import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { projectWix } from "@/db/schema";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { FAKE_ACCOUNT, FAKE_KEY, FAKE_SITE, fakeWix } from "@/test/fake-wix";
import { createClient } from "./clients";
import { addPillar } from "./pillars";
import { createProject } from "./projects";
import { WixClient, WixError } from "./wix";
import {
  checkWixConnection,
  chooseWixMember,
  getWixSettings,
  keyHint,
  listWixConnections,
  loadWixCredentials,
  parseWixCredentials,
  removeWixCredentials,
  saveWixCredentials,
  WixSetupError,
} from "./wix-credentials";

const credentials = { apiKey: FAKE_KEY, accountId: FAKE_ACCOUNT, siteId: FAKE_SITE };

describe("Wix client (γ6 orientation Q1)", () => {
  it("sends the key as it is with the site ID header only, and reads tags and members", async () => {
    const wix = fakeWix();
    const client = new WixClient(credentials, { fetchImpl: wix.fetchImpl });
    expect((await client.queryTagsBySlug(["bathroom-renovation", "missing"])).map((tag) => tag.id)).toEqual(["tag-bath"]);
    expect(await client.listMembers()).toEqual([
      { id: "fa29eebd-77ca-40d3-a742-64c80d431737", nickname: "Amir Taylor" },
      { id: "ef67bb59-f6c7-4cdb-a269-5292568887cf", nickname: "info4499403" },
    ]);
  });

  it("turns a refusal into a WixError with Wix's status, message and request ID", async () => {
    const wix = fakeWix();
    const client = new WixClient({ ...credentials, apiKey: "IST.wrong-key-0000000000" }, { fetchImpl: wix.fetchImpl });
    const error = await client.queryTagsBySlug(["bathroom-renovation"]).catch((caught) => caught);
    expect(error).toBeInstanceOf(WixError);
    expect(error.status).toBe(403);
    expect(error.message).toBe("Permission denied: The API key cannot reach this site: PERMISSION_DENIED");
    expect(error.requestId).toMatch(/^req-/);
  });

  it("reports a network failure without a status", async () => {
    const client = new WixClient(credentials, { fetchImpl: (async () => Promise.reject(new TypeError("fetch failed"))) as typeof fetch });
    const error = await client.listMembers().catch((caught) => caught);
    expect(error).toBeInstanceOf(WixError);
    expect(error.status).toBeNull();
    expect(error.message).toBe("Could not reach Wix: fetch failed");
  });

  it("uploads through an upload URL with the filename and content type", async () => {
    const wix = fakeWix();
    const client = new WixClient(credentials, { fetchImpl: wix.fetchImpl });
    const file = await client.uploadImage({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg", fileName: "bath-01.jpg", filePath: "/BrandFactory covers" });
    expect(file.id).toMatch(/~mv2\.jpg$/);
    expect(wix.state.files).toEqual([{ id: file.id, name: "bath-01.jpg", size: 3, mimeType: "image/jpeg" }]);
  });

  it("creates a draft unpublished with the cover as a media file ID, then publishes it once", async () => {
    const wix = fakeWix();
    const client = new WixClient(credentials, { fetchImpl: wix.fetchImpl });
    const draft = await client.createDraft({ title: "Wet rooms", memberId: "m-1", tagIds: ["tag-bath"], excerpt: "Short.", seoSlug: "wet-rooms", richContent: { nodes: [] }, coverFileId: "8bde49_x~mv2.jpg" });
    expect(wix.state.drafts[0].body).toEqual({
      draftPost: {
        title: "Wet rooms",
        memberId: "m-1",
        tagIds: ["tag-bath"],
        excerpt: "Short.",
        seoSlug: "wet-rooms",
        richContent: { nodes: [] },
        media: { wixMedia: { image: { id: "8bde49_x~mv2.jpg" } }, displayed: true, custom: true },
      },
      publish: false,
    });
    const first = await client.publishDraft(draft.id);
    expect(await client.publishDraft(draft.id)).toBe(first);
    expect(wix.state.posts).toHaveLength(1);
    expect(await client.getPostBySlug("wet-rooms")).toMatchObject({ id: first, slug: "wet-rooms", url: { path: "/blog/wet-rooms" } });
    expect(await client.getPostBySlug("nothing-here")).toBeNull();
  });
});

describe("Wix credential parsing", () => {
  it("requires the key, and IDs in Wix's form", () => {
    expect(parseWixCredentials({ apiKey: "", accountId: "x", siteId: "" })).toEqual({
      ok: false,
      errors: {
        apiKey: "Paste the API key from Wix's API Keys Manager.",
        accountId: "An account ID looks like 1a2b3c4d-1234-5678-9abc-1234567890ab.",
        siteId: "Enter the site ID from the site's dashboard address.",
      },
    });
    expect(parseWixCredentials({ apiKey: ` ${FAKE_KEY}\n`, accountId: FAKE_ACCOUNT.toUpperCase(), siteId: FAKE_SITE })).toEqual({ ok: true, value: credentials });
    expect(keyHint(FAKE_KEY)).toBe("7f3a");
  });
});

describe.skipIf(!testDatabaseUrl)("Wix credentials (local Postgres)", () => {
  const { db, close } = createTestDb();
  let projectId: string;
  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  });
  afterAll(close);

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss website", siteUrl: "https://www.migss.co.uk", package: "entry", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    projectId = project.id;
    await addPillar(projectId, { label: "Bathroom Renovation", slug: "bathroom-renovation" }, db);
  });

  it("stores the credentials encrypted for this project only and shows the key's last four characters", async () => {
    await saveWixCredentials(projectId, credentials, db);
    const [row] = await db.select().from(projectWix).where(eq(projectWix.projectId, projectId));
    expect(row.credentialsEnc).not.toContain(FAKE_KEY);
    expect(row.credentialsEnc).not.toContain(FAKE_SITE);
    expect(row.keyHint).toBe("7f3a");
    expect(await loadWixCredentials(projectId, db)).toEqual(credentials);
    // The ciphertext is bound to its project: copied to another project's row, it does not decrypt.
    const other = await createProject(
      { clientId: (await createClient({ name: "Other", mainContact: null, email: null, phone: null }, db)).id, name: "Other site", siteUrl: "https://other.example", package: "entry", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    await db.insert(projectWix).values({ projectId: other.id, credentialsEnc: row.credentialsEnc, keyHint: "7f3a" });
    await expect(loadWixCredentials(other.id, db)).rejects.toThrow();
  });

  it("checks the connection by looking up the pillar tags, and records the result", async () => {
    await saveWixCredentials(projectId, credentials, db);
    const wix = fakeWix();
    expect(await checkWixConnection(projectId, { db, fetchImpl: wix.fetchImpl })).toEqual({ ok: true, message: "Connected. 1 of 1 pillar tags found on Wix." });
    await addPillar(projectId, { label: "Loft conversions", slug: "loft-conversions" }, db);
    const warned = await checkWixConnection(projectId, { db, fetchImpl: wix.fetchImpl });
    expect(warned.ok).toBe(true);
    expect(warned.message).toContain("Wix has no tag for loft-conversions");
    wix.failOnce("tags", 403, "Missing permission SCOPE.DC-BLOG.READ-BLOGS");
    expect(await checkWixConnection(projectId, { db, fetchImpl: wix.fetchImpl })).toEqual({ ok: false, message: "403: Missing permission SCOPE.DC-BLOG.READ-BLOGS: FAKE_FAILURE" });
    const settings = await getWixSettings(projectId, db);
    expect(settings).toMatchObject({ checkOk: false, checkMessage: "403: Missing permission SCOPE.DC-BLOG.READ-BLOGS: FAKE_FAILURE" });
    expect(settings?.checkedAt).toBeInstanceOf(Date);
    expect((await listWixConnections(db)).map((row) => [row.projectName, row.settings?.checkOk])).toEqual([["Migss website", false]]);
  });

  it("chooses the author only from the site's members, and new credentials clear it", async () => {
    await saveWixCredentials(projectId, credentials, db);
    const wix = fakeWix();
    await expect(chooseWixMember(projectId, "not-a-member", { db, fetchImpl: wix.fetchImpl })).rejects.toBeInstanceOf(WixSetupError);
    await chooseWixMember(projectId, "fa29eebd-77ca-40d3-a742-64c80d431737", { db, fetchImpl: wix.fetchImpl });
    expect(await getWixSettings(projectId, db)).toMatchObject({ memberId: "fa29eebd-77ca-40d3-a742-64c80d431737", memberName: "Amir Taylor" });
    await saveWixCredentials(projectId, credentials, db);
    expect(await getWixSettings(projectId, db)).toMatchObject({ memberId: null, memberName: null, checkOk: null });
    await removeWixCredentials(projectId, db);
    expect(await getWixSettings(projectId, db)).toBeNull();
    await expect(checkWixConnection(projectId, { db, fetchImpl: wix.fetchImpl })).rejects.toBeInstanceOf(WixSetupError);
  });
});
