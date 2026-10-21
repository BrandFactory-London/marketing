import { targetLength, type CheckIssue } from "@/lib/checks";
import type { CriticIssue } from "@/db/schema";
import { EXAMPLES_ARE_VOICE_ONLY, list, NO_INVENTED_PRACTICE, PLACEHOLDER_FORMAT, RHYTHM_PATTERNS, specText, type SpecForPrompt } from "./shared";

// The writer drafts the post from the confirmed spec, and redrafts it from the issues a round found
// (decisions 10, 11, 12).
export const PROMPT_VERSION = "writer-2";

export const INSTRUCTIONS = `You are writing one SEO blog post for the client in the knowledge pack above, from the spec in the user message. Follow the BrandFactory rules without exception and the output format exactly.

Before you finish, check the draft against these, which every earlier writer got wrong:
- Never use these rhythm patterns anywhere, and above all not in the call to action:
${list(RHYTHM_PATTERNS)}
  Name one thing, or two, and give a reason.
- ${NO_INVENTED_PRACTICE} Where the post needs a client detail the pack does not give, write a placeholder in this form: ${PLACEHOLDER_FORMAT}. Amir fills it in before the post is approved.
- ${EXAMPLES_ARE_VOICE_ONLY}
- Open the way the spec's angle says. Do not repeat the excerpt as the first paragraph.
- End with the call to action under its own H2 heading, linking to the call to action's page.
- Aim for the target length in the user message, the middle of the spec's range. The range is a hard limit; earlier drafts overshot it by about 150 words.

Reply with the post in Markdown only: no preamble and no notes after it.`;

export type WriterFix = {
  previousDraft: string;
  checkIssues: readonly CheckIssue[];
  criticIssues: readonly CriticIssue[];
};

function issueLine(issue: { message?: string; note?: string; quote?: string; category?: string }): string {
  const what = issue.message ?? `[${issue.category}] ${issue.note}`;
  return issue.quote ? `${what} Quote: "${issue.quote}"` : what;
}

// Regenerate with a note (γ5 orientation Q4): Amir's note and the post as it stands, his edits included.
export type WriterRegenerate = { note: string; current: string };

export function writerUserMessage(spec: SpecForPrompt, fix?: WriterFix | null, regenerate?: WriterRegenerate | null): string {
  const parts = [`The spec:\n${specText(spec)}`, `Target length: about ${targetLength(spec.lengthMin, spec.lengthMax)} words.`];
  if (regenerate && !fix) {
    parts.push(
      "Amir has reviewed this post and asks for a new version. Apply his note. Keep everything else, including the edits he made himself, unless the note says otherwise. Placeholders he has not filled stay as placeholders.",
      `Amir's note:\n${regenerate.note}`,
      `The post as it stands:\n\n${regenerate.current}`,
    );
  } else if (fix) {
    const issues = [...fix.checkIssues.map(issueLine), ...fix.criticIssues.map(issueLine)];
    parts.push(
      `Your previous draft failed review. Rewrite it so every issue below is fixed, keeping what works. Do not introduce new problems.`,
      `Issues:\n${list(issues)}`,
      `The previous draft:\n\n${fix.previousDraft}`,
    );
  } else {
    parts.push("Write the post.");
  }
  return parts.join("\n\n");
}
