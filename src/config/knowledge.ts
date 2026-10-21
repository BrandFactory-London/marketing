// The named Markdown sections of each knowledge tier (design decision 7). Every tier is stored the same way:
// one row per saved version in knowledge_versions, holding a map from section key to Markdown text.

export const KNOWLEDGE_TIERS = {
  agency: {
    label: "BrandFactory rules",
    sections: [
      { key: "writing_rules", label: "Writing rules", help: "The critic rejects any draft that breaks one." },
      { key: "banned_phrases", label: "Banned phrases", help: "Rejected for every client." },
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

export type KnowledgeSection = { key: string; label: string; help: string };

export function knowledgeSections(tier: KnowledgeTier): readonly KnowledgeSection[] {
  return KNOWLEDGE_TIERS[tier].sections;
}

// Section key to Markdown text.
export type KnowledgeSections = Record<string, string>;
