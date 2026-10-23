import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeProblem, markdownToRicos, type RicosDocument, type RicosNode } from "./ricos";
import { splitDraft } from "./review-rules";

const SITE = "https://www.migssinteriors.com";

function convert(body: string): RicosDocument {
  const result = markdownToRicos(body, { siteUrl: SITE });
  if (!result.ok) throw new Error(result.problems.map(describeProblem).join("\n"));
  return result.document;
}

function problems(body: string): string[] {
  const result = markdownToRicos(body, { siteUrl: SITE });
  return result.ok ? [] : result.problems.map(describeProblem);
}

const PARA = { textStyle: { textAlignment: "AUTO" } };
const t = (text: string, decorations: unknown[] = []) => ({ type: "TEXT", nodes: [], textData: { text, decorations } });
const BOLD = { type: "BOLD", fontWeightValue: 700 };
const ITALIC = { type: "ITALIC", italicData: true };

describe("Markdown to Ricos: each node type (γ6 orientation Q2)", () => {
  it("paragraph", () => {
    expect(convert("A plain paragraph.")).toEqual({ nodes: [{ type: "PARAGRAPH", nodes: [t("A plain paragraph.")], paragraphData: PARA }] });
  });

  it("joins a wrapped line inside a paragraph with a space", () => {
    expect(convert("First line\nsecond line.").nodes[0].nodes).toEqual([t("First line second line.")]);
  });

  it("headings at levels 2, 3 and 4", () => {
    const doc = convert("## Two\n\n### Three\n\n#### Four");
    expect(doc.nodes.map((node) => [node.type, node.headingData?.level, node.nodes[0].textData?.text])).toEqual([
      ["HEADING", 2, "Two"],
      ["HEADING", 3, "Three"],
      ["HEADING", 4, "Four"],
    ]);
  });

  it("bold", () => {
    expect(convert("Some **firm** words.").nodes[0].nodes).toEqual([t("Some "), t("firm", [BOLD]), t(" words.")]);
  });

  it("italic, with either marker", () => {
    expect(convert("An *aside* and _another_.").nodes[0].nodes).toEqual([t("An "), t("aside", [ITALIC]), t(" and "), t("another", [ITALIC]), t(".")]);
  });

  it("bold and italic together carry both decorations", () => {
    expect(convert("***Both*** here.").nodes[0].nodes[0]).toEqual(t("Both", [ITALIC, BOLD]));
  });

  it("an internal link becomes an absolute link on the site, opening in the same tab", () => {
    expect(convert("Read our [bathroom guide](/renovation-services/bathroom).").nodes[0].nodes).toEqual([
      t("Read our "),
      t("bathroom guide", [{ type: "LINK", linkData: { link: { url: `${SITE}/renovation-services/bathroom`, target: "SELF" } } }]),
      t("."),
    ]);
  });

  it("a full link to the site itself also opens in the same tab", () => {
    const [node] = convert("[Contact](https://migssinteriors.com/contact)").nodes[0].nodes;
    expect(node.textData?.decorations).toEqual([{ type: "LINK", linkData: { link: { url: "https://migssinteriors.com/contact", target: "SELF" } } }]);
  });

  it("an external link opens in a new tab with noreferrer", () => {
    const [node] = convert("[Building regulations](https://www.gov.uk/building-regulations-approval)").nodes[0].nodes;
    expect(node.textData?.decorations).toEqual([
      { type: "LINK", linkData: { link: { url: "https://www.gov.uk/building-regulations-approval", target: "BLANK", rel: { noreferrer: true } } } },
    ]);
  });

  it("bold text inside a link keeps both", () => {
    const [node] = convert("[**Book a visit**](/contact)").nodes[0].nodes;
    expect(node.textData?.decorations.map((decoration) => decoration.type)).toEqual(["LINK", "BOLD"]);
  });

  it("a bulleted list holds list items that each hold a paragraph", () => {
    expect(convert("- Tanking\n- Drainage")).toEqual({
      nodes: [
        {
          type: "BULLETED_LIST",
          bulletedListData: { indentation: 0 },
          nodes: [
            { type: "LIST_ITEM", nodes: [{ type: "PARAGRAPH", nodes: [t("Tanking")], paragraphData: PARA }] },
            { type: "LIST_ITEM", nodes: [{ type: "PARAGRAPH", nodes: [t("Drainage")], paragraphData: PARA }] },
          ],
        },
      ],
    });
  });

  it("a numbered list", () => {
    const [list] = convert("1. Survey\n2. Design\n3. Build").nodes;
    expect(list.type).toBe("ORDERED_LIST");
    expect(list.orderedListData).toEqual({ indentation: 0 });
    expect(list.nodes.map((item) => item.nodes[0].nodes[0].textData?.text)).toEqual(["Survey", "Design", "Build"]);
  });

  it("a nested list follows its item's paragraph, one level further in", () => {
    const [list] = convert("- Week one\n  1. Strip out\n  2. First fix\n- Week two").nodes;
    const first = list.nodes[0];
    expect(first.nodes.map((node) => node.type)).toEqual(["PARAGRAPH", "ORDERED_LIST"]);
    expect(first.nodes[1].orderedListData).toEqual({ indentation: 1 });
    expect(first.nodes[1].nodes).toHaveLength(2);
  });

  it("a quote holds a paragraph", () => {
    expect(convert("> Plan the drain before the tiles.")).toEqual({
      nodes: [{ type: "BLOCKQUOTE", blockquoteData: { indentation: 1 }, nodes: [{ type: "PARAGRAPH", nodes: [t("Plan the drain before the tiles.")], paragraphData: PARA }] }],
    });
  });

  it("never puts text straight inside a list item or a quote", () => {
    const walk = (nodes: RicosNode[], parent: string | null): void => {
      for (const node of nodes) {
        if (node.type === "TEXT") expect(["PARAGRAPH", "HEADING"]).toContain(parent);
        walk(node.nodes, node.type);
      }
    };
    walk(convert("- **One** item\n\n> A *quote*\n\n1. [Link](/contact)").nodes, null);
  });
});

