// The scripted checks every draft goes through before the critic (design decision 11). A TypeScript port of
// docs/model-test/check.py, which counts words the same way, plus decision 12's patterns by name. They cost
// nothing, so a draft that fails one goes back to the writer without paying for the critic (γ4 orientation Q6).

export type CheckName = "title" | "length" | "em_dash" | "en_dash" | "banned" | "links" | "excerpt" | "faq" | "examples";

// Checks that block Approve even on Amir's own edits (γ5 orientation approval): dashes and banned phrases. Every
// other failed check is a warning once a draft reaches Review. Placeholders block too; they are not a check.
export const APPROVAL_BLOCKING_CHECKS: readonly CheckName[] = ["em_dash", "en_dash", "banned"];

export type CheckIssue = { check: CheckName; message: string; quote?: string };

export type CheckInput = {
  markdown: string;
  lengthMin: number;
  lengthMax: number;
  // true: the post must have an FAQ section; false: it must not.
  faq: boolean;
  allowedLinks: readonly string[];
  // Phrases from the BrandFactory rules' "Banned phrases" section (see parseBannedPhrases).
  bannedPhrases: readonly string[];
  // The project's site host, so absolute links to the site itself are judged by their path.
  siteHost?: string;
  // The client's Examples and Counter-examples sections, as Markdown. Their sentences guide voice only and
  // must not reappear in a draft (γ5 orientation Q3).
  examples?: readonly string[];
};

export type CheckResult = {
  passed: boolean;
  issues: CheckIssue[];
  title: string | null;
  excerpt: string | null;
  wordCount: number;
  // Reported for the critic and for Amir; none of these fail a draft.
  info: {
    links: string[];
    placeholders: string[];
    moneyFigures: string[];
    yearsClaims: string[];
    percentages: string[];
    h2: number;
    // Set when the word count is outside the spec's range but inside the tolerance.
    lengthNote?: string | null;
  };
};

export const EXCERPT_MAX = 160;

// A draft may run this far outside the spec's range without going back to the writer (γ5 orientation, fix 3).
export const LENGTH_TOLERANCE = 0.05;

export function lengthBounds(min: number, max: number): { min: number; max: number } {
  return { min: Math.round(min * (1 - LENGTH_TOLERANCE)), max: Math.round(max * (1 + LENGTH_TOLERANCE)) };
}

// The writer aims for the middle of the range, rounded to the nearest 50 words.
export function targetLength(min: number, max: number): number {
  return Math.round((min + max) / 2 / 50) * 50;
}

// Square-bracketed text that is not a Markdown link: a fact the writer could not give (γ5 orientation Q2).
const PLACEHOLDER = /\[[^\]\n]+\](?!\()/g;

export type Placeholder = { text: string; index: number };

export function findPlaceholders(text: string): Placeholder[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => ({ text: match[0], index: match.index ?? 0 }));
}

// ---- Examples copied into a draft (γ5 orientation Q3) ----

// A sentence of this many words or more that matches an Examples sentence fails, and so does any run of
// RUN_WORDS consecutive words shared with one. Common phrases are shorter than both.
export const EXAMPLE_SENTENCE_WORDS = 6;
export const EXAMPLE_RUN_WORDS = 8;

