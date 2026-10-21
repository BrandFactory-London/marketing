import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { createClient } from "./clients";
import { createProject, getProject, listClientProjects, listProjects, parseProjectInput, setDriveFolder, UnknownClient, updateProjectSettings } from "./projects";

const clientId = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const valid = { clientId, name: "Migss Interiors website", siteUrl: "www.migssinteriors.com/", package: "entry", status: "active" };

describe("project input", () => {
  it("normalises the website and defaults the publishing target to Wix Blog", () => {
    expect(parseProjectInput(valid)).toEqual({
      ok: true,
      value: { ...valid, siteUrl: "https://www.migssinteriors.com", publishingTarget: "wix_blog" },
    });
  });

  it("reports every missing or invalid field", () => {
    const result = parseProjectInput({ clientId: "x", name: "", siteUrl: "ftp://x.com", package: "gold", status: "live", publishingTarget: "wordpress" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["clientId", "name", "package", "publishingTarget", "siteUrl", "status"]);
  });
});

describe.skipIf(!testDatabaseUrl)("projects (local Postgres)", () => {
  const { db, close } = createTestDb();
  beforeEach(() => resetDomainTables(db));
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  async function setup() {
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const parsed = parseProjectInput({ ...valid, clientId: client.id });
    if (!parsed.ok) throw new Error("fixture invalid");
    return { client, value: parsed.value };
  }

  it("creates a project under its client and lists it with the client name", async () => {
    const { client, value } = await setup();
    const project = await createProject(value, db);
    expect(await getProject(project.id, db)).toMatchObject({ name: "Migss Interiors website", clientName: "Migss Interiors", package: "entry" });
    expect((await listProjects(db)).map((p) => p.name)).toEqual(["Migss Interiors website"]);
    expect((await listClientProjects(client.id, db)).map((p) => p.id)).toEqual([project.id]);
  });

  it("refuses a client that does not exist", async () => {
    const { value } = await setup();
    await expect(createProject({ ...value, clientId }, db)).rejects.toBeInstanceOf(UnknownClient);
  });

  it("moves status_changed_at only when the status changes", async () => {
    const { value } = await setup();
    const project = await createProject(value, db);
    const samePackage = await updateProjectSettings(project.id, { ...value, package: "mid" }, db);
    expect(samePackage!.statusChangedAt.getTime()).toBe(project.statusChangedAt.getTime());
    await new Promise((resolve) => setTimeout(resolve, 10));
    const paused = await updateProjectSettings(project.id, { ...value, status: "paused" }, db);
    expect(paused!.status).toBe("paused");
    expect(paused!.statusChangedAt.getTime()).toBeGreaterThan(project.statusChangedAt.getTime());
  });

  it("the database refuses an unknown package even if the app is bypassed", async () => {
    const { value } = await setup();
    await expect(createProject({ ...value, package: "gold" as never }, db)).rejects.toThrow();
  });

  it("stores and clears the Drive folder", async () => {
    const { value } = await setup();
    const project = await createProject(value, db);
    await setDriveFolder(project.id, { id: "folder1234567", name: "Migss photos" }, db);
    expect(await getProject(project.id, db)).toMatchObject({ driveFolderId: "folder1234567", driveFolderName: "Migss photos" });
    expect((await getProject(project.id, db))!.driveFolderCheckedAt).toBeInstanceOf(Date);
    await setDriveFolder(project.id, null, db);
    expect(await getProject(project.id, db)).toMatchObject({ driveFolderId: null, driveFolderCheckedAt: null });
  });
});
