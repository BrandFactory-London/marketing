import { z } from "zod";

// Fact suggestions from a regenerate note (γ6 handoff item 8, γ6 orientation Q7). A note can state a fact the knowledge
// does not hold; Claude proposes it for the client or project knowledge, and Amir accepts or dismisses it in Settings
// with the rule candidates.
export const PROMPT_VERSION = "facts-1";

export const MAX_FACTS = 3;

// The sections a fact may join: the client's business facts, or this website's facts.
export const FACT_TARGETS = { client: "business_facts", project: "project_facts" } as const;

export const FactsReply = z.object({
  facts: z
    .array(
      z.object({
        tier: z.enum(["client", "project"]).describe("client = a fact about the business; project = a fact about this website only."),
        text: z.string().describe("The fact as one plain sentence, worded as Amir stated it."),
        quote: z.string().describe("The words of the note it comes from, quoted exactly."),
        reason: z.string().describe("One short sentence: why other posts would use it."),
      }),
    )
    .describe(`At most ${MAX_FACTS}. Usually empty: most notes ask for edits and state no fact.`),
});
export type FactsReply = z.infer<typeof FactsReply>;

export const INSTRUCTIONS = `Amir at BrandFactory London asked the writer to redo a blog post, with a note. Amir is the client's account manager, so a fact he states in a note is true. You read the note and propose any concrete fact about the client or its website that the note states and the knowledge pack above does not hold, so future posts can use it. Amir accepts or dismisses each proposal; you change nothing yourself.

Propose a fact only when it is:
- concrete and lasting, such as a guarantee, a service, an area covered, an accreditation, a price range, a process or a team detail;
- stated in the note, not implied by it;
- missing from the knowledge pack. If the pack already says it, propose nothing for it.

Never propose:
- instructions about this post, such as "shorten the opening" or "add a section on drainage";
- opinions, style preferences or anything about how to write;
- anything you would have to guess.

Choose tier "client" for facts about the business and "project" for facts about this website only, such as its booking route. Word each fact as Amir wrote it, as one sentence. Propose at most ${MAX_FACTS}; return none when the note states no new fact, which is the usual case.`;

export function factsUserMessage(input: { title: string; note: string }): string {
  return `The post: ${input.title}\n\nAmir's note:\n${input.note}`;
}
