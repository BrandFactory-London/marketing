import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { knowledgeVersions } from "@/db/schema";
import { createClient } from "./clients";
import { createProject } from "./projects";
import {
  getCurrentKnowledge,
  getKnowledgeVersion,
  listKnowledgeVersions,
  normaliseSections,
  saveKnowledge,
  type KnowledgeScope,
} from "./knowledge";

describe("knowledge sections", () => {
  it("keeps the tier's own sections only, all present, with normalised line endings", () => {
    expect(normaliseSections("agency", { writing_rules: "1. Never use em dashes.  \r\n2. Short sentences.\r\n\r\n", voice: "ignored" })).toEqual({
      writing_rules: "1. Never use em dashes.\n2. Short sentences.",
      banned_phrases: "",
    });
  });

  it("stores a channel section only once it holds text (γ7), so older versions keep their shape", () => {
    expect(normaliseSections("client", { voice: "Plain.", voice_linkedin: "First person plural.  ", voice_gmb: "" })).toEqual({
      business_facts: "",
      voice: "Plain.",
      examples: "",
      counter_examples: "",
      voice_linkedin: "First person plural.",
    });
  });
});

describe.skipIf(!testDatabaseUrl)("knowledge versions (local Postgres)", () => {
  const { db, close } = createTestDb();
  let clientScope: KnowledgeScope;
  let otherClientScope: KnowledgeScope;
  let projectScope: KnowledgeScope;
  const agency: KnowledgeScope = { tier: "agency" };

  beforeEach(async () => {
    await resetDomainTables(db);
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const other = await createClient({ name: "Other", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Site", siteUrl: "https://example.com", package: "entry", status: "active", publishingTarget: "wix_blog" },
      db,
    );
    clientScope = { tier: "client", clientId: client.id };
    otherClientScope = { tier: "client", clientId: other.id };
    projectScope = { tier: "project", projectId: project.id };
  });
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  it("has no current version before the first save, and an empty save creates none", async () => {
    expect(await getCurrentKnowledge(clientScope, db)).toBeNull();
    expect(await saveKnowledge(clientScope, { voice: "  " }, db)).toEqual({ status: "unchanged", version: null });
    expect(await listKnowledgeVersions(clientScope, db)).toEqual([]);
  });

  it("adds a version on every change and keeps the old ones readable", async () => {
    const first = await saveKnowledge(clientScope, { business_facts: "Bathrooms and kitchens.", voice: "We and you." }, db);
    const second = await saveKnowledge(clientScope, { business_facts: "Bathrooms and kitchens in Chigwell.", voice: "We and you." }, db);
    expect(first.status).toBe("saved");
    expect(second.status === "saved" && second.version.version).toBe(2);
    expect((await getCurrentKnowledge(clientScope, db))?.sections.business_facts).toBe("Bathrooms and kitchens in Chigwell.");
    expect((await getKnowledgeVersion(clientScope, 1, db))?.sections).toEqual({
      business_facts: "Bathrooms and kitchens.",
      voice: "We and you.",
      examples: "",
      counter_examples: "",
    });
    expect((await listKnowledgeVersions(clientScope, db)).map((v) => v.version)).toEqual([2, 1]);
    expect(await getKnowledgeVersion(clientScope, 3, db)).toBeNull();
  });

  it("saving the same text again creates no version", async () => {
    await saveKnowledge(agency, { writing_rules: "Never use em dashes." }, db);
    const again = await saveKnowledge(agency, { writing_rules: "Never use em dashes.\r\n", banned_phrases: "" }, db);
    expect(again.status).toBe("unchanged");
    expect(await listKnowledgeVersions(agency, db)).toHaveLength(1);
  });

  it("numbers each owner's versions separately", async () => {
    await saveKnowledge(clientScope, { voice: "A" }, db);
    await saveKnowledge(clientScope, { voice: "B" }, db);
    const other = await saveKnowledge(otherClientScope, { voice: "C" }, db);
    const project = await saveKnowledge(projectScope, { cta: "Book a free design consultation." }, db);
    const rules = await saveKnowledge(agency, { banned_phrases: "elevate" }, db);
    expect([other, project, rules].map((result) => result.status === "saved" && result.version.version)).toEqual([1, 1, 1]);
  });

  it("two saves at the same moment get different version numbers", async () => {
    const results = await Promise.all([
      saveKnowledge(projectScope, { cta: "First" }, db),
      saveKnowledge(projectScope, { cta: "Second" }, db),
      saveKnowledge(projectScope, { cta: "Third" }, db),
    ]);
    const versions = results.map((result) => (result.status === "saved" ? result.version.version : 0)).sort();
    expect(versions).toEqual([1, 2, 3]);
  });

  it("the database refuses a version whose owner does not match its tier", async () => {
    const clientId = (clientScope as { clientId: string }).clientId;
    await expect(db.insert(knowledgeVersions).values({ tier: "agency", clientId, version: 1, sections: {} })).rejects.toThrow();
    await expect(db.insert(knowledgeVersions).values({ tier: "project", version: 1, sections: {} })).rejects.toThrow();
  });

  it("the database refuses a second agency version 1 (nulls not distinct)", async () => {
    await db.insert(knowledgeVersions).values({ tier: "agency", version: 1, sections: {} });
    await expect(db.insert(knowledgeVersions).values({ tier: "agency", version: 1, sections: {} })).rejects.toThrow();
    const [row] = (await db.execute(sql`select count(*)::int as n from knowledge_versions where tier = 'agency'`)).rows as { n: number }[];
    expect(row.n).toBe(1);
  });
});
