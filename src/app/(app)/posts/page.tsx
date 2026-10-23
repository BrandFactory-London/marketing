import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SlotStatus } from "@/components/CalendarParts";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { DRAFTED_STATUSES, isPostStatus, POST_STATUSES } from "@/config/post-status";
import { listClients } from "@/lib/clients";
import { londonToday, longDate, monthOf } from "@/lib/dates";
import { listStartedPosts } from "@/lib/posts";
import { requireUser } from "@/lib/session";
import { isUuid } from "@/lib/validation";
import { ClientFilter } from "./ClientFilter";
import { syncCalendarAfter } from "@/lib/calendar-hooks";

export const metadata: Metadata = { title: "Posts" };

const EYEBROW = "Every post with a topic, across all clients and projects. Planned slots live in the calendar.";

export default function PostsPage({ searchParams }: PageProps<"/posts">) {
  return (
    <>
      <PageHeader
        eyebrow={EYEBROW}
        title="Posts"
        actions={
          <ButtonLink variant="secondary" href="/calendar">
            Open calendar
          </ButtonLink>
        }
      />
      <Suspense fallback={<LoadingCard minHeight={320} />}>
        <PostsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function postsHref(params: { status?: string; client?: string }) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.client) query.set("client", params.client);
  const text = query.toString();
  return text ? `/posts?${text}` : "/posts";
}

// γ3 orientation Q10: words, links and views columns wait until they are real (γ4, γ5, Phase 2).
async function PostsContent({ searchParams }: Pick<PageProps<"/posts">, "searchParams">) {
  await requireUser();
  // New slots and changes made by Trigger.dev tasks reach the calendar after a page is read (γ8 orientation Q2).
  syncCalendarAfter("read");
  const query = await searchParams;
  const client = typeof query.client === "string" && isUuid(query.client) ? query.client : undefined;
  const status = isPostStatus(query.status) ? query.status : undefined;
  const today = londonToday();
  const [all, clients] = await Promise.all([listStartedPosts({ clientId: client }), listClients()]);
  const present = POST_STATUSES.filter((item) => all.some((post) => post.status === item.key));
  const shown = status ? all.filter((post) => post.status === status) : all;

  return (
    <>
      <div className="app-section-header">
        <nav className="app-row" aria-label="Filter by status">
          <ButtonLink size="sm" variant={status ? "secondary" : "primary"} href={postsHref({ client })} current={!status}>
            All
          </ButtonLink>
          {present.map((item) => (
            <ButtonLink
              key={item.key}
              size="sm"
              variant={status === item.key ? "primary" : "secondary"}
              href={postsHref({ status: item.key, client })}
              current={status === item.key}
            >
              {item.label}
            </ButtonLink>
          ))}
        </nav>
        <ClientFilter status={status} client={client} clients={clients.map(({ id, name }) => ({ id, name }))} />
      </div>
      {shown.length === 0 ? (
        <EmptyState
          title="No posts yet"
          text={all.length === 0 ? "Set a topic on a calendar slot and the post appears here." : "No posts match this filter."}
        />
      ) : (
        <Card className="app-section" aria-label="Posts">
          <div className="app-table-wrap">
            <table className="body app-table">
              <caption className="app-visually-hidden">Posts</caption>
              <thead>
                <tr>
                  <th className="label">Post</th>
                  <th className="label">Client / project</th>
                  <th className="label">Date</th>
                  <th className="label">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((post) => (
                  <tr key={post.id}>
                    <td data-label="Post">
                      <Link
                        href={DRAFTED_STATUSES.includes(post.status) ? `/posts/${post.id}` : `/calendar?month=${monthOf(post.slotDate)}&slot=${post.id}`}
                        className="app-table-name"
                      >
                        {post.topic}
                      </Link>
                    </td>
                    <td data-label="Client / project">
                      {post.clientName}
                      <br />
                      <span className="small app-muted">{post.projectName}</span>
                    </td>
                    <td data-label="Date">{longDate(post.slotDate)}</td>
                    <td data-label="Status">
                      <SlotStatus slot={post} today={today} />
                      {post.liveUrl ? (
                        <>
                          <br />
                          <a href={post.liveUrl} target="_blank" rel="noreferrer" className="small">
                            View live post
                          </a>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
