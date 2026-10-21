import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClientProjectCard } from "@/components/ProjectCards";
import { KnowledgeTier } from "@/components/KnowledgeTier";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getClient } from "@/lib/clients";
import { listClientProjects } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { ClientHeader } from "./ClientHeader";

export const metadata: Metadata = { title: "Client" };

export default function ClientPage({ params, searchParams }: PageProps<"/crm/[clientId]">) {
  return (
    <Suspense fallback={<Card aria-busy="true" className="bfm-skeleton" style={{ minHeight: 320 }} />}>
      <ClientContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ClientContent({ params, searchParams }: Pick<PageProps<"/crm/[clientId]">, "params" | "searchParams">) {
  await requireUser();
  const { clientId } = await params;
  const { version } = await searchParams;
  const client = await getClient(clientId);
  if (!client) notFound();
  const projects = await listClientProjects(client.id);

  return (
    <>
      <ClientHeader client={client} />

      <section className="app-section" aria-labelledby="client-projects">
        <div className="app-section-header">
          <h2 id="client-projects" className="heading app-section-title">
            Projects
          </h2>
          <Link className="small" href={`/projects?add=1&client=${client.id}`}>
            Add project
          </Link>
        </div>
        {projects.length === 0 ? (
          <EmptyState title="No projects yet" text={`Add a project for ${client.name} to give it a package and a site.`} />
        ) : (
          <div className="app-card-grid">
            {projects.map((project) => (
              <ClientProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      <section className="app-section" aria-labelledby="client-knowledge">
        <div>
          <h2 id="client-knowledge" className="heading app-section-title">
            Client knowledge
          </h2>
          <p className="small app-section-text">
            Shared by every {client.name} project. Adds to the BrandFactory rules in Settings, never overrides them.
          </p>
        </div>
        <KnowledgeTier
          scope={{ tier: "client", clientId: client.id }}
          basePath={`/crm/${client.id}`}
          version={typeof version === "string" ? version : undefined}
        />
      </section>

      <Card className="app-section" aria-labelledby="client-posts">
        <h2 id="client-posts" className="heading app-section-title">
          Posts
        </h2>
        <p className="body app-muted" style={{ margin: 0 }}>
          No posts yet. Posts written for this client&apos;s projects will be listed here.
        </p>
      </Card>
    </>
  );
}
