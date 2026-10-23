import type { BlockContent, DefinitionContent, Heading, List, ListItem, Nodes, PhrasingContent, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";

// Markdown to Wix rich content (Ricos), design decision 10 and γ6 orientation Q2. Only what the Migss renderer showed
// in the publish test is converted: headings, paragraphs, bold, italic, links, both list types and quotes. Anything
// else is refused before anything is sent, never silently dropped. Tables are parsed (GFM) only so they can be refused.

export type RicosDecoration =
  | { type: "BOLD"; fontWeightValue: 700 }
  | { type: "ITALIC"; italicData: true }
  | { type: "LINK"; linkData: { link: { url: string; target: "SELF" | "BLANK"; rel?: { noreferrer: true } } } };

export type RicosNode = {
  type: "PARAGRAPH" | "HEADING" | "TEXT" | "BULLETED_LIST" | "ORDERED_LIST" | "LIST_ITEM" | "BLOCKQUOTE";
  nodes: RicosNode[];
  textData?: { text: string; decorations: RicosDecoration[] };
  paragraphData?: { textStyle: { textAlignment: "AUTO" } };
  headingData?: { level: number; textStyle: { textAlignment: "AUTO" } };
  bulletedListData?: { indentation: number };
  orderedListData?: { indentation: number };
  blockquoteData?: { indentation: number };
};

export type RicosDocument = { nodes: RicosNode[] };

// Line is the line of the body (after the title and excerpt are taken off), counting from 1.
export type ConversionProblem = { line: number | null; message: string };

export type ConversionResult = { ok: true; document: RicosDocument } | { ok: false; problems: ConversionProblem[] };

export const HEADING_LEVELS = [2, 3, 4] as const;

// A single blog post may be at most 400KB (the Wix Blog docs).
export const MAX_DOCUMENT_BYTES = 400_000;

const SUPPORTED = "The Migss blog can show headings, paragraphs, lists, quotes, bold, italic and links.";

// What each refused node is called in the message Amir sees.
const REFUSED: Partial<Record<Nodes["type"], string>> = {
  table: "a table",
  image: "an image",
  imageReference: "an image",
  html: "raw HTML",
  code: "a code block",
  inlineCode: "inline code",
  thematicBreak: "a horizontal rule",
  break: "a hard line break",
  definition: "a link definition",
  linkReference: "a reference-style link",
  footnoteDefinition: "a footnote",
  footnoteReference: "a footnote",
  delete: "struck-through text",
  yaml: "front matter",
};

const PARAGRAPH_DATA = { textStyle: { textAlignment: "AUTO" as const } };

type Context = { siteUrl: string; problems: ConversionProblem[] };

function lineOf(node: Nodes): number | null {
  return node.position?.start.line ?? null;
}

function refuse(context: Context, node: Nodes, what: string, advice = "Reopen for editing and rewrite it as text or a list.") {
  context.problems.push({ line: lineOf(node), message: `${what[0].toUpperCase()}${what.slice(1)}. ${SUPPORTED} ${advice}` });
}

function linkDecoration(context: Context, node: Nodes, href: string): RicosDecoration | null {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return { type: "LINK", linkData: { link: { url: new URL(href, context.siteUrl).toString(), target: "SELF" } } };
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    refuse(context, node, `a link to "${href}", which is not a web address`, "Reopen for editing and link to a page on the site.");
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    refuse(context, node, `a ${url.protocol.replace(":", "")} link`, "Reopen for editing and link to a page on the site.");
    return null;
  }
  const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");
  if (bare(url.host) === bare(new URL(context.siteUrl).host)) return { type: "LINK", linkData: { link: { url: url.toString(), target: "SELF" } } };
  return { type: "LINK", linkData: { link: { url: url.toString(), target: "BLANK", rel: { noreferrer: true } } } };
}

function text(value: string, decorations: RicosDecoration[]): RicosNode {
  return { type: "TEXT", nodes: [], textData: { text: value, decorations: [...decorations] } };
}

