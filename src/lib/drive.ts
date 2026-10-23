// Minimal Google Drive v3 client. γ1 uses it for the Drive proof; γ5's cover picker builds on it.

export type DriveFile = { id: string; name: string; mimeType: string };

// GOOGLE_API_URL points the client at Playwright's local Google stand-in; it is never set in Vercel.
export function googleApiBase(): string {
  return (process.env.GOOGLE_API_URL ?? "https://www.googleapis.com").replace(/\/+$/, "");
}

const FOLDER_ID = /^[A-Za-z0-9_-]+$/;

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

export async function listFolderFiles(
  accessToken: string,
  folderId: string,
  options: { pageSize?: number; fetchImpl?: typeof fetch } = {},
): Promise<DriveFile[]> {
  // The ID goes into a Drive query string, so only allow the characters Drive IDs use.
  if (!FOLDER_ID.test(folderId)) throw new DriveError("The Drive folder ID is not valid.", 400);

  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType)",
    orderBy: "name",
    pageSize: String(options.pageSize ?? 25),
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const response = await (options.fetchImpl ?? fetch)(`${googleApiBase()}/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Google rejected the access token.",
      403: "Google refused access to this folder. Check the Drive scope and that the folder is shared with the signed-in account.",
      404: "Google could not find this folder.",
    };
    throw new DriveError(messages[response.status] ?? `Drive returned status ${response.status}.`, response.status);
  }

  const body = (await response.json()) as { files?: Partial<DriveFile>[] };
  return (body.files ?? [])
    .filter((file): file is DriveFile => Boolean(file.id && file.name && file.mimeType))
    .map(({ id, name, mimeType }) => ({ id, name, mimeType }));
}

export type DriveFolder = { id: string; name: string };

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

// Reads a folder's name and confirms the ID really is a folder the signed-in account can see.
export async function getDriveFolder(
  accessToken: string,
  folderId: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<DriveFolder> {
  if (!FOLDER_ID.test(folderId)) throw new DriveError("The Drive folder ID is not valid.", 400);
  const params = new URLSearchParams({ fields: "id,name,mimeType,trashed", supportsAllDrives: "true" });
  const response = await (options.fetchImpl ?? fetch)(
    `${googleApiBase()}/drive/v3/files/${encodeURIComponent(folderId)}?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Google rejected the access token.",
      403: "Google refused access to this folder. Check that it is shared with the signed-in account.",
      404: "Google could not find this folder. Check the link and that it is shared with the signed-in account.",
    };
    throw new DriveError(messages[response.status] ?? `Drive returned status ${response.status}.`, response.status);
  }
  const body = (await response.json()) as { id?: string; name?: string; mimeType?: string; trashed?: boolean };
  if (body.mimeType !== FOLDER_MIME_TYPE) throw new DriveError("This Drive link is a file, not a folder.", 400);
  if (body.trashed) throw new DriveError("This Drive folder is in the bin.", 400);
  return { id: body.id ?? folderId, name: body.name ?? "Untitled folder" };
}

// ---- γ5 cover picker (decision 18, γ5 orientation Q6) ----

export const FOLDER_MIME = FOLDER_MIME_TYPE;
export const COVER_PAGE_SIZE = 60;

export type DriveListing = { folders: DriveFile[]; images: DriveFile[]; nextPageToken: string | null };

const MESSAGES: Record<number, string> = {
  401: "Google rejected the access token.",
  403: "Google refused access. Check that the folder is shared with the signed-in account.",
  404: "Google could not find this file or folder.",
};

async function driveGet<T>(accessToken: string, path: string, params: URLSearchParams, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(`${googleApiBase()}/drive/v3/${path}?${params}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new DriveError(MESSAGES[response.status] ?? `Drive returned status ${response.status}.`, response.status);
  return (await response.json()) as T;
}

// One page of a folder: its subfolders, then its images, by name. Other files are left out.
export async function listCoverPage(
  accessToken: string,
  folderId: string,
  options: { pageToken?: string | null; pageSize?: number; fetchImpl?: typeof fetch } = {},
): Promise<DriveListing> {
  if (!FOLDER_ID.test(folderId)) throw new DriveError("The Drive folder ID is not valid.", 400);
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false and (mimeType = '${FOLDER_MIME_TYPE}' or mimeType contains 'image/')`,
    fields: "nextPageToken,files(id,name,mimeType)",
    orderBy: "folder,name",
    pageSize: String(options.pageSize ?? COVER_PAGE_SIZE),
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);
  const body = await driveGet<{ files?: Partial<DriveFile>[]; nextPageToken?: string }>(accessToken, "files", params, options.fetchImpl);
  const files = (body.files ?? []).filter((file): file is DriveFile => Boolean(file.id && file.name && file.mimeType));
  return {
    folders: files.filter((file) => file.mimeType === FOLDER_MIME_TYPE),
    images: files.filter((file) => file.mimeType.startsWith("image/")),
    nextPageToken: body.nextPageToken ?? null,
  };
}

