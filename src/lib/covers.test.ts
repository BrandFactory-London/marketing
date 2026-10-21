import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { googleTokens, posts, projects, users } from "@/db/schema";
import { createClient } from "./clients";
import { browseCovers, chooseCover, coverThumbnail } from "./covers";
import { listCoverPage, pathUnder, thumbnailUrl } from "./drive";
import { encrypt } from "./crypto";
import { createProject } from "./projects";

// A fake Drive: Migss Interiors > Bathrooms (70 photos, two pages) and Kitchens > Islands; Elsewhere is outside.
const FOLDER = "application/vnd.google-apps.folder";
type File = { id: string; name: string; mimeType: string; parents: string[] };
const FILES: File[] = [
  { id: "root-migss", name: "Migss Interiors", mimeType: FOLDER, parents: ["my-drive"] },
  { id: "f-bathrooms", name: "Bathrooms", mimeType: FOLDER, parents: ["root-migss"] },
  { id: "f-kitchens", name: "Kitchens", mimeType: FOLDER, parents: ["root-migss"] },
  { id: "f-islands", name: "Islands", mimeType: FOLDER, parents: ["f-kitchens"] },
  { id: "doc-brief", name: "Brief.pdf", mimeType: "application/pdf", parents: ["root-migss"] },
  ...Array.from({ length: 70 }, (_, index) => ({ id: `img-bath-${index + 1}`, name: `bath-${String(index + 1).padStart(2, "0")}.jpg`, mimeType: "image/jpeg", parents: ["f-bathrooms"] })),
  { id: "img-island", name: "island.jpg", mimeType: "image/jpeg", parents: ["f-islands"] },
  { id: "f-elsewhere", name: "Elsewhere", mimeType: FOLDER, parents: ["my-drive"] },
  { id: "img-private", name: "private.jpg", mimeType: "image/jpeg", parents: ["f-elsewhere"] },
];

function fakeDrive() {
  const requests: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    if (url.hostname === "lh3.googleusercontent.com") return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
    const match = /\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (match) {
      const file = FILES.find((item) => item.id === decodeURIComponent(match[1]));
      if (!file) return new Response("{}", { status: 404 });
      return Response.json({ ...file, thumbnailLink: file.mimeType.startsWith("image/") ? `https://lh3.googleusercontent.com/d/${file.id}=s220` : undefined });
    }
    const parent = /'([^']+)' in parents/.exec(url.searchParams.get("q") ?? "")![1];
    const all = FILES.filter((file) => file.parents.includes(parent) && (file.mimeType === FOLDER || file.mimeType.startsWith("image/")));
    const size = Number(url.searchParams.get("pageSize"));
    const start = Number(url.searchParams.get("pageToken") ?? 0);
    const page = all.slice(start, start + size);
    return Response.json({ files: page, nextPageToken: start + size < all.length ? String(start + size) : undefined });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

describe("Drive helpers for covers (γ5 Q6)", () => {
  it("lists subfolders and photos only, in pages of 60", async () => {
    const { fetchImpl } = fakeDrive();
    const root = await listCoverPage("token", "root-migss", { fetchImpl });
    expect(root.folders.map((file) => file.name)).toEqual(["Bathrooms", "Kitchens"]);
    expect(root.images).toEqual([]);
    const first = await listCoverPage("token", "f-bathrooms", { fetchImpl });
    expect(first.images).toHaveLength(60);
    expect(first.nextPageToken).toBe("60");
    const second = await listCoverPage("token", "f-bathrooms", { pageToken: first.nextPageToken, fetchImpl });
    expect(second.images).toHaveLength(10);
    expect(second.nextPageToken).toBeNull();
  });

  it("walks up from a photo to the project folder, and refuses anything outside it", async () => {
    const { fetchImpl } = fakeDrive();
    const inside = await pathUnder("token", "img-island", "root-migss", { fetchImpl });
    expect(inside?.folders.map((folder) => folder.name)).toEqual(["Migss Interiors", "Kitchens", "Islands"]);
    expect(await pathUnder("token", "img-private", "root-migss", { fetchImpl })).toBeNull();
  });

  it("only fetches thumbnails from Google's image host, at the size asked for", () => {
    expect(thumbnailUrl("https://lh3.googleusercontent.com/d/abc=s220", 320)).toBe("https://lh3.googleusercontent.com/d/abc=s320");
    expect(thumbnailUrl("https://evil.example.com/d/abc=s220", 320)).toBeNull();
    expect(thumbnailUrl("http://lh3.googleusercontent.com/d/abc=s220", 320)).toBeNull();
  });
});