function inline(context: Context, nodes: PhrasingContent[], decorations: RicosDecoration[] = []): RicosNode[] {
  const out: RicosNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        // A soft line break inside a paragraph is only a wrapped line in Markdown: it reads as a space.
        const value = node.value.replace(/\s*\n\s*/g, " ");
        if (value) out.push(text(value, decorations));
        break;
      }
      case "strong":
        out.push(...inline(context, node.children, [...decorations, { type: "BOLD", fontWeightValue: 700 }]));
        break;
      case "emphasis":
        out.push(...inline(context, node.children, [...decorations, { type: "ITALIC", italicData: true }]));
        break;
      case "link": {
        const decoration = linkDecoration(context, node, node.url);
        if (decoration) out.push(...inline(context, node.children, [...decorations, decoration]));
        break;
      }
      default:
        refuse(context, node, REFUSED[node.type] ?? `unsupported content (${node.type})`);
    }
  }
  return out;
}

function paragraph(context: Context, children: PhrasingContent[]): RicosNode {
  return { type: "PARAGRAPH", nodes: inline(context, children), paragraphData: PARAGRAPH_DATA };
}

function heading(context: Context, node: Heading): RicosNode | null {
  if (!(HEADING_LEVELS as readonly number[]).includes(node.depth)) {
    refuse(
      context,
      node,
      node.depth === 1 ? "a second H1 heading (#) in the body" : `a level ${node.depth} heading`,
      node.depth === 1 ? "The title is the only H1. Reopen for editing and make it ## or ###." : "Reopen for editing and use ##, ### or #### instead.",
    );
    return null;
  }
  return { type: "HEADING", nodes: inline(context, node.children), headingData: { level: node.depth, textStyle: { textAlignment: "AUTO" } } };
}

function list(context: Context, node: List, indentation: number): RicosNode {
  const items = node.children.map((item) => listItem(context, item, indentation));
  return node.ordered
    ? { type: "ORDERED_LIST", nodes: items, orderedListData: { indentation } }
    : { type: "BULLETED_LIST", nodes: items, bulletedListData: { indentation } };
}

// The docs: a list item holds a paragraph, never text directly. A nested list follows its item's paragraph.
function listItem(context: Context, node: ListItem, indentation: number): RicosNode {
  const nodes: RicosNode[] = [];
  for (const child of node.children) {
    if (child.type === "paragraph") nodes.push(paragraph(context, child.children));
    else if (child.type === "list") nodes.push(list(context, child, indentation + 1));
    else refuse(context, child, REFUSED[child.type] ?? `${child.type} inside a list`);
  }
  return { type: "LIST_ITEM", nodes };
}

function block(context: Context, node: RootContent | BlockContent | DefinitionContent): RicosNode | null {
  switch (node.type) {
    case "heading":
      return heading(context, node);
    case "paragraph":
      return paragraph(context, node.children);
    case "list":
      return list(context, node, 0);
    case "blockquote": {
      // The docs: a quote holds a paragraph. Lists or headings inside a quote were not in the publish test.
      const nodes: RicosNode[] = [];
      for (const child of node.children) {
        if (child.type === "paragraph") nodes.push(paragraph(context, child.children));
        else refuse(context, child, REFUSED[child.type] ?? `a ${child.type} inside a quote`, "Reopen for editing and keep quotes to plain paragraphs.");
      }
      return { type: "BLOCKQUOTE", nodes, blockquoteData: { indentation: 1 } };
    }
    default:
      refuse(context, node, REFUSED[node.type] ?? `unsupported content (${node.type})`);
      return null;
  }
}

// Converts a post body (no H1 title and no Excerpt line; see splitDraft) to a Ricos document. Internal paths become
// absolute links on the project's site.
export function markdownToRicos(body: string, options: { siteUrl: string }): ConversionResult {
  const context: Context = { siteUrl: options.siteUrl, problems: [] };
  const tree = fromMarkdown(body, { extensions: [gfmTable()], mdastExtensions: [gfmTableFromMarkdown()] });
  const nodes = tree.children.map((node) => block(context, node)).filter((node): node is RicosNode => node !== null);
  if (context.problems.length > 0) return { ok: false, problems: context.problems };
  if (nodes.length === 0) return { ok: false, problems: [{ line: null, message: "The body is empty." }] };
  const document = { nodes };
  const bytes = Buffer.byteLength(JSON.stringify(document));
  if (bytes > MAX_DOCUMENT_BYTES) return { ok: false, problems: [{ line: null, message: `The post is ${Math.round(bytes / 1000)}KB as Wix rich content; Wix takes up to 400KB.` }] };
  return { ok: true, document };
}

export function describeProblem(problem: ConversionProblem): string {
  return problem.line ? `Body line ${problem.line}: ${problem.message}` : problem.message;
}
