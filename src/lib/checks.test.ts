import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countWords, parseAllowedLinks, parseBannedPhrases, phrasePattern, runChecks } from "./checks";

const drafts = path.join(process.cwd(), "docs/model-test/drafts");
const read = (name: string) => readFileSync(path.join(drafts, name), "utf8");

// The model test's own settings (docs/model-test/check.py).
const ALLOWED = ["/renovation-services/bathroom", "/renovation-services/kitchen", "/our-projects", "/resources/bathroom", "/locations/chigwell", "/locations/loughton", "/locations/ilford", "/contact"];
const SPEC = { A: { lengthMin: 1800, lengthMax: 2500, faq: true }, B: { lengthMin: 700, lengthMax: 900, faq: false } } as const;

const check = (name: string) =>
  runChecks({ markdown: read(name), ...SPEC[name[0] as "A" | "B"], allowedLinks: ALLOWED, bannedPhrases: [] });

describe("the port reproduces check.py on the six model-test drafts", () => {
  // check.py's output in this repo on 21 Oct 2026: words, excerpt characters.
  const expected: Record<string, [number, number]> = {
    "A-haiku.md": [1869, 134],
    "A-opus.md": [2465, 134],
    "A-sonnet.md": [2418, 115],
    "B-haiku.md": [778, 139],
    "B-opus.md": [873, 141],
    "B-sonnet.md": [845, 140],
  };
  for (const [name, [words, excerptChars]] of Object.entries(expected)) {
    it(`${name}: ${words} words, excerpt ${excerptChars} characters, no dash, link, length, excerpt or FAQ issue`, () => {
      const result = check(name);
      expect(result.wordCount).toBe(words);
      expect(result.excerpt?.length).toBe(excerptChars);
      expect(result.issues.filter((issue) => issue.check !== "banned")).toEqual([]);
      expect(result.title).toBeTruthy();
    });
  }
});

describe("decision 12's patterns catch what the critic caught", () => {
  const banned = (name: string) => check(name).issues.filter((issue) => issue.check === "banned").map((issue) => issue.message);

  it("flags the CTA triplets the Opus critic quoted, and check.py's 'not just'", () => {
    expect(banned("B-sonnet.md")).toEqual(['Banned phrase "your X, your Y and your Z".', 'Banned phrase "more X, more Y, more Z".']);
    expect(banned("A-opus.md")).toEqual(['Banned phrase "your X, your Y and your Z".']);
    expect(banned("A-sonnet.md")).toEqual(['Banned phrase "your X, your Y and your Z".']);
    expect(banned("B-opus.md")).toEqual(['Banned phrase "more X, more Y, more Z".']);
    expect(banned("A-haiku.md")).toEqual(['Banned phrase "not just X, but Y".']);
    expect(banned("B-haiku.md")).toEqual([]);
  });

  it("quotes the offending words", () => {
    const issue = check("B-opus.md").issues.find((item) => item.check === "banned")!;
    expect(issue.quote).toContain("more tiles, more labour hours and often more pipework");
  });
});

describe("individual checks", () => {
  const base = {
    lengthMin: 5,
    lengthMax: 60,
    faq: false,
    allowedLinks: ["/contact", "/renovation-services/bathroom"],
    bannedPhrases: [],
    siteHost: "www.migssinteriors.com",
  };
  const doc = (body: string) => `# A title\n\nExcerpt: A short excerpt.\n\n${body}`;

  it("passes a clean draft", () => {
    expect(runChecks({ ...base, markdown: doc("Some plain words in a sentence. [Book a visit](/contact).") }).passed).toBe(true);
  });

  it("finds em and en dashes, each with its place", () => {
    const result = runChecks({ ...base, markdown: doc("One \u2014 two \u2013 three \u2014 four.") });
    expect(result.issues.map((issue) => issue.check)).toEqual(["em_dash", "em_dash", "en_dash"]);
  });

  it("judges links by path, allowing the site's own absolute URLs", () => {
    const result = runChecks({
      ...base,
      markdown: doc("[a](/contact/) [b](https://migssinteriors.com/renovation-services/bathroom#top) [c](/blog/x) [d](https://example.com/contact)"),
    });
    expect(result.issues.filter((issue) => issue.check === "links").map((issue) => issue.quote)).toEqual(["/blog/x", "https://example.com/contact"]);
  });

  it("requires one H1 and an excerpt within 160 characters", () => {
    expect(runChecks({ ...base, markdown: "Excerpt: x\n\nNo title here at all today." }).issues.map((i) => i.check)).toContain("title");
    const long = runChecks({ ...base, markdown: `# T\n\nExcerpt: ${"a".repeat(161)}\n\nSome words here to count.` });
    expect(long.issues.map((i) => i.message)).toContain("The excerpt is 161 characters; the limit is 160.");
    expect(runChecks({ ...base, markdown: "# T\n\nSome words here to count now." }).issues.map((i) => i.check)).toContain("excerpt");
  });

  it("applies the FAQ rule both ways and the length range", () => {
    const withFaq = doc("Words words words.\n\n## Frequently asked questions\n\nQ and A.");
    expect(runChecks({ ...base, markdown: withFaq }).issues.map((i) => i.check)).toEqual(["faq"]);
    expect(runChecks({ ...base, faq: true, markdown: withFaq }).passed).toBe(true);
    expect(runChecks({ ...base, lengthMax: 6, markdown: doc("Too many words for this tiny range.") }).issues.map((i) => i.check)).toEqual(["length"]);
  });

  it("counts words like check.py: link text only, no heading markers", () => {
    expect(countWords("## Two words\n\n[Book now](/contact) £5,000 it's well-made")).toBe(8);
    // "£5,000" splits on the comma into two words, as it does in check.py.
  });
});

describe("rules from the BrandFactory knowledge", () => {
  it("reads banned phrases from any Markdown list, without quotes", () => {
    expect(parseBannedPhrases('- "elevate"\n* “look no further”\n1. not just X, but Y\nSome prose line\n- ')).toEqual([
      "elevate",
      "look no further",
      "not just X, but Y",
    ]);
  });

  it("turns X and Y into a few words, and matches whole phrases case-insensitively", () => {
    expect(phrasePattern("not just X, but Y").test("It is Not just tiling, but plumbing.")).toBe(true);
    expect(phrasePattern("elevate").test("Elevate your home")).toBe(true);
    expect(phrasePattern("cost (approx.)").test("the cost (approx.) is")).toBe(true);
  });

  it("applies the rules' phrases on top of the built-in list", () => {
    const result = runChecks({
      markdown: "# T\n\nExcerpt: e\n\nA bespoke journey awaits you here.",
      lengthMin: 1,
      lengthMax: 100,
      faq: false,
      allowedLinks: [],
      bannedPhrases: ["bespoke journey"],
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ check: "banned", message: 'Banned phrase "bespoke journey".' });
    expect(result.issues[0].quote).toContain("bespoke journey");
  });

  it("reads allowed links from the project's section in any shape", () => {
    expect(parseAllowedLinks("- /renovation-services/bathroom\n/locations/chigwell, /contact/\nSee (/our-projects) too")).toEqual([
      "/renovation-services/bathroom",
      "/locations/chigwell",
      "/contact",
      "/our-projects",
    ]);
  });
});
