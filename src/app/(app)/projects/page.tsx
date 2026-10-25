import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectSummaryCard } from "@/components/ProjectCards";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { listClients } from "@/lib/clients";
import { nextSlots } from "@/lib/posts";
import { listProjects, type ProjectWithClient } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { ProjectsHeader } from "./ProjectsHeader";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow="Each project is one site that gets marketing content, grouped by client." title="Projects" />
          <LoadingCard minHeight={240} />
        </>
      }
    >
      <ProjectsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectsContent({ searchParams }: Pick<PageProps<"/projects">, "searchParams">) {
  await requireUser();
  const query = await searchParams;
  const [clients, projects, next] = await Promise.all([listClients(), listProjects(), nextSlots()]);
  const openWith = query.add ? { clientId: typeof query.client === "string" ? query.client : undefined } : undefined;

  const groups = new Map<string, { name: string; projects: ProjectWithClient[] }>();
  for (const project of projects) {
    const group = groups.get(project.clientId) ?? { name: project.clientName, projects: [] };
    group.projects.push(project);
    groups.set(project.clientId, group);
  }

  return (
    <>
      <ProjectsHeader clients={clients.map(({ id, name }) => ({ id, name }))} openWith={openWith} />
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" text="Add a project for a client to give it a site, its knowledge and its runs." />
      ) : (
        [...groups.entries()].map(([clientId, group]) => (
          <section key={clientId} className="app-section" aria-label={group.name}>
            <h2 className="label app-group-label">{group.name}</h2>
            <div className="app-card-grid">
              {group.projects.map((project, index) => (
                <ProjectSummaryCard key={project.id} project={project} next={next.get(project.id)} index={index} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
