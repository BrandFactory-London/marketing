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
import { getDraftView, type DraftRound, type DraftView } from "@/lib/drafts";
import { formatCost } from "@/lib/format";
import { listPillars } from "@/lib/pillars";
import { checkInputFor, currentText, DETAILS_STATUSES, EDITABLE_STATUSES, listReviewEvents, placeholderAsks, suggestedSlug } from "@/lib/review";
import { requireUser } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GENERATION_STEPS, GENERATION_LINES } from "@/config/post-status";
import { hasStalled } from "@/lib/progress";
import { approveAction, detailsAction, regenerateAction, rejectAction, reopenAction, saveDraftAction, stopWaitingAction } from "./actions";
import { DetailsForm, RegenerateForm, ReopenButton, StopWaitingButton } from "./PostControls";
import { ReviewEditor } from "./ReviewEditor";

export const metadata: Metadata = { title: "Review a post" };

export default function PostPage({ params }: PageProps<"/posts/[postId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow="Review queue" title="Review a post" />
          <LoadingCard minHeight={480} />
        </>
      }
    >
      <Post params={params} />
    </Suspense>
  );
}

async function Post({ params }: Pick<PageProps<"/posts/[postId]">, "params">) {
  await requireUser();
  const { postId } = await params;
  const [view, current] = await Promise.all([getDraftView(postId), currentText(postId)]);
  if (!view || !current) notFound();
  const { post, project, latest } = view;
  const status = getPostStatus(post.status);
  const editable = EDITABLE_STATUSES.includes(post.status);
  const [pillars, events] = await Promise.all([listPillars(project.id), listReviewEvents(post.id)]);
  const slug = post.slug ?? (DETAILS_STATUSES.includes(post.status) ? await suggestedSlug(post.id, project.id, current.text.title) : "");
  const lastEvent = events.at(-1);
  // A regenerate that is running, or that could not finish (γ5 orientation Q4).
  const newest = view.newest;
  const running = post.status === "generating";
  const stalled = running && newest !== null && hasStalled(newest.updatedAt);
  const failedRegenerate = !running && newest?.status === "failed" && newest.note ? newest : null;

  const details = (
    <section className="bfm-card app-stack" aria-labelledby="details-heading">
      <h2 id="details-heading" className="subheading" style={{ margin: 0 }}>
        Publishing details
      </h2>
      <DetailsForm
        action={detailsAction.bind(null, post.id)}
        slug={slug}
        slugSaved={Boolean(post.slug)}
        pillarId={post.pillarId}
        pillars={pillars.map((pillar) => ({ value: pillar.id, label: pillar.label }))}
        locked={!DETAILS_STATUSES.includes(post.status)}
      />
    </section>
  );
  const aside = (
    <>
      {details}
      <PostFacts view={view} />
    </>
  );

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
        title={current.text.title || latest.title}
        meta={`${longDate(post.slotDate)} · round ${latest.round}${post.pillar ? ` · ${post.pillar}` : ""} · ${formatCost(view.totalCost)}`}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      {post.status === "approved" ? (
        <div className="bfm-card app-card-head" role="status">
          <p className="body" style={{ margin: 0 }}>
            Approved{post.approvedAt ? ` on ${longDate(post.approvedAt.toISOString().slice(0, 10))}` : ""}. The text is locked; publishing details can still change until it is published.
          </p>
          <ReopenButton action={reopenAction.bind(null, post.id)} />
        </div>
      ) : null}
      {post.status === "rejected" ? (
        <div className="bfm-card app-stack" role="status">
          {lastEvent?.action === "reject" ? (
            <p className="body" style={{ margin: 0 }}>
              Rejected: {lastEvent.note}
            </p>
          ) : null}
          <RegenerateForm action={regenerateAction.bind(null, post.id)} />
        </div>
      ) : null}
      {running ? (
        <div className={`bfm-card app-stack ${stalled ? "" : "bfm-aurora bfm-aurora-active"}`} role="status">
          <AutoRefresh active={!stalled} />
          <div className="app-card-head">
            <p className="body" style={{ margin: 0 }}>
              {stalled
                ? "This post stopped reporting progress."
                : `${post.generationStep ? GENERATION_STEPS[post.generationStep] : GENERATION_LINES.queued.label}: the writer is working on a new version${newest?.note ? ` for your note "${newest.note.replace(/[.!?]+$/, "")}"` : ""}.`}
            </p>
            <Badge tone={stalled ? GENERATION_LINES.stalled.tone : "brand"}>{stalled ? GENERATION_LINES.stalled.label : `Round ${newest?.round ?? 0}`}</Badge>
          </div>
          {stalled ? <StopWaitingButton action={stopWaitingAction.bind(null, post.id)} /> : <p className="small app-muted" style={{ margin: 0 }}>This page updates by itself. The text below is the version the writer started from.</p>}
        </div>
      ) : null}
      {failedRegenerate ? (
        <p className="app-form-error small" role="alert">
          {GENERATION_LINES.couldNotFinish.label}: {failedRegenerate.error ?? "the regenerate stopped."} Your text is unchanged; you can regenerate again.
        </p>
      ) : null}

      {editable ? (
        <ReviewEditor
          postId={post.id}
          baseKey={current.source.kind === "version" ? current.source.version.id : current.source.draft.id}
          initial={current.text}
          checkInput={await checkInputFor(post.id)}
          siteUrl={project.siteUrl}
          issues={latest.verdict?.issues ?? []}
          asks={await placeholderAsks(current.generationId)}
          criticLabel={latest.verdict ? `${latest.verdict.model ? `${modelLabel(latest.verdict.model)} · ` : ""}round ${latest.round}` : null}
          saveAction={saveDraftAction}
          approveAction={approveAction}
          rejectAction={rejectAction}
          regenerateAction={regenerateAction}
          aside={aside}
        />
      ) : (
        <div className="app-draft-layout">
          <article className="bfm-card app-draft">
            <p className="label app-muted" style={{ margin: 0 }}>
              Excerpt
            </p>
            <p className="body" style={{ margin: 0 }}>
              {current.text.excerpt || "No excerpt."}
            </p>
            <p className="label app-muted" style={{ margin: 0 }}>
              Body · read only
            </p>
            <DraftBody markdown={current.text.body} siteUrl={project.siteUrl} />
          </article>
          <aside className="app-stack">
            {[...view.rounds].reverse().map((round) => (
              <RoundNotes key={round.round} round={round} />
            ))}
            {aside}
          </aside>
        </div>
      )}
    </>
  );
}

