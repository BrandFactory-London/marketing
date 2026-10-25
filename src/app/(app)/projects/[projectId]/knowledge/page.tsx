import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { formatDate, formatDateTime } from "@/lib/format";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { listSitePages } from "@/lib/sitemap";
import { siteHost } from "@/lib/validation";
import { ImportSitemap } from "./ImportSitemap";
import { importSitemapAction } from "./sitemap-actions";

export const metadata: Metadata = { title: "Project knowledge" };

// The import reads every page's title within a 45 second budget; this covers the Server Action too.
export const maxDuration = 60;

export default function KnowledgePage({ params }: PageProps<"/projects/[projectId]/knowledge">) {
  return (
    <Suspense fallback={<LoadingCard minHeight={320} />}>
      <KnowledgeContent params={params} />
    </Suspense>
  );
}

// The Knowledge tab (Phase 2 A2): where the project's knowledge comes from, and the site's pages. The project's own
// sections are edited on Details; session B replaces this page with knowledge entries, keeping its tab and URL.
async function KnowledgeContent({ params }: Pick<PageProps<"/projects/[projectId]/knowledge">, "params">) {
  await requireUser();
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const pages = await listSitePages(project.id);
  const source = `${siteHost(project.siteUrl)}/sitemap.xml`;

  return (
    <div className="app-stack">
      <section className="app-section" aria-label="Where the knowledge comes from">
        <div className="bfm-card app-tier-note">
          <p className="body" style={{ margin: 0 }}>
            Posts here follow the project&apos;s profile on <Link href={`/projects/${project.id}/details`}>Details</Link>, the {project.clientName} client
            knowledge and the BrandFactory rules.
          </p>
          <div className="app-row">
            <ButtonLink variant="secondary" size="sm" href={`/crm/${project.clientId}`}>
              Client knowledge
            </ButtonLink>
            <ButtonLink variant="secondary" size="sm" href="/settings/rules">
              BrandFactory rules
            </ButtonLink>
          </div>
        </div>
      </section>

      <Card className="app-section" aria-labelledby="sitemap-heading">
        <div>
          <h2 id="sitemap-heading" className="heading app-section-title">
            Sitemap
          </h2>
          <p className="small app-section-text">
            {project.sitemapImportedAt
              ? `Built from ${source} · last read ${formatDateTime(project.sitemapImportedAt)} · ${pages.length} ${pages.length === 1 ? "page" : "pages"}`
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
                    <td className="app-table-name" data-label="Page">
                      {page.title}
                    </td>
                    <td data-label="Path">
                      <a href={page.url} target="_blank" rel="noreferrer">
                        {page.path}
                      </a>
                    </td>
                    <td className="app-muted" data-label="Last changed">
                      {page.lastmod ? formatDate(page.lastmod) : "Not given"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
