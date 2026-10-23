import { CHANNELS, KNOWLEDGE_TIERS, knowledgeSections, sharedSections, type Channel, type KnowledgeSections, type KnowledgeTier } from "@/config/knowledge";
import { getDb, type Database } from "@/db/client";
import { getCurrentKnowledge } from "@/lib/knowledge";
import { getProject } from "@/lib/projects";

// The knowledge pack every spec, writer and critic call starts with (γ4 orientation Q5), in the model test's
// shape: BrandFactory rules, client knowledge, project knowledge, then the output format. It is the cached
// prefix of the system prompt, so the same versions must always give the same text, byte for byte: no dates,
// no ids, sections in the fixed order of config/knowledge.ts. Channel sections stay out of it, so every channel
// shares one cached prefix (γ7 orientation Q1); channelRules gives the block that follows it, uncached.

export const EMPTY_SECTION = "None recorded.";

export const OUTPUT_FORMAT = [
  "- Markdown. One H1 title, H2 section headings, H3 only if needed.",
  '- First line after the title: an excerpt of at most 160 characters, prefixed "Excerpt: ".',
  "- End with a call-to-action section under its own H2 heading, asking for what the spec's call to action says and linking to its page.",
  '- Include an FAQ section (H2 "Frequently asked questions") with 3 to 5 questions only if the spec says so.',
  "- Link only to the allowed internal links, by path, with Markdown links.",
].join("\n");

export type PackInput = {
  clientName: string;
  projectName: string;
  agency: KnowledgeSections | null;
  client: KnowledgeSections | null;
  project: KnowledgeSections | null;
};

function tierBlock(tier: KnowledgeTier, heading: string, sections: KnowledgeSections | null): string {
  const parts = sharedSections(tier).map(({ key, label }) => {
    const text = sections?.[key]?.replace(/\r\n?/g, "\n").trim();
    return `### ${label}\n\n${text || EMPTY_SECTION}`;
  });
  return [`## ${heading}`, ...parts].join("\n\n");
}

export function buildPack(input: PackInput): string {
  return [
    `# Knowledge pack: ${input.projectName}`,
    tierBlock("agency", `Tier 1: ${KNOWLEDGE_TIERS.agency.label} (apply to every post, never broken)`, input.agency),
    tierBlock("client", `Tier 2: ${KNOWLEDGE_TIERS.client.label} (${input.clientName})`, input.client),
    tierBlock("project", `Tier 3: ${KNOWLEDGE_TIERS.project.label} (${input.projectName})`, input.project),
    `## Output format for every draft\n\n${OUTPUT_FORMAT}`,
  ].join("\n\n") + "\n";
}

export type LoadedPack = {
  text: string;
  // Recorded on the spec and the generation (decision 7). Null where a tier has never been saved.
  agencyVersionId: string | null;
  clientVersionId: string | null;
  projectVersionId: string | null;
  // The project's sections, for the allowed links and the call to action.
  project: KnowledgeSections | null;
  agency: KnowledgeSections | null;
  // The client's sections, for the Examples check (γ5).
  client: KnowledgeSections | null;
  clientName: string;
  siteUrl: string;
};

// The pack from each tier's current version.
export async function loadPack(projectId: string, db: Database = getDb()): Promise<LoadedPack> {
  const project = await getProject(projectId, db);
  if (!project) throw new Error("That project no longer exists.");
  const [agency, client, own] = await Promise.all([
    getCurrentKnowledge({ tier: "agency" }, db),
    getCurrentKnowledge({ tier: "client", clientId: project.clientId }, db),
    getCurrentKnowledge({ tier: "project", projectId }, db),
  ]);
  return {
    text: buildPack({
      clientName: project.clientName,
      projectName: project.name,
      agency: agency?.sections ?? null,
      client: client?.sections ?? null,
      project: own?.sections ?? null,
    }),
    agencyVersionId: agency?.id ?? null,
    clientVersionId: client?.id ?? null,
    projectVersionId: own?.id ?? null,
    project: own?.sections ?? null,
    agency: agency?.sections ?? null,
    client: client?.sections ?? null,
    clientName: project.clientName,
    siteUrl: project.siteUrl,
  };
}

// One channel's own rules and voice, for the instructions after the cached pack (γ7 orientation Q1). Empty when the
// channel has none, so a call's prompt is unchanged until Amir adds one.
export function channelRules(pack: Pick<LoadedPack, "agency" | "client" | "clientName">, channel: Channel): string {
  const parts: string[] = [];
  for (const [tier, sections, owner] of [
    ["agency", pack.agency, KNOWLEDGE_TIERS.agency.label],
    ["client", pack.client, `${KNOWLEDGE_TIERS.client.label} (${pack.clientName})`],
  ] as const) {
    for (const section of knowledgeSections(tier).filter((item) => item.channel === channel)) {
      const text = sections?.[section.key]?.replace(/\r\n?/g, "\n").trim();
      if (text) parts.push(`### ${owner}: ${section.label}\n\n${text}`);
    }
  }
  if (parts.length === 0) return "";
  return [`## Rules for ${CHANNELS[channel].plural} only (apply on top of the knowledge pack, never broken)`, ...parts].join("\n\n");
}

// Every channel's own sections, for the candidate proposer, which must see what already exists.
export function allChannelRules(pack: Pick<LoadedPack, "agency" | "client" | "clientName">): string {
  return (Object.keys(CHANNELS) as Channel[]).map((channel) => channelRules(pack, channel)).filter(Boolean).join("\n\n");
}

// A role's instructions with the channel block after them.
export function withChannelRules(instructions: string, block: string): string {
  return block ? `${instructions}\n\n${block}` : instructions;
}
