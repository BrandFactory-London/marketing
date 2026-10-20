import { describe, expect, it, vi } from "vitest";
import { DriveError, listFolderFiles } from "./drive";

describe("Drive folder listing", () => {
  it("asks Drive for the folder's files with the access token", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ files: [{ id: "f1", name: "kitchen.jpg", mimeType: "image/jpeg" }] }),
    );
    const files = await listFolderFiles("ya29.token", "1AbC_d-9", { fetchImpl });
    expect(files).toEqual([{ id: "f1", name: "kitchen.jpg", mimeType: "image/jpeg" }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("q")).toBe("'1AbC_d-9' in parents and trashed = false");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.token");
  });

  it("refuses a folder ID that could change the query", async () => {
    const fetchImpl = vi.fn();
    await expect(listFolderFiles("t", "abc' or 'x", { fetchImpl })).rejects.toBeInstanceOf(DriveError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("explains a refusal without echoing the token", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 403 }));
    const error = await listFolderFiles("ya29.secret", "folder", { fetchImpl }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DriveError);
    expect((error as DriveError).status).toBe(403);
    expect((error as DriveError).message).toContain("refused access");
    expect((error as DriveError).message).not.toContain("ya29");
  });

  it("returns an empty list for an empty folder and skips incomplete entries", async () => {
    expect(await listFolderFiles("t", "folder", { fetchImpl: vi.fn(async () => Response.json({})) })).toEqual([]);
    const partial = vi.fn(async () => Response.json({ files: [{ id: "x" }, { id: "y", name: "a.png", mimeType: "image/png" }] }));
    expect(await listFolderFiles("t", "folder", { fetchImpl: partial })).toEqual([{ id: "y", name: "a.png", mimeType: "image/png" }]);
  });
});
