import { CHANNELS, MAX_HASHTAGS, type DerivativeChannel, type DerivativeIssue } from "@/lib/derivative-checks";
import { list, NO_INVENTED_PRACTICE, RHYTHM_PATTERNS } from "./shared";

// Derivative copy from an approved post (design decision 20, γ6 orientation Q6, γ7 orientation Q5): GBP, LinkedIn,
// Facebook and Pinterest. One call per channel, so each can be regenerated alone. The knowledge pack above it gives the
// client's voice and the BrandFactory rules; the channel's own rules follow these instructions.
export const PROMPT_VERSION = "derivative-2";

const CHANNEL_RULES: Record<DerivativeChannel, string> = {
  gmb: `This is a Google Business Profile (GBP) post.
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
  facebook: `This is a post on the client's Facebook Page.
- Aim for ${CHANNELS.facebook.aim[0]} to ${CHANNELS.facebook.aim[1]} characters; never more than ${CHANNELS.facebook.max}.
- Plain text only: no Markdown, no hashtags. Short paragraphs separated by blank lines.
- Conversational, as the client talking to local homeowners who follow the Page.
- Put the most useful point in the first line: on phones Facebook hides the rest behind "See more".
- Then one or two concrete details from the article.
- End with one line inviting readers to read the full article, followed by the article's link on its own line, exactly as given. Facebook shows a preview of the page from the link.`,
  pinterest: `This is a Pinterest pin that leads to the article.
- Reply in exactly this form, with nothing before or after:
Title: <the pin title>
Description: <the pin description>
- Title: aim for ${CHANNELS.pinterest.title!.aim[0]} to ${CHANNELS.pinterest.title!.aim[1]} characters; never more than ${CHANNELS.pinterest.title!.max}. State what the reader learns, with the article's main search phrase near the start.
- Description: aim for ${CHANNELS.pinterest.aim[0]} to ${CHANNELS.pinterest.aim[1]} characters; never more than ${CHANNELS.pinterest.max}. One or two sentences on what the article covers and who it helps, using the words a homeowner would search for, then one concrete detail from it.
- Plain text only: no Markdown, no hashtags, no links. The article's link is the pin's destination, which Amir adds.`,
};

export const INSTRUCTIONS = `You write a short social post that points to one of the client's blog posts, from the approved article in the user message. Write in the client's voice from the knowledge pack above and follow the BrandFactory rules without exception.

Rules for every derivative:
- Use only facts the article or the knowledge pack states. ${NO_INVENTED_PRACTICE}
- Never use these rhythm patterns:
${list(RHYTHM_PATTERNS)}
- Never use em dashes or en dashes.
- No placeholders: if a detail is missing, leave it out.

Reply with the post's text only, or for a pin in the form its rules give: no preamble, no notes and no quotation marks around it.`;

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
  const lines = issues.map((issue) => {
    const where = issue.field ? `In the ${issue.field}: ` : "";
    return issue.quote ? `${where}${issue.message} Quote: "${issue.quote}"` : `${where}${issue.message}`;
  });
  return `Your previous version:\n\n${previous}\n\nIt failed these checks:\n${list(lines)}\n\nRewrite it so every check passes, keeping everything else.`;
}
