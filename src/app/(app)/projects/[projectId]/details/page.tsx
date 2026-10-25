import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { KnowledgeTier } from "@/components/KnowledgeTier";
import { Card } from "@/components/ui/Card";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { getCurrentKnowledge } from "@/lib/knowledge";
import { listClients } from "@/lib/clients";
import { formatDateTime } from "@/lib/format";
import { listPillars } from "@/lib/pillars";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { getWixSettings } from "@/lib/wix-credentials";
import {
  addCategoryAction,
  addPillarAction,
  checkWixAction,
  chooseWixMemberAction,
  loadWixMembersAction,
  removeCategoryAction,
  removeDriveFolderAction,
  removePillarAction,
  removeWixCredentialsAction,
  saveDriveFolderAction,
  saveWixCredentialsAction,
  updateProjectSettingsAction,
} from "./actions";
import { DriveFolderForm } from "./DriveFolderForm";
import { PillarsForm } from "./PillarsForm";
import { CategoriesForm } from "./CategoriesForm";
import { listCategories } from "@/lib/categories";
import { OTHER_CATEGORY } from "@/config/run-status";
import { ProjectSettingsForm } from "./ProjectSettingsForm";
import { WixForm } from "./WixForm";

export const metadata: Metadata = { title: "Project details" };

export default function ProjectDetailsPage({ params, searchParams }: PageProps<"/projects/[projectId]/details">) {
  return (
    <Suspense fallback={<LoadingCard minHeight={320} />}>
      <DetailsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// The Details tab (Phase 2 A2): the project's profile first, then its settings and connectors. The profile is the
// project knowledge every writer reads; the client's voice is shown read-only and edited on the client page.
async function DetailsContent({ params, searchParams }: Pick<PageProps<"/projects/[projectId]/details">, "params" | "searchParams">) {
  await requireUser();
  const { projectId } = await params;
  const { version } = await searchParams;
  const [project, clients, pillars, categories, wix] = await Promise.all([getProject(projectId), listClients(), listPillars(projectId), listCategories(projectId), getWixSettings(projectId)]);
  if (!project) notFound();
  const client = await getCurrentKnowledge({ tier: "client", clientId: project.clientId });
  const voice = client?.sections.voice?.trim();
  return (
    <div className="app-stack">
      <Card className="app-section" aria-labelledby="profile-heading">
        <div>
          <h2 id="profile-heading" className="heading app-section-title">
            Profile
          </h2>
          <p className="small app-section-text">Who the posts are for, what they may say about this site, and where they send the reader.</p>
        </div>
        <div className="app-stack" style={{ gap: 6 }}>
          <h3 className="subheading" style={{ margin: 0 }}>
            Brand voice
          </h3>
          <pre className="body app-knowledge-readonly" aria-label="Brand voice, read only">{voice || "No voice written yet."}</pre>
          <p className="small app-muted" style={{ margin: 0 }}>
            The voice belongs to {project.clientName}, so every project of theirs shares it.{" "}
            <Link href={`/crm/${project.clientId}`}>Edit it on the client page</Link>.
          </p>
        </div>
        <KnowledgeTier scope={{ tier: "project", projectId: project.id }} basePath={`/projects/${project.id}/details`} version={typeof version === "string" ? version : undefined} />
      </Card>
      <ProjectSettingsForm
        clients={clients.map(({ id, name }) => ({ id, name }))}
        project={{
          clientId: project.clientId,
          name: project.name,
          siteUrl: project.siteUrl,
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
      <CategoriesForm
        categories={categories.map(({ id, label }) => ({ id, label }))}
        other={OTHER_CATEGORY}
        action={addCategoryAction.bind(null, project.id)}
        removeAction={removeCategoryAction.bind(null, project.id)}
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
      <WixForm
        current={wix ? { ...wix, checkedAt: wix.checkedAt ? formatDateTime(wix.checkedAt) : null } : null}
        saveAction={saveWixCredentialsAction.bind(null, project.id)}
        checkAction={checkWixAction.bind(null, project.id)}
        removeAction={removeWixCredentialsAction.bind(null, project.id)}
        loadMembersAction={loadWixMembersAction.bind(null, project.id)}
        chooseMemberAction={chooseWixMemberAction.bind(null, project.id)}
      />
    </div>
  );
}
