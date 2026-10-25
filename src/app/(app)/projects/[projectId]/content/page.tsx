import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { formatDate } from "@/lib/format";
import { listPublishedPosts } from "@/lib/posts";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Content and performance" };

export default function ContentPage({ params }: PageProps<"/projects/[projectId]/content">) {
  return (
    <Suspense fallback={<LoadingCard minHeight={240} />}>
      <ContentList params={params} />
    </Suspense>
  );
}

// Content and performance (Phase 2 A2): what is real today, the published posts and their live links. Search Console
// and GA4 figures arrive with session B; nothing here is a placeholder figure.
async function ContentList({ params }: Pick<PageProps<"/projects/[projectId]/content">, "params">) {
  await requireUser();
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const published = await listPublishedPosts(project.id);

  return (
    <Card className="app-section" aria-labelledby="published-heading">
      <div>
        <h2 id="published-heading" className="heading app-section-title">
          Published posts
        </h2>
        <p className="small app-section-text">Search Console and GA4 figures for each post arrive in a later release.</p>
      </div>
      {published.length === 0 ? (
        <EmptyState title="Nothing published yet" text="Posts appear here once they are live on the site." />
      ) : (
        <div className="app-table-wrap">
          <table className="small app-table">
            <caption className="app-visually-hidden">Published posts</caption>
            <thead>
              <tr>
                <th className="label">Post</th>
                <th className="label">Date</th>
                <th className="label">Live page</th>
              </tr>
            </thead>
            <tbody>
              {published.map((post) => (
                <tr key={post.id}>
                  <td className="app-table-name" data-label="Post">
                    <Link href={`/posts/${post.id}`}>{post.topic ?? "Untitled post"}</Link>
                  </td>
                  <td className="app-muted" data-label="Date">
                    {formatDate(post.publishedAt ?? post.slotDate)}
                  </td>
                  <td data-label="Live page">
                    {post.liveUrl ? (
                      <a href={post.liveUrl} target="_blank" rel="noreferrer">
                        {post.liveUrl.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    ) : (
                      <span className="app-muted">No live link recorded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
