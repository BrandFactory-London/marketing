import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { createClient } from "@/lib/clients";
import { createProject } from "@/lib/projects";
import { saveKnowledge } from "@/lib/knowledge";
import { allChannelRules, buildPack, channelRules, EMPTY_SECTION, loadPack, withChannelRules, type PackInput } from "./pack";

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

  // γ7 orientation Q1: pack.golden.txt is this input's pack as main built it before channel sections existed (44ca0c4).
  it("is unchanged by the channel sections, byte for byte", () => {
    const golden = readFileSync(new URL("./pack.golden.txt", import.meta.url), "utf8");
    expect(buildPack(input)).toBe(golden);
    const withChannels: PackInput = {
      ...input,
      agency: { ...input.agency!, writing_rules_linkedin: "Open with a plain statement." },
      client: { ...input.client!, voice_gmb: "Short and local." },
    };
    expect(buildPack(withChannels)).toBe(golden);
  });

  it("holds no em dashes of its own", () => {
    expect(buildPack(input)).not.toContain("\u2014");
  });
});

describe("channel rules (γ7 orientation Q1)", () => {
  const pack = {
    clientName: "Migss Interiors",
    agency: { writing_rules: "All channels.", writing_rules_linkedin: "Open with a plain statement.", writing_rules_blog: "  " },
    client: { voice: "You and we.", voice_linkedin: "First person plural.", voice_gmb: "Short and local." },
  };

  it("gives a channel only its own rules and voice", () => {
    const linkedin = channelRules(pack, "linkedin");
    expect(linkedin).toBe(
      "## Rules for LinkedIn posts only (apply on top of the knowledge pack, never broken)\n\n" +
        "### BrandFactory rules: LinkedIn post rules\n\nOpen with a plain statement.\n\n" +
        "### Client knowledge (Migss Interiors): LinkedIn post voice\n\nFirst person plural.",
    );
    expect(channelRules(pack, "gmb")).toContain("Short and local.");
    expect(channelRules(pack, "gmb")).not.toContain("plain statement");
    expect(channelRules(pack, "facebook")).toBe("");
  });

  it("leaves the instructions as they were when a channel has nothing of its own", () => {
    expect(withChannelRules("Write the post.", channelRules(pack, "blog"))).toBe("Write the post.");
    expect(withChannelRules("Write the post.", channelRules(pack, "linkedin"))).toMatch(/^Write the post\.\n\n## Rules for LinkedIn/);
  });

  it("lists every channel's own sections for the candidate proposer", () => {
    const all = allChannelRules(pack);
    expect(all).toContain("Open with a plain statement.");
    expect(all).toContain("Short and local.");
    expect(all).not.toContain("All channels.");
  });
});

describe.skipIf(!testDatabaseUrl)("loading the pack (local Postgres)", () => {
  const { db, close } = createTestDb();
  afterAll(close);
  beforeEach(() => resetDomainTables(db));

  it("uses each tier's current version and returns their ids", async () => {
    const client = await createClient({ name: "Migss Interiors", mainContact: null, email: null, phone: null }, db);
    const project = await createProject(
      { clientId: client.id, name: "Migss Interiors website", siteUrl: "https://www.migss.co.uk", status: "active", publishingTarget: "wix_blog" },
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
