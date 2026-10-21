import ReactMarkdown from "react-markdown";

// The writer's Markdown, read only. Raw HTML is never rendered (react-markdown ignores it without a raw
// plugin). The title and the Excerpt line are shown separately, so they are taken off the body here.
export function draftBodyMarkdown(markdown: string): string {
  return markdown
    .replace(/^# .+$/m, "")
    .replace(/^Excerpt:.*$/m, "")
    .trim();
}

type TextNode = { type: "text"; value: string };
type Parent = { type: string; children?: Node[]; data?: Record<string, unknown> };
type Node = TextNode | Parent;

const PLACEHOLDER = /\[[^\]\n]+\]/g;

// Wraps square-bracketed placeholders in <mark> so Review shows what Amir still has to fill in (γ5 Q2).
// Links are already link nodes by the time this runs, so only plain text is split.
function remarkPlaceholders() {
  const visit = (node: Node) => {
    if (!("children" in node) || !node.children) return;
    node.children = node.children.flatMap((child): Node[] => {
      if (child.type !== "text") {
        visit(child);
        return [child];
      }
      const value = (child as TextNode).value;
      const parts: Node[] = [];
      let last = 0;
      for (const match of value.matchAll(PLACEHOLDER)) {
        const index = match.index ?? 0;
        if (index > last) parts.push({ type: "text", value: value.slice(last, index) });
        parts.push({ type: "emphasis", data: { hName: "mark", hProperties: { className: "app-placeholder" } }, children: [{ type: "text", value: match[0] }] });
        last = index + match[0].length;
      }
      if (parts.length === 0) return [child];
      if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
      return parts;
    });
  };
  return (tree: Node) => visit(tree);
}

export function DraftBody({ markdown, siteUrl }: { markdown: string; siteUrl: string }) {
  const base = siteUrl.replace(/\/+$/, "");
  return (
    <div className="app-draft-body body">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkPlaceholders]}
        components={{
          // Internal links point at the client's site, not this app.
          a: ({ href, children }) => (
            <a href={href?.startsWith("/") ? `${base}${href}` : href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {draftBodyMarkdown(markdown)}
      </ReactMarkdown>
    </div>
  );
}
