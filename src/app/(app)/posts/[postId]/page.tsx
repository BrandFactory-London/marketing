import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DraftBody } from "@/components/DraftBody";
import { Badge } from "@/components/ui/Badge";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { Breadcrumb, PageHeader } from "@/components/ui/PageHeader";
import { KNOWLEDGE_TIERS } from "@/config/knowledge";
import { modelLabel, PRICES_CHECKED } from "@/config/models";
import { getPostStatus } from "@/config/post-status";
import { longDate } from "@/lib/dates";
import { getDraftView, type DraftRound } from "@/lib/drafts";
import { formatCost } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Draft" };

export default function DraftPage({ params }: PageProps<"/posts/[postId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow="Review queue" title="Draft" />
          <LoadingCard minHeight={480} />
        </>
      }
    >
      <Draft params={params} />
    </Suspense>
  );
}

async function Draft({ params }: Pick<PageProps<"/posts/[postId]">, "params">) {
  await requireUser();
  const { postId } = await params;
  const view = await getDraftView(postId);
  if (!view) notFound();
  const { post, project, latest, spec } = view;
  const status = getPostStatus(post.status);
  return (
    <>
      <PageHeader
        eyebrow={
          <Breadcrumb
            items={[
              { label: "Review queue", href: "/review" },
              { label: project.name, href: `/projects/${project.id}` },
              ...(post.batchId ? [{ label: "Batch", href: `/batches/${post.batchId}/generating` }] : []),
            ]}
          />
        }
        title={latest.title}
        meta={`${longDate(post.slotDate)} · ${latest.wordCount.toLocaleString("en-GB")} words · round ${latest.round}${post.pillar ? ` · ${post.pillar}` : ""} · ${formatCost(view.totalCost)}`}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      <div className="app-draft-layout">
        <article className="bfm-card app-draft">
          <p className="label app-muted" style={{ margin: 0 }}>
            Excerpt
          </p>
          <p className="body" style={{ margin: 0 }}>
            {latest.excerpt ?? "No excerpt."}
          </p>
          <p className="label app-muted" style={{ margin: 0 }}>
            Body · {latest.wordCount.toLocaleString("en-GB")} words · read only
          </p>
          <DraftBody markdown={latest.bodyMd} siteUrl={project.siteUrl} />
        </article>

        <aside className="app-stack">
          {[...view.rounds].reverse().map((round) => (
            <RoundNotes key={round.round} round={round} />
          ))}

          {spec ? (
            <section className="bfm-card app-stack" aria-labelledby="spec-heading">
              <h2 id="spec-heading" className="subheading" style={{ margin: 0 }}>
                Confirmed spec
              </h2>
              <dl className="app-facts small">
                <dt>Keyword</dt>
                <dd>{spec.keyword}</dd>
                <dt>Post type</dt>
                <dd>{spec.postType}</dd>
                <dt>Length</dt>
                <dd>
                  {spec.lengthMin} to {spec.lengthMax} words
                </dd>
                <dt>FAQ</dt>
                <dd>{spec.faq ? "Yes" : "No"}</dd>
                <dt>Call to action</dt>
                <dd>{spec.cta}</dd>
                <dt>Links</dt>
                <dd>{(spec.links ?? []).join(", ") || "None"}</dd>
              </dl>
              <p className="small" style={{ margin: 0 }}>
                {spec.angle}
              </p>
            </section>
          ) : null}

          <section className="bfm-card app-stack" aria-labelledby="knowledge-heading">
            <h2 id="knowledge-heading" className="subheading" style={{ margin: 0 }}>
              Written with
            </h2>
            <ul className="app-plain-list small">
              {view.versions.map((item) => (
                <li key={item.tier}>
                  {KNOWLEDGE_TIERS[item.tier].label}:{" "}
                  {item.href ? <Link href={item.href}>version {item.version}</Link> : <span className="app-muted">never saved</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="bfm-card app-stack" aria-labelledby="cost-heading">
            <h2 id="cost-heading" className="subheading" style={{ margin: 0 }}>
              Cost {formatCost(view.totalCost)}
            </h2>
            <table className="app-cost small">
              <thead>
                <tr>
                  <th scope="col">Call</th>
                  <th scope="col">Tokens in, cached, out</th>
                  <th scope="col">Cost</th>
                </tr>
              </thead>
              <tbody>
                {view.costs.map((line, index) => (
                  <tr key={index}>
                    <td>{line.label}</td>
                    <td>
                      {line.inputTokens.toLocaleString("en-GB")}, {line.cachedTokens.toLocaleString("en-GB")}, {line.outputTokens.toLocaleString("en-GB")}
                    </td>
                    <td>{formatCost(line.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small app-muted" style={{ margin: 0 }}>
              US dollars before VAT, at list prices checked {longDate(PRICES_CHECKED)}. Cached input is the knowledge pack read again from the cache, at a much lower price.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

function RoundNotes({ round }: { round: DraftRound }) {
  const failedChecks = round.checks.issues;
  return (
    <section className="bfm-card app-stack" aria-label={`Round ${round.round}`}>
      <div className="app-card-head">
        <h2 className="subheading" style={{ margin: 0 }}>
          Round {round.round}
        </h2>
        {round.verdict ? (
          <Badge tone={round.verdict.verdict === "pass" ? "success" : "danger"}>{round.verdict.verdict === "pass" ? "Critic passed it" : "Critic failed it"}</Badge>
        ) : !round.checksPassed ? (
          <Badge tone="danger">Checks failed it</Badge>
        ) : null}
      </div>
      {failedChecks.length > 0 ? (
        <div>
          <p className="label app-muted">Scripted checks</p>
          <ul className="app-plain-list small">
            {failedChecks.map((issue, index) => (
              <li key={index}>
                {issue.message}
                {issue.quote ? <q className="app-quote">{issue.quote}</q> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="small app-muted" style={{ margin: 0 }}>
          Scripted checks passed: {round.wordCount.toLocaleString("en-GB")} words, no dashes or banned phrases, links on the allowed list.
        </p>
      )}
      {round.verdict ? (
        <div className="app-stack">
          <p className="small" style={{ margin: 0 }}>
            {round.verdict.model ? `${modelLabel(round.verdict.model)}: ` : ""}
            {round.verdict.summary}
          </p>
          <p className="small app-muted" style={{ margin: 0 }}>
            {Object.entries(round.verdict.scores)
              .map(([name, score]) => `${name} ${score}`)
              .join(" · ")}
          </p>
          {round.verdict.issues.length > 0 ? (
            <ul className="app-plain-list small">
              {round.verdict.issues.map((issue, index) => (
                <li key={index}>
                  <Badge tone={issue.severity === "blocking" ? "danger" : "neutral"}>{issue.severity === "blocking" ? "Blocking" : "Minor"}</Badge> [{issue.category}] {issue.note}
                  <q className="app-quote">{issue.quote}</q>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