describe.skipIf(!testDatabaseUrl)("covers (local Postgres)", () => {
  const { db, close } = createTestDb();
  const userId = "cover-test-user";
  let ids: { project: string; post: string };
  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  });
  afterAll(close);

  beforeEach(async () => {
    await resetDomainTables(db);
    await db.delete(googleTokens).where(eq(googleTokens.userId, userId));
    await db.insert(users).values({ id: userId, email: "cover-test@example.com" }).onConflictDoNothing();
    await db.insert(googleTokens).values({
      userId,
      refreshTokenEnc: encrypt("refresh", `google-refresh-token:${userId}`),
      accessTokenEnc: encrypt("access", `google-access-token:${userId}`),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      scope: "drive.readonly",
    });
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss website", siteUrl: "https://www.migss.co.uk", package: "entry", status: "paused", publishingTarget: "wix_blog" },
      db,
    );
    await db.update(projects).set({ driveFolderId: "root-migss", driveFolderName: "Migss Interiors" }).where(eq(projects.id, project.id));
    const [post] = await db.insert(posts).values({ projectId: project.id, status: "in_review", slotDate: "2026-11-03", topic: "Wet rooms" }).returning();
    ids = { project: project.id, post: post.id };
  });

  it("browses into a subfolder with its path from the project folder", async () => {
    const view = await browseCovers(userId, ids.project, "f-islands", null, { db, fetchImpl: fakeDrive().fetchImpl });
    expect(view.path.map((folder) => folder.name)).toEqual(["Migss Interiors", "Kitchens", "Islands"]);
    expect(view.images.map((image) => image.name)).toEqual(["island.jpg"]);
    await expect(browseCovers(userId, ids.project, "f-elsewhere", null, { db, fetchImpl: fakeDrive().fetchImpl })).rejects.toThrow("not inside the project's Drive folder");
  });

  it("records the chosen photo with its folder path, and refuses one from outside the folder", async () => {
    await chooseCover(userId, ids.post, "img-island", { db, fetchImpl: fakeDrive().fetchImpl });
    const [post] = await db.select().from(posts).where(eq(posts.id, ids.post));
    expect(post).toMatchObject({ coverDriveFileId: "img-island", coverName: "island.jpg", coverPath: "Migss Interiors / Kitchens / Islands" });
    expect(post.coverChosenAt).not.toBeNull();
    await expect(chooseCover(userId, ids.post, "img-private", { db, fetchImpl: fakeDrive().fetchImpl })).rejects.toThrow("not inside the project's Drive folder");
    await expect(chooseCover(userId, ids.post, "f-kitchens", { db, fetchImpl: fakeDrive().fetchImpl })).rejects.toThrow("Choose a photo");
  });

  it("serves a thumbnail for a photo in the folder and a 404 for anything else", async () => {
    const inside = await coverThumbnail(userId, ids.project, "img-bath-3", 320, { db, fetchImpl: fakeDrive().fetchImpl });
    expect(inside.status).toBe(200);
    expect(inside.headers.get("cache-control")).toBe("private, max-age=3600");
    expect((await coverThumbnail(userId, ids.project, "img-private", 320, { db, fetchImpl: fakeDrive().fetchImpl })).status).toBe(404);
    expect((await coverThumbnail(userId, ids.project, "../etc", 320, { db, fetchImpl: fakeDrive().fetchImpl })).status).toBe(404);
  });
});
