import "server-only";
import { getDriveFolder, listFolderFiles, type DriveFolder } from "./drive";
import { getGoogleAccessToken } from "./google-tokens";

// Accepts a bare folder ID or a Drive link: /drive/folders/<id>, /drive/u/<n>/folders/<id>, open?id=<id>.
export function parseDriveFolderId(input: string): string | null {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hostname !== "drive.google.com") return null;
  const fromPath = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(url.pathname);
  if (fromPath) return fromPath[1];
  const fromQuery = url.searchParams.get("id");
  return fromQuery && /^[A-Za-z0-9_-]{10,}$/.test(fromQuery) ? fromQuery : null;
}

export type CheckedFolder = DriveFolder & { fileCount: number; more: boolean };

const COUNT_LIMIT = 100;

// Checks the folder with the stored Google token: it must exist, be a folder, and be listable.
export async function checkDriveFolder(
  userId: string,
  folderId: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<CheckedFolder> {
  const { accessToken } = await getGoogleAccessToken(userId, { fetchImpl: options.fetchImpl });
  const folder = await getDriveFolder(accessToken, folderId, options);
  const files = await listFolderFiles(accessToken, folderId, { pageSize: COUNT_LIMIT, fetchImpl: options.fetchImpl });
  return { ...folder, fileCount: files.length, more: files.length === COUNT_LIMIT };
}