export type DriveFileMeta = DriveFile & { parents: string[]; thumbnailLink: string | null };

export async function getFileMeta(accessToken: string, fileId: string, options: { fetchImpl?: typeof fetch } = {}): Promise<DriveFileMeta> {
  if (!FOLDER_ID.test(fileId)) throw new DriveError("The Drive file ID is not valid.", 400);
  const params = new URLSearchParams({ fields: "id,name,mimeType,parents,thumbnailLink,trashed", supportsAllDrives: "true" });
  const body = await driveGet<Partial<DriveFileMeta> & { trashed?: boolean }>(accessToken, `files/${encodeURIComponent(fileId)}`, params, options.fetchImpl);
  if (body.trashed) throw new DriveError("This file is in the bin.", 404);
  return { id: body.id ?? fileId, name: body.name ?? "Untitled", mimeType: body.mimeType ?? "", parents: body.parents ?? [], thumbnailLink: body.thumbnailLink ?? null };
}

export const MAX_FOLDER_DEPTH = 6;

// The folders from the root down to the file's folder, or null when the file is not under the root within
// MAX_FOLDER_DEPTH levels. A cover can only come from the project's folder (γ5 orientation Q6).
export async function pathUnder(
  accessToken: string,
  fileId: string,
  rootId: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<{ file: DriveFileMeta; folders: DriveFile[] } | null> {
  const file = await getFileMeta(accessToken, fileId, options);
  if (file.id === rootId) return { file, folders: [] };
  const folders: DriveFile[] = [];
  let parentId = file.parents[0];
  for (let depth = 0; parentId && depth < MAX_FOLDER_DEPTH; depth++) {
    let parent: DriveFileMeta;
    try {
      parent = await getFileMeta(accessToken, parentId, options);
    } catch (error) {
      // A parent the account cannot read (above a shared folder, or My Drive itself) is outside the root.
      if (error instanceof DriveError && (error.status === 403 || error.status === 404)) return null;
      throw error;
    }
    folders.unshift(parent);
    if (parent.id === rootId) return { file, folders };
    parentId = parent.parents[0];
  }
  return null;
}

// Drive's thumbnail links are short-lived and need the account's token, so the app fetches them itself. Only
// Google's image host (or the Playwright stand-in) is ever fetched.
export function thumbnailUrl(link: string, size: number): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const google = url.protocol === "https:" && url.hostname.endsWith(".googleusercontent.com");
  const standIn = process.env.GOOGLE_API_URL !== undefined && url.origin === new URL(googleApiBase()).origin;
  if (!google && !standIn) return null;
  return url.toString().replace(/=s\d+(-[a-z]+)?$/, "") + `=s${size}`;
}

// ---- γ6 publish: the chosen cover's bytes (decision 18) ----

// A photo larger than this is not downloaded at all; covers this size are downscaled before upload anyway.
export const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;

export async function downloadFile(
  accessToken: string,
  fileId: string,
  options: { fetchImpl?: typeof fetch; maxBytes?: number } = {},
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (!FOLDER_ID.test(fileId)) throw new DriveError("The Drive file ID is not valid.", 400);
  const params = new URLSearchParams({ alt: "media", supportsAllDrives: "true" });
  const response = await (options.fetchImpl ?? fetch)(`${googleApiBase()}/drive/v3/files/${encodeURIComponent(fileId)}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new DriveError(MESSAGES[response.status] ?? `Drive returned status ${response.status}.`, response.status);
  const max = options.maxBytes ?? MAX_DOWNLOAD_BYTES;
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > max) throw new DriveError(`This photo is ${Math.round(declared / 1_000_000)} MB, too large to download. Choose a smaller copy.`, 413);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > max) throw new DriveError(`This photo is ${Math.round(bytes.byteLength / 1_000_000)} MB, too large to download. Choose a smaller copy.`, 413);
  return { bytes, mimeType: (response.headers.get("content-type") ?? "").split(";")[0].trim() };
}
