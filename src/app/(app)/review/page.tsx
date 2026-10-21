import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stepper } from "@/components/ui/Stepper";
import { getPostStatus } from "@/config/post-status";
import { longDate } from "@/lib/dates";
import { listReviewQueue } from "@/lib/drafts";
import { formatCost } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Review queue" };

const EYEBROW = "Every post waits here for your approval before it can publish.";

export default function ReviewPage() {
  return (
    <>
      <PageHeader eyebrow={EYEBROW} title="Review queue" />
      <Stepper current="Review" />
      <Suspense fallback={<LoadingCard minHeight={240} />}>
        <Queue />
      </Suspense>
    </>
  );
}

async function Queue() {
  await requireUser();
  const items = await listReviewQueue();
  if (items.length === 0) return <EmptyState title="Nothing to review" text="Posts land here once they are drafted and checked." />;
  return (
    <div className="app-stack">
      {items.map((item, index) => {
        const status = getPostStatus(item.status);
        return (
          <Link key={item.postId} href={`/posts/${item.postId}`} className="bfm-card bfm-card-interactive bfm-reveal app-card-link app-progress-row" style={{ animationDelay: `${index * 60}ms` }}>
            <div>
              <p className="subheading" style={{ margin: 0 }}>
                {item.title}
              </p>
              <p className="small app-muted" style={{ margin: "4px 0 0" }}>
                {item.projectName} · {longDate(item.slotDate)} · {item.wordCount.toLocaleString("en-GB")} words · round {item.round} · {formatCost(item.costUsd)}
              </p>
              {item.criticSummary ? (
                <p className="small" style={{ margin: "4px 0 0" }}>
                  {item.criticSummary}
                </p>
              ) : null}
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </Link>
        );
      })}
    </div>
  );
}
