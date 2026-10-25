import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumb, PageHeader } from "@/components/ui/PageHeader";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { ButtonLink } from "@/components/ui/Button";
import { publishingTargetLabel } from "@/config/projects";
import { projectTabs } from "@/lib/nav";
import { unseenCount } from "@/lib/plan-share";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { siteHost } from "@/lib/validation";

export default function ProjectLayout({ params, children }: LayoutProps<"/projects/[projectId]">) {
  return (
    <>
      <Suspense fallback={<PageHeader eyebrow="Projects" title="Project" />}>
        <ProjectHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function ProjectHeader({ params }: Pick<LayoutProps<"/projects/[projectId]">, "params">) {
  await requireUser();
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  return (
    <>
      <PageHeader
        eyebrow={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              { label: project.clientName, href: `/crm/${project.clientId}` },
            ]}
          />
        }
        title={project.name}
        meta={`${siteHost(project.siteUrl)} · publishes to ${publishingTargetLabel(project.publishingTarget)}`}
        actions={<ButtonLink href={`/batches/new?project=${project.id}`}>Create content</ButtonLink>}
      />
      <LinkTabs label="Project sections" tabs={projectTabs(project.id, await unseenCount(project.id))} />
    </>
  );
}
