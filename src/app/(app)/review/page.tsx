import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stepper } from "@/components/ui/Stepper";
import { getPostStatus, REVIEW_LINES } from "@/config/post-status";
import { longDate } from "@/lib/dates";
import { listReviewQueue, type ReviewItem } from "@/lib/drafts";
import { formatCost } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Review queue" };

const EYEBROW = "Every post waits here for your approval before it can publish.";

// The prototype's filter chips (γ5 orientation, smaller decisions).
const FILTERS = [
  { key: "all", label: "All", keep: () => true },
  { key: "in_review", label: getPostStatus("in_review").label, keep: (item: ReviewItem) => item.status === "in_review" },
  { key: "flagged", label: getPostStatus("flagged").label, keep: (item: ReviewItem) => item.status === "flagged" },
  { key: "input", label: REVIEW_LINES.needsInput.label, keep: (item: ReviewItem) => item.placeholders > 0 },
] as const;

export default function ReviewPage({ searchParams }: PageProps<"/review">) {
  return (
    <>
      <PageHeader eyebrow={EYEBROW} title="Review queue" />
      <Stepper current="Review" />
      <Suspense fallback={<LoadingCard minHeight={240} />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/review">, "searchParams">) {
  await requireUser();
  const { filter } = await searchParams;
  const current = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
  const all = await listReviewQueue();
  if (all.length === 0) return <EmptyState title="Nothing to review" text="Posts land here once they are drafted and checked." />;
  const items = all.filter(current.keep);
  return (
    <div className="app-stack">
      <nav className="app-review-buttons" aria-label="Filter the queue">
        {FILTERS.map((item) => (
          <ButtonLink key={item.key} href={item.key === "all" ? "/review" : `/review?filter=${item.key}`} variant={item.key === current.key ? "secondary" : "ghost"} size="sm" current={item.key === current.key}>
            {item.label}
          </ButtonLink>
        ))}
      </nav>
      {items.length === 0 ? <p className="body app-muted">No posts match this filter.</p> : null}
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
            <div className="app-review-buttons">
              {item.placeholders > 0 ? <Badge tone={REVIEW_LINES.needsInput.tone}>{item.placeholders} to fill</Badge> : null}
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
