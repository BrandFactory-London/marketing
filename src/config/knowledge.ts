// The named Markdown sections of each knowledge tier (design decision 7). Every tier is stored the same way:
// one row per saved version in knowledge_versions, holding a map from section key to Markdown text.

// The channels a post is written for (γ7 orientation Q1): the blog post itself and its four derivatives. The one list
// every screen, prompt and check reads, so the names never drift (D.3.1). The code key "gmb" is shown as "GBP".
export const CHANNELS = {
  blog: { label: "Blog post", plural: "Blog posts" },
  gmb: { label: "GBP post", plural: "GBP posts" },
  linkedin: { label: "LinkedIn post", plural: "LinkedIn posts" },
  facebook: { label: "Facebook post", plural: "Facebook posts" },
  pinterest: { label: "Pinterest pin", plural: "Pinterest pins" },
} as const;

export type Channel = keyof typeof CHANNELS;
export const CHANNEL_KEYS = Object.keys(CHANNELS) as [Channel, ...Channel[]];

// Where a rule applies: every channel, or one.
export type RuleScope = "all" | Channel;
export const RULE_SCOPES = ["all", ...CHANNEL_KEYS] as [RuleScope, ...RuleScope[]];

export function isRuleScope(value: unknown): value is RuleScope {
  return typeof value === "string" && (RULE_SCOPES as readonly string[]).includes(value);
}

export function scopeLabel(scope: RuleScope): string {
  return scope === "all" ? "All channels" : CHANNELS[scope].plural;
}

// A channel's own rules and voice (γ7 orientation Q1). They stay out of the cached pack and reach only that channel's
// calls; the unscoped sections apply to every channel.
function channelSections<const Base extends string>(base: Base, what: string, help: string) {
  return CHANNEL_KEYS.map((channel) => ({ key: `${base}_${channel}` as `${Base}_${Channel}`, label: `${CHANNELS[channel].label} ${what}`, help, channel }));
}

export const KNOWLEDGE_TIERS = {
  agency: {
    label: "BrandFactory rules",
    sections: [
      { key: "writing_rules", label: "Writing rules", help: "The critic rejects any draft that breaks one." },
      { key: "banned_phrases", label: "Banned phrases", help: "Rejected for every client, on every channel." },
      ...channelSections("writing_rules", "rules", "Writing rules for this channel only, on top of the writing rules for every channel."),
    ],
  },
  client: {
    label: "Client knowledge",
    sections: [
      {
        key: "business_facts",
        label: "Business facts",
        help: "Verified facts the writer may state, including services and locations served as subheadings. Anything else is flagged by the critic.",
      },
      { key: "voice", label: "Voice", help: "How the client sounds, on top of the BrandFactory rules." },
      { key: "examples", label: "Examples", help: "Passages that sound right." },
      { key: "counter_examples", label: "Counter-examples", help: "Passages that sound wrong." },
      ...channelSections("voice", "voice", "How the client sounds on this channel only, on top of the voice for every channel."),
    ],
  },
  project: {
    label: "Project knowledge",
    sections: [
      { key: "icps", label: "Ideal customer profiles", help: "Who the posts on this site are written for." },
      { key: "project_facts", label: "Project facts", help: "Facts for this site only, such as its booking route." },
      { key: "cta", label: "Call to action", help: "What every post asks the reader to do, and where it links." },
      {
        key: "allowed_links",
        label: "Allowed internal links",
        help: "The only paths a post may link to, one per line. The Sitemap tab lists every page on the site.",
      },
    ],
  },
} as const;

export type KnowledgeTier = keyof typeof KNOWLEDGE_TIERS;
export const KNOWLEDGE_TIER_KEYS = Object.keys(KNOWLEDGE_TIERS) as [KnowledgeTier, ...KnowledgeTier[]];

export type KnowledgeSection = { key: string; label: string; help: string; channel?: Channel };

export function knowledgeSections(tier: KnowledgeTier): readonly KnowledgeSection[] {
  return KNOWLEDGE_TIERS[tier].sections;
}

// The sections every channel reads: the cached pack holds only these.
export function sharedSections(tier: KnowledgeTier): readonly KnowledgeSection[] {
  return knowledgeSections(tier).filter((section) => !section.channel);
}

// The section a rule with this scope joins: the base section itself, or its channel version where one exists.
export function scopedSection(tier: KnowledgeTier, base: string, scope: RuleScope): string {
  if (scope === "all") return base;
  const key = `${base}_${scope}`;
  return knowledgeSections(tier).some((section) => section.key === key && section.channel === scope) ? key : base;
}

// Sections that have channel versions: the only ones a rule can be scoped in.
export function hasChannelSections(tier: KnowledgeTier, base: string): boolean {
  return knowledgeSections(tier).some((section) => section.channel && section.key.startsWith(`${base}_`));
}

// Section key to Markdown text.
export type KnowledgeSections = Record<string, string>;
