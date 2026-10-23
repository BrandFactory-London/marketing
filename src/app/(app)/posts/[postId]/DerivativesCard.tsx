import { AutoRefresh } from "@/components/AutoRefresh";
import { loadPack } from "@/lib/ai/pack";
import { parseBannedPhrases } from "@/lib/checks";
import { derivativeLink, derivativeViews, isStaleDerivative } from "@/lib/derivatives";
import { generateDerivativeAction, saveDerivativeAction } from "./actions";
import { DerivativePanel } from "./DerivativePanel";

// The prototype's Derivatives section (Publish.dc.html): GMB and LinkedIn copy from the approved post, to post by hand
// (design decision 20, γ6 orientation Q6).
export async function DerivativesCard({ postId, projectId, siteUrl, post }: { postId: string; projectId: string; siteUrl: string; post: { liveUrl: string | null; slug: string | null } }) {
  const [views, pack] = await Promise.all([derivativeViews(postId), loadPack(projectId)]);
  const postUrl = derivativeLink(post, siteUrl);
  const bannedPhrases = parseBannedPhrases(pack.agency?.banned_phrases ?? "");
  const writing = views.some((view) => view.latest?.status === "writing" && !isStaleDerivative(view.latest));
  return (
    <section className="bfm-card app-stack" aria-labelledby="derivatives-heading">
      <AutoRefresh active={writing} />
      <div>
        <h2 id="derivatives-heading" className="heading" style={{ margin: 0 }}>
          Derivatives
        </h2>
        <p className="small app-muted" style={{ margin: "4px 0 0" }}>
          Shorter versions of this post, written in the same voice. Copy them to post by hand.
          {post.liveUrl ? "" : " They link to where the post will be; it goes live when you publish."} About $0.02 to $0.08 each.
        </p>
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
                      body: view.latest.body,
                      error: view.latest.error,
                      stale: isStaleDerivative(view.latest),
                    }
                  : null
              }
              postUrl={postUrl}
              bannedPhrases={bannedPhrases}
              generateAction={generateDerivativeAction.bind(null, postId, view.channel)}
              saveAction={saveDerivativeAction.bind(null, postId, view.channel)}
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
