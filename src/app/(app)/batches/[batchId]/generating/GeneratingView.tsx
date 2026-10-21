"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/Stepper";
import type { BatchProgress } from "@/lib/batch-progress";

const POLL_MS = 3000;

// Polls the progress route every 3 seconds while posts are still running (γ4 orientation Q6). The aurora,
// shimmer, skeleton and progress fill show only while work runs, as the design system reserves them.
export function GeneratingView({ initial, retryAction }: { initial: BatchProgress; retryAction: (postId: string) => Promise<void> }) {
  // A poll result belongs to the server render it followed; a fresh render (after a retry) wins.
  const [polled, setPolled] = useState<{ after: BatchProgress; value: BatchProgress } | null>(null);
  const [lost, setLost] = useState(false);
  const progress = polled?.after === initial ? polled.value : initial;
  const running = !progress.done && progress.total > 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/batches/${initial.batchId}/progress`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const value = (await response.json()) as BatchProgress;
        setPolled({ after: initial, value });
        setLost(false);
      } catch {
        setLost(true);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [initial, running]);

  const current = progress.rows.find((row) => row.running);
  const statusLine = current ? `${current.label}: ${current.topic}` : "Starting";
  return (
    <>
      <Stepper current={progress.done ? "Review" : "Generate"} />
      <section className={["bfm-aurora", "app-generating", running ? "bfm-aurora-active" : ""].filter(Boolean).join(" ")} aria-live="polite">
        {running ? (
          <>
            <div className="app-row app-generating-head">
              <span className="subheading bfm-shimmer">{statusLine}</span>
              <span className="small">{progress.percent}% done</span>
            </div>
            <div className="bfm-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Batch progress">
              <div className="bfm-progress-bar" style={{ width: `${progress.percent}%` }} />
            </div>
            <div className="app-stack app-skeletons" aria-hidden="true">
              <div className="bfm-skeleton" style={{ width: "94%" }} />
              <div className="bfm-skeleton" style={{ width: "86%" }} />
              <div className="bfm-skeleton" style={{ width: "58%" }} />
            </div>
          </>
        ) : (
          <div className="bfm-reveal app-generating-done">
            <div>
              <p className="subheading" style={{ margin: 0 }}>
                {progress.total === 0 ? "Nothing is generating in this batch" : `${progress.finished} of ${progress.total} ${progress.total === 1 ? "post" : "posts"} finished`}
              </p>
              <p className="small app-muted" style={{ margin: "4px 0 0" }}>
                {progress.inReview} in your review queue
                {progress.needsAttention > 0 ? ` · ${progress.needsAttention} to retry` : ""} · {progress.cost} so far
              </p>
            </div>
            {progress.inReview > 0 ? <ButtonLink href="/review">Review posts</ButtonLink> : <ButtonLink href={`/batches/${progress.batchId}`} variant="secondary">Back to the specs</ButtonLink>}
          </div>
        )}
        {running ? (
          <p className="small app-muted" style={{ margin: 0 }}>
            {progress.finished} of {progress.total} finished · {progress.cost} so far
            {lost ? " · Progress could not be refreshed. Retrying." : ""}
          </p>
        ) : null}
      </section>
      <div className="app-stack">
        {progress.rows.map((row, index) => (
          <section key={row.postId} className="bfm-card bfm-reveal app-progress-row" style={{ animationDelay: `${index * 60}ms` }}>
            <div>
              <p className="subheading" style={{ margin: 0 }}>
                {row.draftHref ? <Link href={row.draftHref}>{row.topic}</Link> : row.topic}
              </p>
              <p className="small app-muted" style={{ margin: "4px 0 0" }}>
                {row.date} · {row.detail}
                {row.words ? ` · ${row.words.toLocaleString("en-GB")} words` : ""} · {row.cost}
              </p>
            </div>
            <div className="app-row">
              <Badge tone={row.tone}>{row.label}</Badge>
              {row.canRetry ? (
                <form action={retryAction.bind(null, row.postId)}>
                  <Button type="submit" size="sm" variant="secondary">
                    Retry post
                  </Button>
                </form>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
