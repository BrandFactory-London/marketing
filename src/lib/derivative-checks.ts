import { findPlaceholders, styleIssues, type CheckIssue } from "./checks";

// The scripted checks for GMB and LinkedIn copy (design decision 20, γ6 orientation Q6 as amended at approval).
// Dashes, banned phrases and placeholders as for posts, plus each platform's own limits.

export type DerivativeChannel = "gmb" | "linkedin";

export const CHANNELS: Record<DerivativeChannel, { label: string; aim: [number, number]; max: number }> = {
  // Google Business Profile posts take up to 1,500 characters.
  gmb: { label: "GMB post", aim: [600, 1000], max: 1500 },
  // LinkedIn posts take up to 3,000 characters.
  linkedin: { label: "LinkedIn post", aim: [900, 1500], max: 3000 },
};

export const MAX_HASHTAGS = 3;

export type DerivativeIssue = { check: "length" | "em_dash" | "en_dash" | "banned" | "placeholder" | "link" | "phone" | "hashtags" | "markdown"; message: string; quote?: string };

export type DerivativeChecks = { passed: boolean; issues: DerivativeIssue[]; characters: number };

const URL_PATTERN = /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/gi;
// A run of 10 to 13 digits with spaces, dots, hyphens or brackets between them, optionally after a +: a phone number.
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().-]{8,}\d/g;
const MARKDOWN = [
  { pattern: /^#{1,6}\s/m, what: "a Markdown heading" },
  { pattern: /\*\*[^*]+\*\*|__[^_]+__/, what: "Markdown bold" },
  { pattern: /\[[^\]]+\]\([^)]+\)/, what: "a Markdown link" },
];

export function findPhoneNumbers(text: string): string[] {
  return [...text.matchAll(PHONE_CANDIDATE)]
    .map((match) => match[0].trim())
    .filter((candidate) => {
      const digits = candidate.replace(/\D/g, "").length;
      return digits >= 10 && digits <= 13;
    });
}

function trimUrl(url: string): string {
  return url.replace(/[.,;:!?]+$/, "");
}

function sameUrl(a: string, b: string): boolean {
  const bare = (value: string) => value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  return bare(a) === bare(b);
}

export function checkDerivative(text: string, channel: DerivativeChannel, options: { bannedPhrases: readonly string[]; postUrl: string }): DerivativeChecks {
  const spec = CHANNELS[channel];
  const issues: DerivativeIssue[] = [];
  const characters = [...text].length;
  if (characters > spec.max) issues.push({ check: "length", message: `${characters.toLocaleString("en-GB")} characters; ${spec.label}s take at most ${spec.max.toLocaleString("en-GB")}.` });
  if (characters === 0) issues.push({ check: "length", message: "The text is empty." });

  issues.push(...styleIssues(text, options.bannedPhrases).map((issue: CheckIssue) => ({ ...issue, check: issue.check as DerivativeIssue["check"] })));
  for (const placeholder of findPlaceholders(text)) issues.push({ check: "placeholder", message: "A placeholder is left to fill.", quote: placeholder.text });
  for (const { pattern, what } of MARKDOWN) if (pattern.test(text)) issues.push({ check: "markdown", message: `Uses ${what}; both platforms show plain text.` });

  const urls = [...text.matchAll(URL_PATTERN)].map((match) => trimUrl(match[0]));
  const hashtags = text.match(/(^|\s)#[A-Za-z][\w]*/g) ?? [];
  if (channel === "gmb") {
    for (const url of urls) issues.push({ check: "link", message: "GMB posts carry the link on their button, not in the text.", quote: url });
    for (const phone of findPhoneNumbers(text)) issues.push({ check: "phone", message: "Google rejects posts with a phone number in the text. Leave contact details to the call button.", quote: phone });
    if (hashtags.length > 0) issues.push({ check: "hashtags", message: "GMB posts do not use hashtags." });
  } else {
    if (!urls.some((url) => sameUrl(url, options.postUrl))) issues.push({ check: "link", message: `The post's link (${options.postUrl}) is missing.` });
    for (const url of urls.filter((url) => !sameUrl(url, options.postUrl))) issues.push({ check: "link", message: "Links somewhere other than the post.", quote: url });
    if (hashtags.length > MAX_HASHTAGS) issues.push({ check: "hashtags", message: `${hashtags.length} hashtags; use at most ${MAX_HASHTAGS}.` });
  }
  return { passed: issues.length === 0, issues, characters };
}