function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}(?:#+|[-*+]|\d+[.)]|>)\s+/gm, "")
    .replace(/[*_`]+/g, "");
}

// Sentences of a Markdown text: split at full stops, question and exclamation marks, and line breaks.
export function sentencesOf(markdown: string): string[] {
  return plainText(markdown)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function normalisedWords(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9£'\s]+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

export type ExampleCopy = { quote: string; example: string };

export function findExampleCopies(markdown: string, examples: readonly string[]): ExampleCopy[] {
  const sentences = new Map<string, string>();
  const runs = new Map<string, string>();
  for (const sentence of examples.flatMap(sentencesOf)) {
    const words = normalisedWords(sentence);
    if (words.length >= EXAMPLE_SENTENCE_WORDS) sentences.set(words.join(" "), sentence);
    for (let start = 0; start + EXAMPLE_RUN_WORDS <= words.length; start++) {
      runs.set(words.slice(start, start + EXAMPLE_RUN_WORDS).join(" "), sentence);
    }
  }
  const copies: ExampleCopy[] = [];
  for (const sentence of sentencesOf(markdown)) {
    const words = normalisedWords(sentence);
    let example = words.length >= EXAMPLE_SENTENCE_WORDS ? sentences.get(words.join(" ")) : undefined;
    for (let start = 0; !example && start + EXAMPLE_RUN_WORDS <= words.length; start++) {
      example = runs.get(words.slice(start, start + EXAMPLE_RUN_WORDS).join(" "));
    }
    if (example) copies.push({ quote: sentence, example });
  }
  return copies;
}

// check.py's word count: link text only, heading markers removed, words of letters, digits, £, apostrophes and hyphens.
export function countWords(markdown: string): number {
  const body = markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^#+ /gm, "");
  return body.match(/[A-Za-z0-9£'’-]+/g)?.length ?? 0;
}

const WORD = "[\\w’'-]+";

// Banned for every client (check.py's list, decision 12's two patterns, and the knowledge pack's rule 5).
export const BUILT_IN_BANNED: readonly { label: string; pattern: RegExp }[] = [
  { label: '"not just X, but Y"', pattern: /\bnot just\b/gi },
  { label: `"it's not X, it's Y"`, pattern: /\bit['’]?s not\b[^.]{0,40}\bit['’]?s\b/gi },
  { label: '"elevate"', pattern: /\belevat/gi },
  { label: '"look no further"', pattern: /look no further/gi },
  { label: '"in today\'s fast-paced world"', pattern: /fast-paced world/gi },
  { label: '"seamless"', pattern: /\bseamless/gi },
  { label: '"transform your space"', pattern: /transform your (?:space|bathroom|home|kitchen)/gi },
  { label: '"dream bathroom"', pattern: /dream bathroom/gi },
  { label: '"game-changer"', pattern: /game-?changer/gi },
  {
    label: '"your X, your Y and your Z"',
    pattern: new RegExp(`\\byour\\s+${WORD}(?:\\s+${WORD})?,\\s+your\\s+${WORD}(?:\\s+${WORD})?,?\\s+(?:and|or)\\s+your\\s+${WORD}`, "gi"),
  },
  {
    label: '"more X, more Y, more Z"',
    pattern: new RegExp(
      `\\bmore\\s+${WORD}(?:\\s+${WORD})?,\\s+more\\s+${WORD}(?:\\s+${WORD}){0,2},?\\s+(?:and|or)\\s+(?:${WORD}\\s+)?more\\s+${WORD}`,
      "gi",
    ),
  },
];

const QUOTES = /^["“”'‘’]+|["“”'‘’]+$/g;

// Reads the "Banned phrases" section: one Markdown list item per phrase, quotes removed. A lone capital X, Y or
// Z stands for any few words, so "not just X, but Y" matches "not just tiling, but plumbing".
export function parseBannedPhrases(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item))
    .map((item) => item.replace(QUOTES, "").trim())
    .filter(Boolean);
}

export function phrasePattern(phrase: string): RegExp {
  const parts = phrase.split(/\b([XYZ])\b/);
  const source = parts
    .map((part, index) => (index % 2 === 1 ? "[^.,;:!?\\n]{1,40}?" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")))
    .join("");
  const start = /^\w/.test(phrase) ? "\\b" : "";
  return new RegExp(`${start}${source}`, "gi");
}

// Paths only: "/renovation-services/bathroom", one or more per line, in any list style.
export function parseAllowedLinks(section: string): string[] {
  const paths = [...section.matchAll(/(?:^|[\s,(])(\/[A-Za-z0-9\-/_.]*)/g)].map((match) => normalisePath(match[1]));
  return [...new Set(paths)];
}

function normalisePath(path: string): string {
  const withoutFragment = path.split("#")[0].split("?")[0];
  return withoutFragment.length > 1 ? withoutFragment.replace(/\/+$/, "") : "/";
}

function linkPath(href: string, siteHost?: string): string | null {
  if (href.startsWith("/")) return normalisePath(href);
  try {
    const url = new URL(href);
    const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");
    if (siteHost && bare(url.host) === bare(siteHost)) return normalisePath(url.pathname);
  } catch {
    // Not a URL at all.
  }
  return null;
}

function around(text: string, index: number, length: number): string {
  return text
    .slice(Math.max(0, index - 40), index + length + 40)
    .replace(/\s+/g, " ")
    .trim();
}

// Dashes and banned phrases (decision 12): the checks every text gets, posts and derivatives alike (γ6 Q6).
export function styleIssues(text: string, bannedPhrases: readonly string[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  for (const [check, dash, name] of [
    ["em_dash", "\u2014", "em dash"],
    ["en_dash", "\u2013", "en dash"],
  ] as const) {
    let index = text.indexOf(dash);
    while (index !== -1) {
      issues.push({ check, message: `Uses an ${name}.`, quote: around(text, index, 1) });
      index = text.indexOf(dash, index + 1);
    }
  }

  const banned = [
    ...BUILT_IN_BANNED,
    ...bannedPhrases.map((phrase) => ({ label: `"${phrase}"`, pattern: phrasePattern(phrase) })),
  ];
  const seen = new Set<string>();
  for (const { label, pattern } of banned) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const key = `${match.index}:${match[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ check: "banned", message: `Banned phrase ${label}.`, quote: around(text, match.index ?? 0, match[0].length) });
    }
  }

  return issues;
}

