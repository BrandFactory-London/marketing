import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runChecks } from "@/lib/checks";
import * as critic from "./critic";
import * as spec from "./spec";
import * as writer from "./writer";
import type { SpecForPrompt } from "./shared";

const confirmed: SpecForPrompt = {
  topic: "Wet room or shower tray: which suits your bathroom?",
  keyword: "wet room or shower tray",
  postType: "comparison",
  location: "Chigwell",
  angle: "Answer the question in the first paragraph.",
  outline: ["What each one is", "Book a free design consultation"],
  facts: ["Bathrooms take two to six weeks on site."],
  links: ["/renovation-services/bathroom", "/contact"],
  faq: true,
  lengthMin: 1800,
  lengthMax: 2500,
  cta: "Book a free design consultation",
  pillar: "Bathroom Renovation",
  notes: null,
};

describe("prompts", () => {
  it("each has a version recorded on its calls", () => {
    expect([spec.PROMPT_VERSION, writer.PROMPT_VERSION, critic.PROMPT_VERSION]).toEqual(["spec-1", "writer-2", "critic-3"]);
  });

  it("bake in decision 12's three fixes", () => {
    for (const text of [writer.INSTRUCTIONS, critic.INSTRUCTIONS]) {
      expect(text).toContain('"your X, your Y and your Z"');
      expect(text).toContain('"more X, more Y, more Z"');
      expect(text).toContain("Never describe a process, policy, habit or customer pattern");
    }
    expect(critic.INSTRUCTIONS).toContain("the opening the spec's angle asks for, the call to action under its own H2 heading, or the link to the call to action's page");
    expect(writer.INSTRUCTIONS).toContain("above all not in the call to action");
  });

  it("use no em or en dashes", () => {
    const dir = __dirname;
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it("put the FAQ choice and the existing pages in the spec request", () => {
    const message = spec.specUserMessage({
      topic: confirmed.topic,
      slotDate: "2026-11-03",
      lengthMin: 1800,
      lengthMax: 2500,
      cta: confirmed.cta,
      pillar: null,
      notes: null,
      faqMode: "never",
      pages: [{ path: "/our-projects", title: "Our projects" }],
    });
    expect(message).toContain("Never include one. Set faq to false.");
    expect(message).toContain("/our-projects (Our projects)");
    expect(message).not.toContain("another draft");
  });

  it("send a redraft's note and the spec Amir saw", () => {
    const previous = { keyword: "k", postType: "guide", location: null, angle: "a", outline: [], facts: [], links: [], faq: false };
    const message = spec.specUserMessage({
      topic: "t",
      slotDate: "2026-11-03",
      lengthMin: 700,
      lengthMax: 900,
      cta: "c",
      pillar: null,
      notes: null,
      faqMode: "useful",
      pages: [],
      redraft: { note: "Focus on Loughton.", previous },
    });
    expect(message).toContain("His note: Focus on Loughton.");
    expect(message).toContain('"keyword": "k"');
  });

  it("give the writer every issue and the previous draft on a fix round", () => {
    const first = writer.writerUserMessage(confirmed);
    expect(first).toContain("Primary keyword: wet room or shower tray");
    expect(first).toContain("- /contact");
    expect(first).toContain("Write the post.");

    const fix = writer.writerUserMessage(confirmed, {
      previousDraft: "# Old draft",
      checkIssues: [{ check: "em_dash", message: "Uses an em dash.", quote: "a dash" }],
      criticIssues: [{ quote: "your room, your plans and your budget", category: "rule of three", note: "Parallel triad.", severity: "blocking" }],
    });
    expect(fix).toContain('Uses an em dash. Quote: "a dash"');
    expect(fix).toContain('[rule of three] Parallel triad. Quote: "your room, your plans and your budget"');
    expect(fix).toContain("# Old draft");
  });

  it("derive the critic's verdict from its issues", () => {
    const reply = { summary: "s", placeholders: [], scores: { voice: 7, usefulness: 8, specificity: 7 } };
    expect(critic.verdictOf({ ...reply, issues: [] })).toBe("pass");
    expect(critic.verdictOf({ ...reply, issues: [{ quote: "q", category: "voice", note: "n", severity: "minor" }] })).toBe("pass");
    expect(critic.verdictOf({ ...reply, issues: [{ quote: "q", category: "facts", note: "n", severity: "blocking" }] })).toBe("fail");
  });

  it("show the critic the draft and the scripted results", () => {
    const draft = "# T\n\nExcerpt: e\n\nSee [us](/contact).";
    const checks = runChecks({ markdown: draft, lengthMin: 1, lengthMax: 100, faq: false, allowedLinks: ["/contact"], bannedPhrases: [] });
    const message = critic.criticUserMessage(confirmed, draft, checks);
    expect(message).toContain("links /contact");
    expect(message).toContain(draft);
  });

  it("carry γ5's smoke fixes: placeholders for Amir, Examples as voice only, the target length, title honesty", () => {
    expect(writer.INSTRUCTIONS).toContain("[CONFIRM: what is needed]");
    expect(critic.INSTRUCTIONS).not.toContain("placeholders in square brackets are correct, not an issue");
    expect(critic.INSTRUCTIONS).toContain('list every placeholder in "placeholders"');
    for (const text of [writer.INSTRUCTIONS, critic.INSTRUCTIONS]) {
      expect(text).toContain("Examples and Counter-examples show voice only");
    }
    expect(critic.INSTRUCTIONS).toContain("has a title that promises a structure or content the body does not deliver");
    expect(writer.writerUserMessage({ ...confirmed, lengthMin: 1200, lengthMax: 1600 })).toContain("Target length: about 1400 words.");
  });

  it("let a placeholder pass the critic but keep it listed for Amir", () => {
    const reply = critic.CriticReply.parse({
      summary: "s",
      issues: [],
      placeholders: [{ quote: "[CONFIRM]", ask: "How long the labour guarantee runs." }],
      scores: { voice: 8, usefulness: 8, specificity: 7 },
    });
    expect(critic.verdictOf(reply)).toBe("pass");
    expect(reply.placeholders).toHaveLength(1);
  });

  it("give the critic Amir's regenerate note as approved by him", () => {
    const draft = "# T\n\nExcerpt: e\n\nAsk us about payment options.";
    const checks = runChecks({ markdown: draft, lengthMin: 1, lengthMax: 100, faq: false, allowedLinks: [], bannedPhrases: [] });
    expect(critic.criticUserMessage(confirmed, draft, checks, "Tell readers to ask about payment options.")).toContain(
      "what the note asks for is approved by him: do not report it as an issue",
    );
    expect(critic.criticUserMessage(confirmed, draft, checks)).not.toContain("Amir's note");
  });

  it("tell the critic about a length inside the tolerance", () => {
    const words = Array.from({ length: 100 }, () => "word").join(" ");
    const draft = `# T\n\nExcerpt: e\n\n${words}`;
    const checks = runChecks({ markdown: draft, lengthMin: 50, lengthMax: 100, faq: false, allowedLinks: [], bannedPhrases: [] });
    expect(critic.criticUserMessage(confirmed, draft, checks)).toContain("over the range but within the tolerance");
  });

  it("parse the replies the API returns", () => {
    expect(
      spec.SpecReply.parse({ keyword: "k", postType: "guide", location: null, angle: "a", outline: ["h"], facts: [], links: ["/contact"], faq: true }),
    ).toMatchObject({ keyword: "k" });
    expect(() => critic.CriticReply.parse({ summary: "s", issues: [{ quote: "q", category: "other", note: "n", severity: "minor" }], scores: {} })).toThrow();
  });
});
