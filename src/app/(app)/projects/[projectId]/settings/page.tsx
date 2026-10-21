import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { listClients } from "@/lib/clients";
import { formatDateTime } from "@/lib/format";
import { listPillars } from "@/lib/pillars";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { addPillarAction, removeDriveFolderAction, removePillarAction, saveDriveFolderAction, updateProjectSettingsAction } from "./actions";
import { DriveFolderForm } from "./DriveFolderForm";
import { PillarsForm } from "./PillarsForm";
import { ProjectSettingsForm } from "./ProjectSettingsForm";

export const metadata: Metadata = { title: "Project settings" };

export default function ProjectSettingsPage({ params }: PageProps<"/projects/[projectId]/settings">) {
  return (
    <Suspense fallback={<LoadingCard minHeight={320} />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

async function SettingsContent({ params }: Pick<PageProps<"/projects/[projectId]/settings">, "params">) {
  await requireUser();
  const { projectId } = await params;
  const [project, clients, pillars] = await Promise.all([getProject(projectId), listClients(), listPillars(projectId)]);
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
      <PillarsForm
        pillars={pillars.map(({ id, label, slug }) => ({ id, label, slug }))}
        action={addPillarAction.bind(null, project.id)}
        removeAction={removePillarAction.bind(null, project.id)}
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
