import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { listClients } from "@/lib/clients";
import { formatDateTime } from "@/lib/format";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { removeDriveFolderAction, saveDriveFolderAction, updateProjectSettingsAction } from "./actions";
import { DriveFolderForm } from "./DriveFolderForm";
import { ProjectSettingsForm } from "./ProjectSettingsForm";

export const metadata: Metadata = { title: "Project settings" };

export default function ProjectSettingsPage({ params }: PageProps<"/projects/[projectId]/settings">) {
  return (
    <Suspense fallback={<Card aria-busy="true" className="bfm-skeleton" style={{ minHeight: 320 }} />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

async function SettingsContent({ params }: Pick<PageProps<"/projects/[projectId]/settings">, "params">) {
  await requireUser();
  const { projectId } = await params;
  const [project, clients] = await Promise.all([getProject(projectId), listClients()]);
  if (!project) notFound();
  return (
    <div className="app-stack">
      <ProjectSettingsForm
        clients={clients.map(({ id, name }) => ({ id, name }))}
        project={{
          clientId: project.clientId,
          name: project.name,
          siteUrl: project.siteUrl,
          package: project.package,
          status: project.status,
          publishingTarget: project.publishingTarget,
        }}
        action={updateProjectSettingsAction.bind(null, project.id)}
      />
      <DriveFolderForm
        current={
          project.driveFolderId && project.driveFolderCheckedAt
            ? { id: project.driveFolderId, name: project.driveFolderName ?? project.driveFolderId, checkedAt: formatDateTime(project.driveFolderCheckedAt) }
            : null
        }
        action={saveDriveFolderAction.bind(null, project.id)}
        removeAction={removeDriveFolderAction.bind(null, project.id)}
      />
    </div>
  );
}
