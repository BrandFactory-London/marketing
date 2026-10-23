import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { projects } from "@/db/schema";
import { createClient, getClient, listClients, parseClientInput, updateClient } from "./clients";

describe("client input", () => {
  it("needs a name and checks the email", () => {
    expect(parseClientInput({ name: " ", email: "nope" })).toEqual({
      ok: false,
      errors: { name: "Enter the client's name.", email: "Enter an email address such as name@business.com." },
    });
  });

  it("keeps optional fields as null", () => {
    expect(parseClientInput({ name: "Migss Interiors", mainContact: "", email: "", phone: " " })).toEqual({
      ok: true,
      value: { name: "Migss Interiors", shortName: null, mainContact: null, email: null, phone: null },
    });
  });

  it("takes an optional short name for calendar titles, up to 30 characters (γ8)", () => {
    expect(parseClientInput({ name: "Migss Interiors", shortName: " Migss " })).toMatchObject({ ok: true, value: { shortName: "Migss" } });
    expect(parseClientInput({ name: "Migss Interiors", shortName: "x".repeat(31) })).toEqual({ ok: false, errors: { shortName: "Keep the short name under 30 characters." } });
  });
});

describe.skipIf(!testDatabaseUrl)("clients (local Postgres)", () => {
  const { db, close } = createTestDb();

  beforeEach(() => resetDomainTables(db));
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  it("creates, reads and updates a client", async () => {
    const created = await createClient({ name: "Migss Interiors", mainContact: "Sam", email: "sam@migss.com", phone: null }, db);
    expect((await getClient(created.id, db))?.name).toBe("Migss Interiors");
    const updated = await updateClient(created.id, { name: "Migss Interiors Ltd", mainContact: null, email: null, phone: "0123" }, db);
    expect(updated).toMatchObject({ name: "Migss Interiors Ltd", mainContact: null, phone: "0123" });
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it("returns null for unknown or malformed ids instead of failing", async () => {
    expect(await getClient("not-a-uuid", db)).toBeNull();
    expect(await getClient("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", db)).toBeNull();
    expect(await updateClient("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", { name: "X", mainContact: null, email: null, phone: null }, db)).toBeNull();
  });

  it("lists clients by name with their projects and derived status", async () => {
    const migss = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    await createClient({ name: "brandFactory London", mainContact: null, email: null, phone: null }, db);
    await db.insert(projects).values([
      { clientId: migss.id, name: "Migss Interiors website", siteUrl: "https://www.migssinteriors.com", status: "active" },
      { clientId: migss.id, name: "Another site", siteUrl: "https://example.com", status: "paused" },
    ]);
    const list = await listClients(db);
    expect(list.map((client) => [client.name, client.status, client.projects.map((p) => p.name)])).toEqual([
      ["brandFactory London", "setup", []],
      ["Migss Interiors", "active", ["Another site", "Migss Interiors website"]],
    ]);
  });
});
