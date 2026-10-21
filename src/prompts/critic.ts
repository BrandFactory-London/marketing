import { z } from "zod";
import type { CheckResult } from "@/lib/checks";
import { EXAMPLES_ARE_VOICE_ONLY, list, NO_INVENTED_PRACTICE, RHYTHM_PATTERNS, specText, type SpecForPrompt } from "./shared";

// The critic judges a draft that passed the scripted checks and returns a structured verdict (decisions 11, 12).
export const PROMPT_VERSION = "critic-2";

export const CRITIC_CATEGORIES = ["rules", "rule of three", "banned", "facts", "spec", "structure", "voice", "usefulness"] as const;

export const CriticReply = z.object({
  summary: z.string().describe("Two sentences at most: the draft's main strength and its main problem."),
  issues: z.array(
    z.object({
      quote: z.string().describe("The exact words from the draft, copied character for character."),
      category: z.enum(CRITIC_CATEGORIES),
      note: z.string().describe("What is wrong and how to fix it, in one or two sentences."),
      severity: z.enum(["blocking", "minor"]),
    }),
  ),
  placeholders: z
    .array(
      z.object({
        quote: z.string().describe("The placeholder exactly as written, square brackets included."),
        ask: z.string().describe("In plain words, what Amir must supply to replace it."),
      }),
    )
    .describe("Every square-bracketed placeholder left in the draft, in order. Empty if there are none."),
  scores: z.object({
    voice: z.number().int().describe("1 to 10"),
    usefulness: z.number().int().describe("1 to 10"),
    specificity: z.number().int().describe("1 to 10"),
  }),
});
export type CriticReply = z.infer<typeof CriticReply>;

export const INSTRUCTIONS = `You are the critic for one SEO blog post draft for the client in the knowledge pack above. Judge it against the BrandFactory rules, the client's knowledge and the spec in the user message. You do not rewrite it.

An issue is blocking when the draft:
- breaks a BrandFactory rule or uses a banned phrase, including these rhythm patterns, wherever they appear:
${list(RHYTHM_PATTERNS)}
- states a client fact, figure or claim that is not in the knowledge pack;
- breaks this rule: ${NO_INVENTED_PRACTICE}
- reuses or closely paraphrases a sentence or clause from the client's Examples or Counter-examples (category "voice"). ${EXAMPLES_ARE_VOICE_ONLY}
- misses a hard spec item: the opening the spec's angle asks for, the call to action under its own H2 heading, or the link to the call to action's page;
- has a title that promises a structure or content the body does not deliver, such as a number of steps or items, a week-by-week or step-by-step order, a comparison or a price (category "structure");
- would mislead or fail a reader on the topic.

A placeholder in square brackets marks a fact the knowledge pack does not give. Leaving one is correct, so it is never an issue and never fails the draft. It is not resolved, though: list every placeholder in "placeholders", quoted exactly, with what Amir must supply in plain words.

Everything else worth fixing is minor. Do not report what the scripted checks already measured (word count, dashes, links, excerpt length, FAQ), which the user message shows passed.

Quote the draft exactly, so each issue can be shown against its line. Report each problem once. Score voice, usefulness and specificity from 1 to 10. If there is nothing blocking, say so with an empty or minor-only issues list.`;

// The verdict follows from the issues, so a model cannot pass a draft it found a blocking issue in.
export function verdictOf(reply: CriticReply): "pass" | "fail" {
  return reply.issues.some((issue) => issue.severity === "blocking") ? "fail" : "pass";
}

export function criticUserMessage(spec: SpecForPrompt, draft: string, checks: CheckResult): string {
  return [
    `The spec:\n${specText(spec)}`,
    `Scripted checks: passed. ${checks.wordCount} words${checks.info.lengthNote ? ` (${checks.info.lengthNote})` : ""}; links ${checks.info.links.join(", ") || "none"}; placeholders ${
      checks.info.placeholders.join(", ") || "none"
    }.`,
    `The draft:\n\n${draft}`,
  ].join("\n\n");
}
