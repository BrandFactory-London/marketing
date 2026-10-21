import { z } from "zod";
import type { CheckResult } from "@/lib/checks";
import { list, NO_INVENTED_PRACTICE, RHYTHM_PATTERNS, specText, type SpecForPrompt } from "./shared";

// The critic judges a draft that passed the scripted checks and returns a structured verdict (decisions 11, 12).
export const PROMPT_VERSION = "critic-1";

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
- states a client fact, figure or claim that is not in the knowledge pack (placeholders in square brackets are correct, not an issue);
- breaks this rule: ${NO_INVENTED_PRACTICE}
- misses a hard spec item: the opening the spec's angle asks for, the call to action under its own H2 heading, or the link to the call to action's page;
- would mislead or fail a reader on the topic.

Everything else worth fixing is minor. Do not report what the scripted checks already measured (word count, dashes, links, excerpt length, FAQ), which the user message shows passed.

Quote the draft exactly, so each issue can be shown against its line. Report each problem once. Score voice, usefulness and specificity from 1 to 10. If there is nothing blocking, say so with an empty or minor-only issues list.`;

// The verdict follows from the issues, so a model cannot pass a draft it found a blocking issue in.
export function verdictOf(reply: CriticReply): "pass" | "fail" {
  return reply.issues.some((issue) => issue.severity === "blocking") ? "fail" : "pass";
}

export function criticUserMessage(spec: SpecForPrompt, draft: string, checks: CheckResult): string {
  return [
    `The spec:\n${specText(spec)}`,
    `Scripted checks: passed. ${checks.wordCount} words; links ${checks.info.links.join(", ") || "none"}; placeholders ${
      checks.info.placeholders.join(", ") || "none"
    }.`,
    `The draft:\n\n${draft}`,
  ].join("\n\n");
}
