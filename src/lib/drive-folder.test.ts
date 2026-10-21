import { describe, expect, it, vi } from "vitest";

vi.mock("./google-tokens", () => ({
  getGoogleAccessToken: vi.fn(async () => ({ accessToken: "token-123", refreshedAt: null })),
}));

import { DriveError, getDriveFolder } from "./drive";
import { checkDriveFolder, parseDriveFolderId } from "./drive-folder";

const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("Drive folder links", () => {
  it("accepts a bare ID and the common link shapes", () => {
    expect(parseDriveFolderId(id)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${id}?usp=sharing`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${id}`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${id}`)).toBe(id);
    expect(parseDriveFolderId(`  ${id}  `)).toBe(id);
  });

  it("refuses other sites and anything that is not an ID", () => {
    expect(parseDriveFolderId(`https://evil.example.com/drive/folders/${id}`)).toBeNull();
    expect(parseDriveFolderId("Migss photos")).toBeNull();
    expect(parseDriveFolderId("https://drive.google.com/drive/my-drive")).toBeNull();
  });
});

function drive(responses: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; auth: string | null }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, auth: new Headers(init?.headers).get("Authorization") });
    const key = url.includes("?q=") || url.includes("&q=") || new URL(url).searchParams.has("q") ? "list" : "get";
    const response = responses[key];
    return new Response(JSON.stringify(response.body), { status: response.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("checking a Drive folder", () => {
  it("returns the folder's name and file count, using the stored token", async () => {
    const fake = drive({
      get: { body: { id, name: "Migss photos", mimeType: "application/vnd.google-apps.folder" } },
      list: { body: { files: [{ id: "f1", name: "a.jpg", mimeType: "image/jpeg" }, { id: "f2", name: "b.jpg", mimeType: "image/jpeg" }] } },
    });
    expect(await checkDriveFolder("user-1", id, { fetchImpl: fake.impl })).toEqual({ id, name: "Migss photos", fileCount: 2, more: false });
    expect(fake.calls.every((call) => call.auth === "Bearer token-123")).toBe(true);
    expect(fake.calls[0].url).toContain(`/drive/v3/files/${id}?`);
  });

  it("refuses a file that is not a folder", async () => {
    const fake = drive({ get: { body: { id, name: "photo.jpg", mimeType: "image/jpeg" } }, list: { body: {} } });
    await expect(getDriveFolder("t", id, { fetchImpl: fake.impl })).rejects.toThrow("is a file, not a folder");
  });

  it("explains a folder Google cannot find", async () => {
    const fake = drive({ get: { status: 404, body: {} }, list: { body: {} } });
    await expect(getDriveFolder("t", id, { fetchImpl: fake.impl })).rejects.toBeInstanceOf(DriveError);
    await expect(getDriveFolder("t", id, { fetchImpl: fake.impl })).rejects.toThrow("could not find this folder");
  });
});
