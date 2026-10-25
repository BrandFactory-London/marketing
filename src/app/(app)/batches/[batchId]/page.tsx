import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Button, ButtonLink } from "@/components/ui/Button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Breadcrumb, PageHeader } from "@/components/ui/PageHeader";
import { Stepper } from "@/components/ui/Stepper";
import { FAQ_MODES, getBatch, listBatchPosts } from "@/lib/batches";
import { longDate } from "@/lib/dates";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { confirmAllAction, confirmSpecAction, editSpecAction, generateBatchAction, redraftSpecAction } from "../actions";
import { SpecCard } from "./SpecCard";

export const metadata: Metadata = { title: "Confirm the spec" };

export default function BatchPage({ params }: PageProps<"/batches/[batchId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow="Projects" title="Confirm the spec" />
          <LoadingCard minHeight={480} />
        </>
      }
    >
      <BatchContent params={params} />
    </Suspense>
  );
}

async function BatchContent({ params }: Pick<PageProps<"/batches/[batchId]">, "params">) {
  await requireUser();
  const { batchId } = await params;
  const batch = await getBatch(batchId);
  if (!batch) notFound();
  const [project, rows] = await Promise.all([getProject(batch.projectId), listBatchPosts(batch.id)]);
  if (!project) notFound();

  const specs = rows.map((row) => row.spec);
  const proposed = specs.filter((spec) => spec?.status === "proposed").length;
  const confirmed = specs.filter((spec) => spec?.status === "confirmed").length;
  const drafting = specs.some((spec) => spec?.status === "drafting");
  const started = rows.some((row) => row.generation);
  const ready = rows.filter((row) => row.status === "spec_confirmed" && row.spec?.status === "confirmed").length;
  const faqLabel = FAQ_MODES.find((mode) => mode.value === batch.faqMode)?.label ?? batch.faqMode;

  return (
    <>
      <AutoRefresh active={drafting} />
      <PageHeader
        eyebrow={<Breadcrumb items={[{ label: "Projects", href: "/projects" }, { label: project.name, href: `/projects/${project.id}` }]} />}
        title="Confirm the spec"
        meta={`${batch.name} · Nothing is written until every post's spec is confirmed.`}
        actions={
          proposed > 0 ? (
            <form action={confirmAllAction.bind(null, batch.id)}>
              <Button type="submit" variant="secondary">
                Confirm all
              </Button>
            </form>
          ) : null
        }
      />
      <Stepper current={started ? "Generate" : "Confirm"} />
      <p className="small app-muted">
        {batch.lengthMin} to {batch.lengthMax} words · CTA: {batch.cta} · FAQ: {faqLabel}
      </p>
      <div className="app-stack">
        {rows.map((row, index) =>
          row.spec ? (
            <SpecCard
              key={row.spec.id}
              number={index + 1}
              topic={row.topic ?? ""}
              date={longDate(row.slotDate)}
              pillar={row.pillar}
              locked={row.status !== "topic_set" && row.status !== "spec_confirmed"}
              spec={{
                status: row.spec.status,
                version: row.spec.version,
                keyword: row.spec.keyword,
                postType: row.spec.postType,
                location: row.spec.location,
                angle: row.spec.angle,
                outline: row.spec.outline ?? [],
                facts: row.spec.facts ?? [],
                links: row.spec.links ?? [],
                faq: row.spec.faq,
                lengthMin: row.spec.lengthMin,
                lengthMax: row.spec.lengthMax,
                cta: row.spec.cta,
                error: row.spec.error,
                auto: row.spec.auto,
              }}
              editAction={editSpecAction.bind(null, row.spec.id)}
              redraftAction={redraftSpecAction.bind(null, row.spec.id)}
              confirmAction={confirmSpecAction.bind(null, row.spec.id)}
            />
          ) : null,
        )}
      </div>
      <section className="bfm-card app-batch-footer" aria-label="Generate">
        <p className="body" style={{ margin: 0 }}>
          {confirmed} of {rows.length} specs confirmed
        </p>
        <div className="app-row">
          {started ? (
            <ButtonLink variant="secondary" href={`/batches/${batch.id}/generating`}>
              Open progress
            </ButtonLink>
          ) : null}
          {ready > 0 && (confirmed === rows.length || started) ? (
            <form action={generateBatchAction.bind(null, batch.id)}>
              <Button type="submit">{`Generate ${ready} ${ready === 1 ? "post" : "posts"}`}</Button>
            </form>
          ) : (
            <Button disabled>{`Generate ${rows.length} ${rows.length === 1 ? "post" : "posts"}`}</Button>
          )}
        </div>
      </section>
    </>
  );
}
