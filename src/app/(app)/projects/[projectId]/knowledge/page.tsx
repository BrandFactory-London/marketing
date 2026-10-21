import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { KnowledgeTier } from "@/components/KnowledgeTier";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { listSitePages } from "@/lib/sitemap";
import Link from "next/link";

export const metadata: Metadata = { title: "Project knowledge" };

export default function KnowledgePage({ params, searchParams }: PageProps<"/projects/[projectId]/knowledge">) {
  return (
    <Suspense fallback={<Card aria-busy="true" className="bfm-skeleton" style={{ minHeight: 320 }} />}>
      <KnowledgeContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function KnowledgeContent({ params, searchParams }: Pick<PageProps<"/projects/[projectId]/knowledge">, "params" | "searchParams">) {
  await requireUser();
  const { projectId } = await params;
  const { version } = await searchParams;
  const project = await getProject(projectId);
  if (!project) notFound();
  const pages = await listSitePages(project.id);
  const basePath = `/projects/${project.id}/knowledge`;

  return (
    <section className="app-section" aria-label="Project knowledge">
      <div className="bfm-card app-tier-note">
        <p className="body" style={{ margin: 0 }}>
          Posts here also follow the {project.clientName} client knowledge and the BrandFactory rules.
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
      <p className="small app-muted" style={{ margin: 0 }}>
        {pages.length === 0 ? "No site pages imported yet. " : `${pages.length} site pages imported. `}
        <Link href={`/projects/${project.id}/sitemap`}>See the Sitemap tab</Link> for every page you can link to.
      </p>
      <KnowledgeTier scope={{ tier: "project", projectId: project.id }} basePath={basePath} version={typeof version === "string" ? version : undefined} />
    </section>
  );
}
