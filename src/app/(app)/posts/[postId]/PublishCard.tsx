import { AutoRefresh } from "@/components/AutoRefresh";
import { Badge } from "@/components/ui/Badge";
import { getPostStatus, PUBLISH_LINES, type PostStatus } from "@/config/post-status";
import { formatDateTime } from "@/lib/format";
import { isStaleCheck, isStalePublish, listPublishEvents, publishPlan, type Publication } from "@/lib/publish";
import { PUBLISH_STEP_LABELS } from "@/lib/publish-steps";
import { checkAgainAction, publishAction } from "./actions";
import { CheckAgainButton, PublishButton } from "./PublishButtons";

const thumb = (projectId: string, fileId: string) => `/api/drive/thumbnail/${encodeURIComponent(fileId)}?project=${projectId}&size=320`;

// Wix's messages do not always end with a full stop.
function sentence(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

// The prototype's Publish card (Publish.dc.html), for approved and published posts: what will be sent, Publish post,
// the steps and any failure, the live check, and the live link (design decisions 18, 19).
export async function PublishCard({ postId, projectId, status, publication, clientName }: { postId: string; projectId: string; status: PostStatus; publication: Publication | null; clientName: string }) {
  const plan = await publishPlan(postId);
  if (!plan) return null;
  const events = publication ? await listPublishEvents(publication.id) : [];
  const stalled = publication ? isStalePublish(publication) : false;
  const checkStalled = publication ? isStaleCheck(publication) : false;
  const state = publication?.state ?? null;
  const badge =
    status === "published"
      ? getPostStatus("published")
      : state === "running" && !stalled
        ? PUBLISH_LINES.publishing
        : state === "checking" && !checkStalled
          ? PUBLISH_LINES.checking
          : state === "not_confirmed" || (state === "checking" && checkStalled)
            ? PUBLISH_LINES.notConfirmed
            : state === "failed" || stalled
              ? PUBLISH_LINES.failed
              : getPostStatus("approved");
  const working = (state === "running" && !stalled) || (state === "checking" && !checkStalled);
  const canPublish = status === "approved" && (!publication || state === "failed" || stalled);
  const blogName = `the ${clientName} blog`;

  return (
    <section className={`bfm-card app-stack ${working ? "bfm-aurora bfm-aurora-active" : ""}`} aria-labelledby="publish-heading">
      <AutoRefresh active={working} />
      <div className="app-card-head">
        <h2 id="publish-heading" className="heading" style={{ margin: 0 }}>
          Publish
        </h2>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      {status === "published" && publication?.liveUrl ? (
        <div className="app-publish-live">
          <p className="body" style={{ margin: 0 }}>
            Live at{" "}
            <a href={publication.liveUrl} target="_blank" rel="noreferrer">
              {displayUrl(publication.liveUrl)}
            </a>
          </p>
          {publication.confirmedAt ? <span className="small app-muted">Confirmed {formatDateTime(publication.confirmedAt)}</span> : null}
        </div>
      ) : null}

      {(state === "failed" || stalled) && publication ? (
        <p className="small app-form-error" role="alert" style={{ margin: 0 }}>
          {stalled ? "The last publish stopped reporting." : `${PUBLISH_LINES.failed.label} at the ${PUBLISH_STEP_LABELS[publication.step ?? "cover"].toLowerCase()} step: ${sentence(publication.error ?? "no message")}`} Try again resumes from that step; nothing
          already on Wix is created twice.
        </p>
      ) : null}

      {canPublish ? (
        <>
          <p className="body" style={{ margin: 0 }}>
            Goes to {blogName} on Wix{plan.pillar ? ` with the ${plan.pillar.label} tag` : ""}, your chosen cover photo and the excerpt as its meta description.
          </p>
          <dl className="app-facts small app-publish-facts">
            <dt>Address</dt>
            <dd>{plan.plannedUrl ? displayUrl(plan.plannedUrl) : "No slug yet"}</dd>
            <dt>Pillar tag</dt>
            <dd>{plan.pillar ? `${plan.pillar.label} (${plan.pillar.slug})` : "None"}</dd>
            <dt>Author</dt>
            <dd>{plan.author ?? "Not chosen"}</dd>
            <dt>Meta description</dt>
            <dd>{plan.excerpt || "No excerpt"}</dd>
            <dt>Cover</dt>
            <dd>
              {plan.cover ? (
                <span className="app-publish-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private Drive thumbnail served by the app's own route */}
                  <img src={thumb(projectId, plan.cover.driveFileId)} alt="" width={96} height={64} />
                  <span>
                    {plan.cover.name}
                    {plan.cover.path ? <span className="app-muted"> in {plan.cover.path}</span> : null}
                  </span>
                </span>
              ) : (
                "None chosen"
              )}
            </dd>
          </dl>
          {plan.problems.length > 0 ? (
            <div className="app-stack" role="alert">
              <p className="small" style={{ margin: 0 }}>
                <strong>Before this can be published:</strong>
              </p>
              <ul className="app-plain-list small app-form-error">
                {plan.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <p className="small app-muted" style={{ margin: 0 }}>
                Publishing makes this post public on {blogName}. The app marks it Published only once the live page shows it.
              </p>
              <PublishButton action={publishAction.bind(null, postId)} blogName={blogName} label={publication ? "Try again" : "Publish post"} />
            </>
          )}
        </>
      ) : null}

      {state === "checking" && !checkStalled ? (
        <p className="body" role="status" style={{ margin: 0 }}>
          Wix accepted the post. Looking for it at{" "}
          <a href={publication!.liveUrl!} target="_blank" rel="noreferrer">
            {displayUrl(publication!.liveUrl!)}
          </a>
          . The blog refreshes from Wix every minute, so this can take a few minutes. You can leave this page.
        </p>
      ) : null}

      {status !== "published" && (state === "not_confirmed" || (state === "checking" && checkStalled)) ? (
        <div className="app-stack">
          <p className="body" role="status" style={{ margin: 0 }}>
            {publication?.error ?? "Wix accepted this post, but the live check stopped before it confirmed the page."}{" "}
            {publication?.liveUrl ? (
              <a href={publication.liveUrl} target="_blank" rel="noreferrer">
                Open {displayUrl(publication.liveUrl)}
              </a>
            ) : null}
          </p>
          <CheckAgainButton action={checkAgainAction.bind(null, postId)} />
        </div>
      ) : null}

      {events.length > 0 ? (
        <details className="small">
          <summary>Publishing steps ({events.length})</summary>
          <ol className="app-plain-list app-publish-steps">
            {events.map((event) => (
              <li key={event.id}>
                <Badge tone={event.result === "ok" ? "success" : "danger"}>{PUBLISH_STEP_LABELS[event.step]}</Badge> {event.message}
                {event.requestId ? <span className="app-muted"> (Wix request {event.requestId})</span> : null}
                <span className="app-muted"> · {formatDateTime(event.createdAt)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