describe("Markdown to Ricos: refusals", () => {
  it("refuses a table, naming its line, instead of sending a paragraph of pipes", () => {
    expect(problems("Intro.\n\n| Size | Price |\n| --- | --- |\n| Small | £8k |")).toEqual([
      "Body line 3: A table. The Migss blog can show headings, paragraphs, lists, quotes, bold, italic and links. Reopen for editing and rewrite it as text or a list.",
    ]);
  });

  it.each([
    ["an image", "![A wet room](https://example.com/a.jpg)"],
    ["raw HTML", "<div>Hello</div>"],
    ["a code block", "```\ncode\n```"],
    ["inline code", "Use `grout` here."],
    ["a horizontal rule", "One.\n\n---\n\nTwo."],
    ["a hard line break", "Line one  \nline two."],
    ["a reference-style link", "See [the guide][g].\n\n[g]: /guide"],
  ])("refuses %s", (what, body) => {
    const found = problems(body);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((message) => message.toLowerCase().includes(what.toLowerCase()))).toBe(true);
  });

  it("refuses a second H1 and headings below level 4", () => {
    expect(problems("# Another title")[0]).toContain("A second H1 heading (#) in the body");
    expect(problems("##### Deep")[0]).toContain("A level 5 heading");
  });

  it("refuses links that are not web addresses", () => {
    expect(problems("[Call us](tel:01234567890)")[0]).toContain("A tel link");
    expect(problems("[Email](mailto:info@example.com)")[0]).toContain("A mailto link");
  });

  it("refuses an empty body", () => {
    expect(problems("")).toEqual(["The body is empty."]);
  });

  it("lists every problem, not just the first", () => {
    expect(problems("Use `x`.\n\n![a](b.jpg)\n\n---")).toHaveLength(3);
  });
});

describe("Markdown to Ricos: real drafts", () => {
  it("converts every model-test draft whole, with headings, lists and links and nothing refused", () => {
    const dir = "docs/model-test/drafts";
    const files = readdirSync(dir).filter((name) => name.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const { body } = splitDraft(readFileSync(`${dir}/${name}`, "utf8"));
      const result = markdownToRicos(body, { siteUrl: SITE });
      expect(result.ok ? [] : result.problems.map(describeProblem), name).toEqual([]);
      if (result.ok) {
        const types = new Set<string>();
        const walk = (nodes: RicosNode[]) => nodes.forEach((node) => (types.add(node.type), walk(node.nodes)));
        walk(result.document.nodes);
        expect([...types], name).toEqual(expect.arrayContaining(["HEADING", "PARAGRAPH", "TEXT"]));
      }
    }
  });
});
