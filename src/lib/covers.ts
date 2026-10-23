import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { posts } from "@/db/schema";
import { getFileMeta, listCoverPage, pathUnder, thumbnailUrl, DriveError, type DriveFile } from "./drive";
import { getGoogleAccessToken, GoogleReconnectRequired } from "./google-tokens";
import { getProject } from "./projects";
import { DETAILS_STATUSES, ReviewError, WIX_HAS_IT, wixHasDraft } from "./review";
import { isUuid } from "./validation";

// The cover picker (decision 18, backlog 11, γ5 orientation Q6): browse the project's Drive folder and its
// subfolders, and record the chosen photo on the post. Downloading it and uploading it to Wix is γ6.

export type CoverFolderView = {
  // Root first; the last is the folder being shown.
  path: DriveFile[];
  folders: DriveFile[];
  images: DriveFile[];
  nextPageToken: string | null;
};

export class CoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoverError";
  }
}

function explain(error: unknown): never {
  if (error instanceof GoogleReconnectRequired) throw new CoverError("Google needs you to sign in again before Drive can be read. Sign out, then sign in with Google.");
  if (error instanceof DriveError) throw new CoverError(error.message);
  throw error;
}

async function projectFolder(projectId: string, db: Database) {
  const project = await getProject(projectId, db);
  if (!project) throw new CoverError("This project no longer exists.");
  if (!project.driveFolderId) throw new CoverError("This project has no Drive folder. Add one in the project's Settings.");
  return { id: project.driveFolderId, name: project.driveFolderName ?? "Drive folder" };
}

export async function browseCovers(
  userId: string,
  projectId: string,
  folderId: string | null,
  pageToken: string | null,
  options: { db?: Database; fetchImpl?: typeof fetch } = {},
): Promise<CoverFolderView> {
  const db = options.db ?? getDb();
  const root = await projectFolder(projectId, db);
  try {
    const { accessToken } = await getGoogleAccessToken(userId, { db, fetchImpl: options.fetchImpl });
    let path: DriveFile[] = [{ id: root.id, name: root.name, mimeType: "application/vnd.google-apps.folder" }];
    if (folderId && folderId !== root.id) {
      const found = await pathUnder(accessToken, folderId, root.id, options);
      if (!found) throw new CoverError("That folder is not inside the project's Drive folder.");
      path = [...path, ...found.folders.slice(1), found.file];
    }
    const listing = await listCoverPage(accessToken, path[path.length - 1].id, { pageToken, fetchImpl: options.fetchImpl });
    return { path, ...listing };
  } catch (error) {
    if (error instanceof CoverError) throw error;
    explain(error);
  }
}

export async function chooseCover(userId: string, postId: string, fileId: string, options: { db?: Database; fetchImpl?: typeof fetch } = {}): Promise<void> {
  const db = options.db ?? getDb();
  if (!isUuid(postId)) throw new ReviewError("This post no longer exists.");
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) throw new ReviewError("This post no longer exists.");
  if (!DETAILS_STATUSES.includes(post.status)) throw new ReviewError("The cover can be chosen in Review or once approved, before publishing.");
  if (await wixHasDraft(db, postId)) throw new ReviewError(WIX_HAS_IT);
  const root = await projectFolder(post.projectId, db);
  let found: Awaited<ReturnType<typeof pathUnder>>;
  try {
    const { accessToken } = await getGoogleAccessToken(userId, { db, fetchImpl: options.fetchImpl });
    found = await pathUnder(accessToken, fileId, root.id, options);
  } catch (error) {
    explain(error);
  }
  if (!found) throw new CoverError("That photo is not inside the project's Drive folder.");
  if (!found.file.mimeType.startsWith("image/")) throw new CoverError("Choose a photo, not a folder or another file.");
  const coverPath = [root.name, ...found.folders.slice(1).map((folder) => folder.name)].join(" / ");
  await db
    .update(posts)
    .set({ coverDriveFileId: found.file.id, coverName: found.file.name, coverPath, coverChosenAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(posts.id, postId));
}

export const THUMBNAIL_SIZES = [320, 1200] as const;

// A thumbnail of a photo under the project's folder, fetched with the stored Google token. Anything outside the
// folder is a 404, so the route cannot be used to read the rest of the Drive.
export async function coverThumbnail(
  userId: string,
  projectId: string,
  fileId: string,
  size: number,
  options: { db?: Database; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const db = options.db ?? getDb();
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const root = await projectFolder(projectId, db);
    const { accessToken } = await getGoogleAccessToken(userId, { db, fetchImpl });
    const found = await pathUnder(accessToken, fileId, root.id, { fetchImpl });
    const link = found?.file.thumbnailLink ? thumbnailUrl(found.file.thumbnailLink, size) : null;
    if (!found || !link) return new Response("Not found", { status: 404 });
    const image = await fetchImpl(link, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!image.ok || !image.body) return new Response("Not found", { status: 404 });
    return new Response(image.body, {
      headers: { "content-type": image.headers.get("content-type") ?? "image/jpeg", "cache-control": "private, max-age=3600" },
    });
  } catch (error) {
    if (error instanceof CoverError || error instanceof DriveError || error instanceof GoogleReconnectRequired) return new Response("Not found", { status: 404 });
    throw error;
  }
}

export { getFileMeta };
