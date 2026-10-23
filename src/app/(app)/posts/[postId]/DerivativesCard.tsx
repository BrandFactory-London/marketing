import { AutoRefresh } from "@/components/AutoRefresh";
import { loadPack } from "@/lib/ai/pack";
import { parseBannedPhrases } from "@/lib/checks";
import { derivativeLink, derivativeViews, isStaleDerivative } from "@/lib/derivatives";
import { copyDerivativeAction, generateAllDerivativesAction, generateDerivativeAction, saveDerivativeAction } from "./actions";
import { DerivativePanel } from "./DerivativePanel";
import { GenerateAllButton } from "./GenerateAllButton";

// The prototype's Derivatives section (Publish.dc.html): GBP, LinkedIn, Facebook and Pinterest copy from the approved
// post, to post by hand (design decision 20, γ6 orientation Q6, γ7 orientation Q5).
export async function DerivativesCard({
  postId,
  projectId,
  siteUrl,
  post,
  cover,
}: {
  postId: string;
  projectId: string;
  siteUrl: string;
  post: { liveUrl: string | null; slug: string | null };
  cover: { fileId: string; name: string } | null;
}) {
  const [views, pack] = await Promise.all([derivativeViews(postId), loadPack(projectId)]);
  const postUrl = derivativeLink(post, siteUrl);
  const bannedPhrases = parseBannedPhrases(pack.agency?.banned_phrases ?? "");
  const writing = views.some((view) => view.latest?.status === "writing" && !isStaleDerivative(view.latest));
  const missing = views.filter((view) => !view.latest).length;
  const pinCover = cover ? { src: `/api/drive/thumbnail/${encodeURIComponent(cover.fileId)}?project=${projectId}&size=320`, name: cover.name } : null;
  return (
    <section className="bfm-card app-stack" aria-labelledby="derivatives-heading">
      <AutoRefresh active={writing} />
      <div className="app-card-head">
        <div>
          <h2 id="derivatives-heading" className="heading" style={{ margin: 0 }}>
            Derivatives
          </h2>
          <p className="small app-muted" style={{ margin: "4px 0 0" }}>
            Shorter versions of this post, written in the same voice. Copy them to post by hand.
            {post.liveUrl ? "" : " They link to where the post will be; it goes live when you publish."} About $0.02 to $0.08 each.
          </p>
        </div>
        {postUrl && missing > 0 ? <GenerateAllButton missing={missing} total={views.length} action={generateAllDerivativesAction.bind(null, postId)} /> : null}
      </div>
      {postUrl ? (
        <div className="app-derivatives">
          {views.map((view) => (
            <DerivativePanel
              key={view.channel}
              channel={view.channel}
              versions={view.versions}
              latest={
                view.latest
                  ? {
                      id: view.latest.id,
                      version: view.latest.version,
                      status: view.latest.status,
                      source: view.latest.source,
                      title: view.latest.title,
                      body: view.latest.body,
                      error: view.latest.error,
                      stale: isStaleDerivative(view.latest),
                    }
                  : null
              }
              postUrl={postUrl}
              bannedPhrases={bannedPhrases}
              cover={view.channel === "pinterest" ? pinCover : undefined}
              generateAction={generateDerivativeAction.bind(null, postId, view.channel)}
              saveAction={saveDerivativeAction.bind(null, postId, view.channel)}
              copyAction={copyDerivativeAction.bind(null, postId, view.channel)}
            />
          ))}
        </div>
      ) : (
        <p className="body" style={{ margin: 0 }}>
          Save a slug in Publishing details first, so the copy can link to the post.
        </p>
      )}
    </section>
  );
}
