import { CHANNELS, MAX_HASHTAGS, type DerivativeChannel, type DerivativeIssue } from "@/lib/derivative-checks";
import { list, NO_INVENTED_PRACTICE, RHYTHM_PATTERNS } from "./shared";

// GMB and LinkedIn copy from an approved post (design decision 20, γ6 orientation Q6). One call per channel, so
// either can be regenerated alone. The knowledge pack above it gives the client's voice and the BrandFactory rules.
export const PROMPT_VERSION = "derivative-1";

const CHANNEL_RULES: Record<DerivativeChannel, string> = {
  gmb: `This is a Google Business Profile (GMB) post.
- Aim for ${CHANNELS.gmb.aim[0]} to ${CHANNELS.gmb.aim[1]} characters; never more than ${CHANNELS.gmb.max}.
- Plain text only: no Markdown, no hashtags, no links. The post's link goes on the post's "Learn more" button, which Amir adds.
- No phone numbers, email addresses or other contact details: leave contact to the call button. Google rejects posts with a phone number in the text.
- Open with the most useful point of the article for a local homeowner, then one or two concrete details from it, then one short line inviting them to read the full guide.`,
  linkedin: `This is a LinkedIn post from the company page.
- Aim for ${CHANNELS.linkedin.aim[0]} to ${CHANNELS.linkedin.aim[1]} characters; never more than ${CHANNELS.linkedin.max}.
- Plain text only: no Markdown. Short paragraphs separated by blank lines.
- First line: a short hook that states a specific point from the article, not a question and not a cliché.
- Then two or three short paragraphs with concrete details from the article.
- End with one line inviting readers to read the full article, followed by the article's link on its own line, exactly as given.
- Up to ${MAX_HASHTAGS} relevant hashtags on the last line, or none.`,
};

export const INSTRUCTIONS = `You write a short social post that points to one of the client's blog posts, from the approved article in the user message. Write in the client's voice from the knowledge pack above and follow the BrandFactory rules without exception.

Rules for every derivative:
- Use only facts the article or the knowledge pack states. ${NO_INVENTED_PRACTICE}
- Never use these rhythm patterns:
${list(RHYTHM_PATTERNS)}
- Never use em dashes or en dashes.
- No placeholders: if a detail is missing, leave it out.

Reply with the post's text only: no preamble, no notes and no quotation marks around it.`;

export function derivativeUserMessage(input: { channel: DerivativeChannel; title: string; excerpt: string; body: string; postUrl: string; note: string | null }): string {
  const parts = [
    CHANNEL_RULES[input.channel],
    `The article's link: ${input.postUrl}`,
    `The approved article:\n\n# ${input.title}\n\n${input.excerpt}\n\n${input.body}`,
  ];
  if (input.note) parts.push(`Amir's note for this version: ${input.note}`);
  return parts.join("\n\n");
}

// One fix round when the scripted checks fail, as for posts (γ6 orientation Q6).
export function derivativeFixMessage(previous: string, issues: readonly DerivativeIssue[]): string {
  const lines = issues.map((issue) => (issue.quote ? `${issue.message} Quote: "${issue.quote}"` : issue.message));
  return `Your previous version:\n\n${previous}\n\nIt failed these checks:\n${list(lines)}\n\nRewrite it so every check passes, keeping everything else.`;
}