export function runChecks(input: CheckInput): CheckResult {
  const text = input.markdown;
  const issues: CheckIssue[] = [];

  const titles = [...text.matchAll(/^# (.+)$/gm)].map((match) => match[1].trim());
  if (titles.length === 0) issues.push({ check: "title", message: "The draft has no H1 title." });
  if (titles.length > 1) issues.push({ check: "title", message: `The draft has ${titles.length} H1 titles; it needs exactly one.` });

  const wordCount = countWords(text);
  const bounds = lengthBounds(input.lengthMin, input.lengthMax);
  let lengthNote: string | null = null;
  if (wordCount < bounds.min || wordCount > bounds.max) {
    issues.push({ check: "length", message: `${wordCount} words, outside the spec's ${input.lengthMin} to ${input.lengthMax}.` });
  } else if (wordCount > input.lengthMax) {
    lengthNote = `${wordCount} words, ${wordCount - input.lengthMax} over the range but within the tolerance.`;
  } else if (wordCount < input.lengthMin) {
    lengthNote = `${wordCount} words, ${input.lengthMin - wordCount} under the range but within the tolerance.`;
  }

  issues.push(...styleIssues(text, input.bannedPhrases));

  const links = [...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
  const allowed = new Set(input.allowedLinks.map(normalisePath));
  for (const href of links) {
    const path = linkPath(href, input.siteHost);
    if (path === null || !allowed.has(path)) {
      issues.push({ check: "links", message: `Links to ${href}, which is not on the allowed list.`, quote: href });
    }
  }

  const excerptMatch = /^Excerpt:\s*(.*)$/m.exec(text);
  const excerpt = excerptMatch ? excerptMatch[1].trim() : null;
  if (!excerpt) issues.push({ check: "excerpt", message: 'The draft has no "Excerpt:" line.' });
  else if (excerpt.length > EXCERPT_MAX) {
    issues.push({ check: "excerpt", message: `The excerpt is ${excerpt.length} characters; the limit is ${EXCERPT_MAX}.`, quote: excerpt });
  }

  for (const copy of findExampleCopies(text, input.examples ?? [])) {
    issues.push({
      check: "examples",
      message: `Reuses the client's example "${copy.example.replace(/[.!?]+$/, "")}". Examples guide voice only; write a new sentence.`,
      quote: copy.quote,
    });
  }

  const hasFaq = /^##\s+Frequently asked questions/im.test(text);
  if (input.faq && !hasFaq) issues.push({ check: "faq", message: 'The spec asks for an FAQ, but there is no "## Frequently asked questions" section.' });
  if (!input.faq && hasFaq) issues.push({ check: "faq", message: "The spec says no FAQ, but the draft has one." });

  return {
    passed: issues.length === 0,
    issues,
    title: titles[0] ?? null,
    excerpt,
    wordCount,
    info: {
      links,
      placeholders: findPlaceholders(text).map((placeholder) => placeholder.text),
      moneyFigures: [...text.matchAll(/£\s?\d[\d,.]*(?:k|\s?000)?/g)].map((match) => match[0]),
      yearsClaims: [...text.matchAll(/\b(?:over|more than)\s+\d+\s+years\b/gi)].map((match) => match[0]),
      percentages: [...text.matchAll(/\b\d+(?:\.\d+)?%/g)].map((match) => match[0]),
      h2: (text.match(/^## /gm) ?? []).length,
      lengthNote,
    },
  };
}