function PostFacts({ view }: { view: DraftView }) {
  const { spec } = view;
  return (
    <>
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
              <CostRow key={index} line={line} first={index === 0 || view.costs[index - 1].run !== line.run} total={runTotal(view, line.run)} />
            ))}
          </tbody>
        </table>
        <p className="small app-muted" style={{ margin: 0 }}>
          US dollars before VAT, at list prices checked {longDate(PRICES_CHECKED)}. Cached input is the knowledge pack read again from the cache, at a much lower price.
        </p>
      </section>
    </>
  );
}

function runTotal(view: DraftView, run: string): number {
  return view.costs.filter((line) => line.run === run).reduce((sum, line) => sum + line.costUsd, 0);
}

function CostRow({ line, first, total }: { line: DraftView["costs"][number]; first: boolean; total: number }) {
  return (
    <>
      {first ? (
        <tr className="app-cost-run">
          <th scope="rowgroup" colSpan={2}>
            {line.run}
          </th>
          <td>{formatCost(total)}</td>
        </tr>
      ) : null}
      <tr>
        <td>{line.label}</td>
        <td>
          {line.inputTokens.toLocaleString("en-GB")}, {line.cachedTokens.toLocaleString("en-GB")}, {line.outputTokens.toLocaleString("en-GB")}
        </td>
        <td>{formatCost(line.costUsd)}</td>
      </tr>
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
