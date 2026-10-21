import { z } from "zod";
import type { KnowledgeTier } from "@/config/knowledge";
import type { EditHunk } from "@/db/schema";
import { list } from "./shared";

// Rule candidates from Amir's edits (design decision 17, γ5 orientation Q5). Claude proposes; Amir accepts or
// dismisses each one in Settings, so nothing changes the rules without him.
export const PROMPT_VERSION = "rules-1";

export const MAX_CANDIDATES = 5;

// The sections a candidate may join, per tier. Ideal customer profiles, allowed links and Examples stay Amir's to
// write by hand.
export const CANDIDATE_SECTIONS: Record<KnowledgeTier, readonly string[]> = {
  agency: ["writing_rules", "banned_phrases"],
  client: ["business_facts", "voice", "counter_examples"],
  project: ["project_facts", "cta"],
};

const ALL_SECTIONS = Object.values(CANDIDATE_SECTIONS).flat() as [string, ...string[]];

export function isCandidateTarget(tier: string, section: string): tier is KnowledgeTier {
  return tier in CANDIDATE_SECTIONS && CANDIDATE_SECTIONS[tier as KnowledgeTier].includes(section);
}

export const RulesReply = z.object({
  candidates: z
    .array(
      z.object({
        tier: z.enum(["agency", "client", "project"]).describe("agency = BrandFactory rules for every client; client = this client; project = this website."),
        section: z.enum(ALL_SECTIONS).describe("The section of that tier the rule joins."),
        text: z.string().describe("The rule or fact as one plain sentence, or for banned_phrases the phrase alone."),
        before: z.string().describe("The writer's words this comes from, quoted from the edit."),
        after: z.string().describe("Amir's words, quoted from the edit. Empty if he deleted the text."),
        reason: z.string().describe("One short sentence: why this would improve other posts."),
      }),
    )
    .describe(`At most ${MAX_CANDIDATES}. Empty when the edits hold nothing reusable.`),
});
export type RulesReply = z.infer<typeof RulesReply>;

export const INSTRUCTIONS = `Amir at BrandFactory London edited a blog post the writer drafted from the knowledge pack above, then approved it. You read his edits and propose rules or facts that would make future drafts need fewer of the same edits. Amir accepts or dismisses each proposal; you change nothing yourself.

Where a proposal can go:
- tier "agency", section "writing_rules": a writing rule for every client. Section "banned_phrases": a word or phrase never to use, written alone.
- tier "client", section "business_facts": a fact about this client that Amir supplied, typically by filling a [CONFIRM: ...] placeholder. Section "voice": how this client sounds. Section "counter_examples": a passage that sounds wrong for this client.
- tier "project", section "project_facts": a fact about this website only. Section "cta": how posts on this site should ask the reader to act.

Rules for proposals:
- Propose only what would improve other posts. Ignore typo fixes, one-off rewording and edits specific to this topic.
- A fact Amir typed in place of a placeholder is worth proposing as a business fact, worded as he wrote it.
- Never repeat or contradict a rule or fact the knowledge pack already has. If an edit enforces an existing rule, propose nothing for it.
- Choose the narrowest tier that fits: a client's fact never goes in the agency rules.
- Quote the edit's before and after text exactly.
- Propose at most ${MAX_CANDIDATES}, and none if nothing is reusable.`;

export function rulesUserMessage(input: { title: string; hunks: readonly EditHunk[]; notes: readonly string[] }): string {
  const edits = input.hunks.map((hunk, index) => `Edit ${index + 1}\nBefore: ${hunk.before || "(nothing)"}\nAfter: ${hunk.after || "(deleted)"}`).join("\n\n");
  return [
    `The post: ${input.title}`,
    `Amir's edits, from the writer's last draft to the approved text:\n\n${edits}`,
    `Amir's notes on earlier versions of this post:\n${list(input.notes)}`,
  ].join("\n\n");
}
