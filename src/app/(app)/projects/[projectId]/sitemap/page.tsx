import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { formatDate, formatDateTime } from "@/lib/format";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { listSitePages } from "@/lib/sitemap";
import { siteHost } from "@/lib/validation";
import { importSitemapAction } from "./actions";
import { ImportSitemap } from "./ImportSitemap";

export const metadata: Metadata = { title: "Sitemap" };

// The import reads every page's title within a 45 second budget; this covers the Server Action too.
export const maxDuration = 60;

export default function SitemapPage({ params }: PageProps<"/projects/[projectId]/sitemap">) {
  return (
    <Suspense fallback={<Card aria-busy="true" className="bfm-skeleton" style={{ minHeight: 240 }} />}>
      <SitemapContent params={params} />
    </Suspense>
  );
}

async function SitemapContent({ params }: Pick<PageProps<"/projects/[projectId]/sitemap">, "params">) {
  await requireUser();
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const pages = await listSitePages(project.id);
  const source = `${siteHost(project.siteUrl)}/sitemap.xml`;

  return (
    <Card className="app-section" aria-labelledby="sitemap-heading">
      <div>
        <h2 id="sitemap-heading" className="heading app-section-title">
          Sitemap
        </h2>
        <p className="small app-section-text">
          {project.sitemapImportedAt
            ? `Built from ${source} · last read ${formatDateTime(project.sitemapImportedAt)}`
            : `Not imported yet. The page list is read from ${source}.`}
        </p>
      </div>
      <ImportSitemap imported={Boolean(project.sitemapImportedAt)} action={importSitemapAction.bind(null, project.id)} />
      {pages.length === 0 ? null : (
        <div className="app-table-wrap">
          <table className="small app-table">
            <caption className="app-visually-hidden">Pages from the sitemap</caption>
            <thead>
              <tr>
                <th className="label">Page</th>
                <th className="label">Path</th>
                <th className="label">Last changed</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.id}>
                  <td className="app-table-name">{page.title}</td>
                  <td>
                    <a href={page.url} target="_blank" rel="noreferrer">
                      {page.path}
                    </a>
                  </td>
                  <td className="app-muted">{page.lastmod ? formatDate(page.lastmod) : "Not given"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
