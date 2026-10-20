// Minimal Google Drive v3 client. γ1 uses it for the Drive proof; γ5's cover picker builds on it.

export type DriveFile = { id: string; name: string; mimeType: string };

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
  const response = await (options.fetchImpl ?? fetch)(`https://www.googleapis.com/drive/v3/files?${params}`, {
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
