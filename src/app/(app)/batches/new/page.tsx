import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Breadcrumb, PageHeader } from "@/components/ui/PageHeader";
import { Stepper } from "@/components/ui/Stepper";
import { MODELS } from "@/config/models";
import { DEFAULT_LENGTH, defaultCta, FAQ_MODES, listBatchableSlots } from "@/lib/batches";
import { longDate, monthLabel, monthOf } from "@/lib/dates";
import { getCurrentKnowledge } from "@/lib/knowledge";
import { listPillars } from "@/lib/pillars";
import { getProject, listProjects } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { getModelSettings } from "@/lib/settings";
import { isUuid } from "@/lib/validation";
import { createBatchAction } from "../actions";
import { BatchForm } from "./BatchForm";
import { ProjectChoice } from "./ProjectChoice";

export const metadata: Metadata = { title: "New batch" };

export default function NewBatchPage({ searchParams }: PageProps<"/batches/new">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow="Projects" title="New batch" />
          <LoadingCard minHeight={480} />
        </>
      }
    >
      <NewBatch searchParams={searchParams} />
    </Suspense>
  );
}

async function NewBatch({ searchParams }: Pick<PageProps<"/batches/new">, "searchParams">) {
  await requireUser();
  const query = await searchParams;
  const projectId = typeof query.project === "string" && isUuid(query.project) ? query.project : null;
  const only = typeof query.post === "string" && isUuid(query.post) ? query.post : null;
  const [projects, project] = await Promise.all([listProjects(), projectId ? getProject(projectId) : Promise.resolve(null)]);
  const choice = <ProjectChoice project={project?.id} projects={projects.map(({ id, name, clientName }) => ({ id, name: `${clientName}: ${name}` }))} />;

  if (!project) {
    return (
      <>
        <PageHeader eyebrow="Projects" title="New batch" />
        <Stepper current="Spec" />
        <section className="bfm-card app-form">
          <h2 className="heading app-section-title">Choose a project</h2>
          <p className="small app-section-text">A batch writes posts for one project, from the slots that already have a topic.</p>
          {choice}
        </section>
      </>
    );
  }

  const [slots, pillars, settings, knowledge] = await Promise.all([
    listBatchableSlots(project.id),
    listPillars(project.id),
    getModelSettings(),
    getCurrentKnowledge({ tier: "project", projectId: project.id }),
  ]);
  const header = (
    <PageHeader
      eyebrow={<Breadcrumb items={[{ label: "Projects", href: "/projects" }, { label: project.name, href: `/projects/${project.id}` }]} />}
      title="New batch"
    />
  );
  if (slots.length === 0) {
    return (
      <>
        {header}
        <Stepper current="Spec" />
        <EmptyState
          title="No posts with a topic yet"
          text="A batch writes the slots that have a topic and are not in another batch. Set topics on the calendar or the project's Run plan tab, then come back."
        />
      </>
    );
  }

  const first = slots[0].slotDate;
  return (
    <>
      {header}
      <Stepper current="Spec" />
      <BatchForm
        projectChoice={choice}
        defaults={{
          name: `${monthLabel(monthOf(first))} posts`,
          lengthMin: DEFAULT_LENGTH.min,
          lengthMax: DEFAULT_LENGTH.max,
          cta: defaultCta(knowledge?.sections.cta),
          writerModel: settings.writerModel,
          criticModel: settings.criticModel,
        }}
        slots={slots.map((slot) => ({ id: slot.id, date: longDate(slot.slotDate), topic: slot.topic ?? "", pillarId: slot.pillarId, chosen: only ? slot.id === only : true }))}
        pillars={pillars.map(({ id, label }) => ({ value: id, label }))}
        models={MODELS.map((model) => ({ value: model.id, label: model.label }))}
        faqModes={FAQ_MODES}
        action={createBatchAction.bind(null, project.id)}
      />
    </>
  );
}
