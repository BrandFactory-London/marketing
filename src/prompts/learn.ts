import { z } from "zod";
import { CHANNELS, RULE_SCOPES, type Channel, type KnowledgeTier } from "@/config/knowledge";
import type { EditHunk } from "@/db/schema";
import { list } from "./shared";

// Rule and fact suggestions from everything Amir says about a post (γ7 orientation Q2, Q4): a note or a reject on the
// blog post, his edits when approving, a note on a derivative's regenerate, or his edit to a derivative. One call per
// piece of feedback. Claude proposes; Amir accepts or dismisses each one in Settings, so nothing changes the rules
// without him. Replaces rules-1 (γ5) and facts-1 (γ6).
export const PROMPT_VERSION = "learn-1";

export const MAX_CANDIDATES = 5;

// The sections a candidate may join, per tier. Ideal customer profiles, allowed links and Examples stay Amir's to
// write by hand.
export const CANDIDATE_SECTIONS: Record<KnowledgeTier, readonly string[]> = {
  agency: ["writing_rules", "banned_phrases"],
  client: ["business_facts", "voice", "counter_examples"],
  project: ["project_facts", "cta"],
};

// Facts go to the client's business facts or this website's facts.
export const FACT_SECTIONS = ["business_facts", "project_facts"];

const ALL_SECTIONS = Object.values(CANDIDATE_SECTIONS).flat() as [string, ...string[]];

export function isCandidateTarget(tier: string, section: string): tier is KnowledgeTier {
  return tier in CANDIDATE_SECTIONS && CANDIDATE_SECTIONS[tier as KnowledgeTier].includes(section);
}

export const LearnReply = z.object({
  candidates: z
    .array(
      z.object({
        kind: z.enum(["rule", "fact"]).describe("rule = how to write; fact = something true about the client or its website."),
        tier: z.enum(["agency", "client", "project"]).describe("agency = BrandFactory rules for every client; client = this client; project = this website."),
        section: z.enum(ALL_SECTIONS).describe("The section of that tier it joins."),
        scope: z.enum(RULE_SCOPES).describe("The channel the rule applies to, or all. Always all for facts, banned phrases and anything outside writing_rules and voice."),
        text: z.string().describe("The rule or fact as one plain sentence, or for banned_phrases the phrase alone."),
        before: z.string().describe("For an edit: the writer's words it comes from, quoted exactly. For a note: empty."),
        after: z.string().describe("For an edit: Amir's words, quoted exactly, empty if he deleted the text. For a note: the words of the note it comes from, quoted exactly."),
        reason: z.string().describe("One short sentence: why this holds for other posts on other topics."),
      }),
    )
    .describe(`At most ${MAX_CANDIDATES}. Usually empty: most feedback is about one post only.`),
});
export type LearnReply = z.infer<typeof LearnReply>;

const SCOPES = RULE_SCOPES.map((scope) => (scope === "all" ? '"all" (every channel)' : `"${scope}" (${CHANNELS[scope].plural})`)).join(", ");

export const INSTRUCTIONS = `Amir at BrandFactory London reviews what the writer produces from the knowledge pack above: blog posts, and short versions of each post for Google Business Profile (GBP), LinkedIn, Facebook and Pinterest. The user message holds one piece of his feedback: a note saying what was wrong, or his edits to the text. The writer has already used it for that one post. You decide whether it also holds a standing rule or a fact that future posts should follow, and propose it. Amir accepts or dismisses each proposal; you change nothing yourself. Amir is the client's account manager, so a fact he states is true.

Where a proposal can go:
- kind "rule", tier "agency", section "writing_rules": how to write, for every client. Section "banned_phrases": a word or phrase never to use, written alone.
- kind "rule", tier "client", section "voice": how this client sounds. Section "counter_examples": a passage that sounds wrong for this client.
- kind "rule", tier "project", section "cta": how posts on this site ask the reader to act.
- kind "fact", tier "client", section "business_facts": a concrete, lasting fact about the business, such as a guarantee, a service, an area covered, an accreditation or a process.
- kind "fact", tier "project", section "project_facts": a fact about this website only, such as its booking route.

The scope of a rule, one of: ${SCOPES}.
- Only writing_rules and voice can apply to one channel. Everything else, and every fact, is "all".
- Start from the channel the feedback came from. Choose "all" only when the point is about the client or about writing in general and does not depend on that channel's form, for example "never mention prices" or "say bathroom fitter, not installer".
- A point about length, layout, the opening line, links, hashtags or tone on that platform stays on that channel.

The test for every proposal: would it still be right for a different post on a different topic? If not, propose nothing for it.
- "Lead with the drainage point" is about this post's topic: nothing. "Open with the single most useful thing the homeowner can do" is standing: a rule.
- "Mention the Chigwell showroom here" is about this post: nothing. "Migss has a showroom in Chigwell" is a fact, if the pack does not hold it.
- Typo fixes, one-off rewording and anything about this topic only: nothing.

Rules for proposals:
- Never repeat or contradict a rule or fact the knowledge pack or the channel rules already have. If the feedback enforces an existing rule, propose nothing for it.
- Choose the narrowest tier that fits: a client's fact or voice never goes in the agency rules.
- Word a fact as Amir stated it. Quote his words exactly.
- Propose at most ${MAX_CANDIDATES}, and none when nothing is reusable, which is the usual case.`;

export type LearnInput = {
  // Where the feedback came from: a review event on the blog post, or a derivative version's note or edit.
  source: "blog_regenerate" | "blog_reject" | "blog_approve" | "derivative_note" | "derivative_edit";
  channel: Channel;
  title: string;
  note?: string | null;
  hunks?: readonly EditHunk[];
  // The version a derivative note is about, so the model can see what was wrong.
  version?: string | null;
  // Every channel's own rules and voice as they stand.
  channelRules: string;
};

const SOURCE_LINES: Record<LearnInput["source"], string> = {
  blog_regenerate: "Amir asked the writer to redo the blog post, with this note.",
  blog_reject: "Amir rejected the blog post, with this note.",
  blog_approve: "Amir edited the blog post, then approved it. These are his edits, from the writer's last draft to the approved text.",
  derivative_note: "Amir asked the writer to redo this version, saying what was wrong with it.",
  derivative_edit: "Amir edited this version before posting it. These are his edits, from the writer's version to his.",
};

function edits(hunks: readonly EditHunk[]): string {
  return hunks.map((hunk, index) => `Edit ${index + 1}\nBefore: ${hunk.before || "(nothing)"}\nAfter: ${hunk.after || "(deleted)"}`).join("\n\n");
}

export function learnUserMessage(input: LearnInput): string {
  const parts = [`The channel: ${CHANNELS[input.channel].label} ("${input.channel}")`, `The post: ${input.title}`, SOURCE_LINES[input.source]];
  if (input.note) parts.push(`Amir's note:\n${input.note}`);
  if (input.hunks && input.hunks.length > 0) parts.push(`${input.source === "blog_regenerate" ? "He also edited the text first:\n\n" : ""}${edits(input.hunks)}`);
  if (input.version) parts.push(`The version the note is about:\n\n${input.version}`);
  parts.push(`Rules already set for single channels:\n${input.channelRules || list([])}`);
  return parts.join("\n\n");
}
