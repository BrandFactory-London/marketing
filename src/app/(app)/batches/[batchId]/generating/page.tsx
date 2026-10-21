import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Breadcrumb, PageHeader } from "@/components/ui/PageHeader";
import { getBatchProgress } from "@/lib/batch-progress";
import { requireUser } from "@/lib/session";
import { retryPostAction } from "../../actions";
import { GeneratingView } from "./GeneratingView";

export const metadata: Metadata = { title: "Generating" };

export default function GeneratingPage({ params }: PageProps<"/batches/[batchId]/generating">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow="Projects" title="Generating" />
          <LoadingCard minHeight={360} />
        </>
      }
    >
      <Generating params={params} />
    </Suspense>
  );
}

async function Generating({ params }: Pick<PageProps<"/batches/[batchId]/generating">, "params">) {
  await requireUser();
  const { batchId } = await params;
  const progress = await getBatchProgress(batchId);
  if (!progress) notFound();
  return (
    <>
      <PageHeader
        eyebrow={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              { label: progress.projectName, href: `/projects/${progress.projectId}` },
              { label: progress.batchName, href: `/batches/${progress.batchId}` },
            ]}
          />
        }
        title="Generating"
        meta={`${progress.models} · You can leave this page. The batch keeps running and lands in your review queue.`}
      />
      <GeneratingView initial={progress} retryAction={retryPostAction.bind(null, progress.batchId)} />
    </>
  );
}
