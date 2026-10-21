import ReactMarkdown from "react-markdown";

// The writer's Markdown, read only. Raw HTML is never rendered (react-markdown ignores it without a raw
// plugin). The title and the Excerpt line are shown separately, so they are taken off the body here.
export function draftBodyMarkdown(markdown: string): string {
  return markdown
    .replace(/^# .+$/m, "")
    .replace(/^Excerpt:.*$/m, "")
    .trim();
}

export function DraftBody({ markdown, siteUrl }: { markdown: string; siteUrl: string }) {
  const base = siteUrl.replace(/\/+$/, "");
  return (
    <div className="app-draft-body body">
      <ReactMarkdown
        skipHtml
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
