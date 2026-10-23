import { z } from "zod";
import { list, NO_INVENTED_PRACTICE, type PostBrief } from "./shared";

// The writer model turns a slot's topic into a spec Amir edits or confirms (decision 14, γ4 orientation Q3).
export const PROMPT_VERSION = "spec-2";

export type FaqMode = "useful" | "always" | "never";

export const SpecReply = z.object({
  keyword: z.string().describe("The primary search phrase the post targets, lower case."),
  postType: z.string().describe("For example guide, comparison, cost guide, how-to or local guide."),
  location: z.string().nullable().describe("The place the post focuses on, from the areas the client serves, or null."),
  angle: z.string().describe("One or two sentences: what the post argues or answers, and what its opening paragraph must do."),
  outline: z.array(z.string()).describe("The H2 headings in order, ending with the call-to-action heading."),
  facts: z.array(z.string()).describe("Facts from the knowledge pack the post should use, quoted or closely paraphrased."),
  links: z.array(z.string()).describe("Internal link paths from the allowed list, by path only."),
  faq: z.boolean().describe("Whether the post has a Frequently asked questions section."),
});
export type SpecReply = z.infer<typeof SpecReply>;

export const INSTRUCTIONS = `You are planning one SEO blog post for the client in the knowledge pack above. You write the spec, not the post. Amir at BrandFactory London reads the spec and edits or confirms it before anything is written.

Rules for the spec:
- Choose a primary keyword a homeowner would actually search for, matching the topic and, where it fits, one of the areas the client serves.
- The angle says what the post answers and what its opening paragraph must do. If the topic is a question, the opening answers it directly.
- The outline lists the H2 headings in order. Size it to the length range. The last heading is the call to action.
- Facts must come from the knowledge pack. Do not add facts of your own. Where the post will need a client figure the pack does not give, say so as a placeholder in square brackets, for example [Migss bathroom price range].
- ${NO_INVENTED_PRACTICE}
- Links must be paths from the allowed internal links list, and must include the call to action's page.
- Do not repeat a page the site already has. The user message lists the existing pages.
- British English. No em dashes.`;

export type SpecPromptInput = PostBrief & {
  slotDate: string;
  faqMode: FaqMode;
  pages: readonly { path: string; title: string }[];
  // When Amir asks for another draft of the spec: his note and the spec he saw.
  redraft?: { note: string; previous: SpecReply } | null;
};

const FAQ_RULE: Record<FaqMode, string> = {
  useful: "Include one only if it would help a reader of this topic. Set faq accordingly.",
  always: "Always include one. Set faq to true.",
  never: "Never include one. Set faq to false.",
};

export function specUserMessage(input: SpecPromptInput): string {
  const parts = [
    `Topic: ${input.topic}`,
    `Publishing date: ${input.slotDate}`,
    `Length: ${input.lengthMin} to ${input.lengthMax} words`,
    `Call to action: ${input.cta}`,
    `Pillar: ${input.pillar ?? "None"}`,
    `FAQ section: ${FAQ_RULE[input.faqMode]}`,
    `Notes from Amir: ${input.notes ?? "None"}`,
    `Existing pages on the site:\n${list(
      input.pages.map((page) => `${page.path} (${page.title})`),
      "None imported.",
    )}`,
  ];
  if (input.redraft) {
    parts.push(
      `Amir asked for another draft of this spec. His note: ${input.redraft.note}`,
      `The spec he saw:\n${JSON.stringify(input.redraft.previous, null, 2)}`,
    );
  }
  return parts.join("\n\n");
}
