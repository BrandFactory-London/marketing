import { CHANNELS as CHANNEL_NAMES } from "@/config/knowledge";
import { findPlaceholders, styleIssues, type CheckIssue } from "./checks";

// The scripted checks for derivative copy (design decision 20, γ6 orientation Q6 as amended, γ7 orientation Q5).
// Dashes, banned phrases and placeholders as for posts, plus each platform's own limits.

export type DerivativeChannel = "gmb" | "linkedin" | "facebook" | "pinterest";

export type ChannelSpec = { label: string; aim: [number, number]; max: number; title?: { aim: [number, number]; max: number } };

export const CHANNELS: Record<DerivativeChannel, ChannelSpec> = {
  // Google Business Profile posts take up to 1,500 characters.
  gmb: { label: CHANNEL_NAMES.gmb.label, aim: [600, 1000], max: 1500 },
  // LinkedIn posts take up to 3,000 characters.
  linkedin: { label: CHANNEL_NAMES.linkedin.label, aim: [900, 1500], max: 3000 },
  // Facebook allows far more (63,206 by third-party counts; no Meta page found). 2,000 is our own cap, and the prompt
  // puts the point first because mobile cuts to "See more" early (γ7 orientation Q5).
  facebook: { label: CHANNEL_NAMES.facebook.label, aim: [300, 600], max: 2000 },
  // Pinterest's Create Pin API: title up to 100 characters, description up to 800.
  pinterest: { label: CHANNEL_NAMES.pinterest.label, aim: [200, 500], max: 800, title: { aim: [40, 70], max: 100 } },
};

export const DERIVATIVE_CHANNELS = Object.keys(CHANNELS) as [DerivativeChannel, ...DerivativeChannel[]];

export const MAX_HASHTAGS = 3;

export type DerivativeIssue = {
  check: "length" | "em_dash" | "en_dash" | "banned" | "placeholder" | "link" | "phone" | "hashtags" | "markdown" | "format";
  message: string;
  quote?: string;
  // Pinterest only: the field the issue is in.
  field?: "title" | "description";
};

export type DerivativeChecks = { passed: boolean; issues: DerivativeIssue[]; characters: number; titleCharacters?: number };

// What one version holds: the text, and for a pin its title as well.
export type DerivativeText = { title?: string | null; body: string };

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

// A pin comes back from the model as two labelled lines (γ7 orientation Q5). Null when it is not in that shape.
export function parsePin(reply: string): { title: string; body: string } | null {
  const match = /^\s*Title:\s*(.+?)\s*\n+\s*Description:\s*([\s\S]+?)\s*$/i.exec(reply.replace(/\r\n?/g, "\n"));
  if (!match || !match[1].trim() || !match[2].trim()) return null;
  return { title: match[1].trim(), body: match[2].trim() };
}

// The labelled form of a pin, for the fix round.
export function pinText(text: DerivativeText): string {
  return `Title: ${text.title ?? ""}\nDescription: ${text.body}`;
}

function textIssues(text: string, bannedPhrases: readonly string[], field?: DerivativeIssue["field"]): DerivativeIssue[] {
  const issues: DerivativeIssue[] = [];
  issues.push(...styleIssues(text, bannedPhrases).map((issue: CheckIssue) => ({ ...issue, check: issue.check as DerivativeIssue["check"], field })));
  for (const placeholder of findPlaceholders(text)) issues.push({ check: "placeholder", message: "A placeholder is left to fill.", quote: placeholder.text, field });
  for (const { pattern, what } of MARKDOWN) if (pattern.test(text)) issues.push({ check: "markdown", message: `Uses ${what}; the platform shows plain text.`, field });
  return issues;
}

function lengthIssue(characters: number, max: number, what: string, field?: DerivativeIssue["field"]): DerivativeIssue | null {
  if (characters === 0) return { check: "length", message: `The ${field ?? "text"} is empty.`, field };
  if (characters > max) return { check: "length", message: `${characters.toLocaleString("en-GB")} characters; ${what} take at most ${max.toLocaleString("en-GB")}.`, field };
  return null;
}

export function checkDerivative(input: string | DerivativeText, channel: DerivativeChannel, options: { bannedPhrases: readonly string[]; postUrl: string }): DerivativeChecks {
  const { title, body: text } = typeof input === "string" ? { title: null, body: input } : input;
  const spec = CHANNELS[channel];
  const issues: DerivativeIssue[] = [];
  const characters = [...text].length;
  const urls = [...text.matchAll(URL_PATTERN)].map((match) => trimUrl(match[0]));
  const hashtags = text.match(/(^|\s)#[A-Za-z][\w]*/g) ?? [];

  if (channel === "pinterest") {
    const pinTitle = (title ?? "").trim();
    const titleCharacters = [...pinTitle].length;
    const titleLength = lengthIssue(titleCharacters, spec.title!.max, "pin titles", "title");
    if (titleLength) issues.push(titleLength);
    const length = lengthIssue(characters, spec.max, "pin descriptions", "description");
    if (length) issues.push(length);
    issues.push(...textIssues(pinTitle, options.bannedPhrases, "title"), ...textIssues(text, options.bannedPhrases, "description"));
    for (const [field, value] of [["title", pinTitle], ["description", text]] as const) {
      for (const match of value.matchAll(URL_PATTERN)) issues.push({ check: "link", message: "Pins carry the link as their destination, not in the text.", quote: trimUrl(match[0]), field });
      if (/(^|\s)#[A-Za-z]/.test(value)) issues.push({ check: "hashtags", message: "Pins here use no hashtags.", field });
    }
    return { passed: issues.length === 0, issues, characters, titleCharacters };
  }

  const length = lengthIssue(characters, spec.max, `${spec.label}s`);
  if (length) issues.push(length);
  issues.push(...textIssues(text, options.bannedPhrases));

  if (channel === "gmb") {
    for (const url of urls) issues.push({ check: "link", message: "GBP posts carry the link on their button, not in the text.", quote: url });
    for (const phone of findPhoneNumbers(text)) issues.push({ check: "phone", message: "Google rejects posts with a phone number in the text. Leave contact details to the call button.", quote: phone });
    if (hashtags.length > 0) issues.push({ check: "hashtags", message: "GBP posts do not use hashtags." });
  } else {
    if (!urls.some((url) => sameUrl(url, options.postUrl))) issues.push({ check: "link", message: `The post's link (${options.postUrl}) is missing.` });
    for (const url of urls.filter((url) => !sameUrl(url, options.postUrl))) issues.push({ check: "link", message: "Links somewhere other than the post.", quote: url });
    if (channel === "facebook" && hashtags.length > 0) issues.push({ check: "hashtags", message: "Facebook posts here use no hashtags." });
    if (channel === "linkedin" && hashtags.length > MAX_HASHTAGS) issues.push({ check: "hashtags", message: `${hashtags.length} hashtags; use at most ${MAX_HASHTAGS}.` });
  }
  return { passed: issues.length === 0, issues, characters };
}
