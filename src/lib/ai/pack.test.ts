import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { createClient } from "@/lib/clients";
import { createProject } from "@/lib/projects";
import { saveKnowledge } from "@/lib/knowledge";
import { buildPack, EMPTY_SECTION, loadPack, type PackInput } from "./pack";

const input: PackInput = {
  clientName: "Migss Interiors",
  projectName: "Migss Interiors website",
  agency: { writing_rules: "1. Never use em dashes.", banned_phrases: '- "elevate"' },
  client: { business_facts: "Bathroom and kitchen renovation.", voice: "You and we.", examples: "", counter_examples: "" },
  project: { icps: "Homeowners in Chigwell.", project_facts: "", cta: "Book a free design consultation at /contact.", allowed_links: "/contact" },
};

describe("knowledge pack", () => {
  it("is the same text, byte for byte, for the same versions", () => {
    const shuffled: PackInput = {
      ...input,
      client: { counter_examples: "", examples: "", voice: "You and we.", business_facts: "Bathroom and kitchen renovation." },
    };
    expect(buildPack(shuffled)).toBe(buildPack(input));
    expect(buildPack({ ...input, client: { ...input.client!, voice: "You and we.\r\n" } })).toBe(buildPack(input));
  });

  it("keeps the model test's order: rules, client, project, output format", () => {
    const pack = buildPack(input);
    const headings = pack.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual([
      "## Tier 1: BrandFactory rules (apply to every post, never broken)",
      "## Tier 2: Client knowledge (Migss Interiors)",
      "## Tier 3: Project knowledge (Migss Interiors website)",
      "## Output format for every draft",
    ]);
    expect(pack.indexOf("### Writing rules")).toBeLessThan(pack.indexOf("### Banned phrases"));
    expect(pack).toContain(`### Examples\n\n${EMPTY_SECTION}`);
  });

  it("marks a tier that was never saved instead of leaving it out", () => {
    expect(buildPack({ ...input, client: null })).toContain(`### Business facts\n\n${EMPTY_SECTION}`);
  });

  it("holds no em dashes of its own", () => {
    expect(buildPack(input)).not.toContain("—");
  });
});

describe.skipIf(!testDatabaseUrl)("loading the pack (local Postgres)", () => {
  const { db, close } = createTestDb();
  afterAll(close);
  beforeEach(() => resetDomainTables(db));

  it("uses each tier's current version and returns their ids", async () => {
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss Interiors website", siteUrl: "https://www.migss.co.uk", package: "entry", status: "active", publishingTarget: "wix_blog" },
      db,
    );
    await saveKnowledge({ tier: "agency" }, { writing_rules: "Old rule." }, db);
    const agency = await saveKnowledge({ tier: "agency" }, { writing_rules: "New rule." }, db);
    const own = await saveKnowledge({ tier: "project", projectId: project.id }, { allowed_links: "/contact" }, db);

    const pack = await loadPack(project.id, db);
    expect(pack.text).toContain("New rule.");
    expect(pack.text).not.toContain("Old rule.");
    expect(pack.agencyVersionId).toBe(agency.version?.id);
    expect(pack.clientVersionId).toBeNull();
    expect(pack.projectVersionId).toBe(own.version?.id);
    expect(pack.text).toBe((await loadPack(project.id, db)).text);
  });
});
