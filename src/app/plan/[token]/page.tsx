import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandMark } from "@/components/ui/Icon";
import { longDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { publicPlan } from "@/lib/plan-share";
import { RUN_STATUSES } from "@/config/run-status";
import { sendFeedbackAction } from "./actions";
import { ApprovePlan, ItemFeedback } from "./ClientForms";

export const metadata: Metadata = {
  title: { absolute: "Content plan | BrandFactory London" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ClientPlanPage({ params }: PageProps<"/plan/[token]">) {
  return (
    <main className="app-client-plan">
      <div className="app-brand app-client-brand">
        <BrandMark />
        BrandFactory London
      </div>
      <Suspense fallback={<p className="body app-muted">Loading the plan</p>}>
        <ClientPlan params={params} />
      </Suspense>
    </main>
  );
}

// The client's view of a run's plan (Phase 2 A3, orientation Q6): titles, excerpts and dates, the derived channels as
// counts, a comment box under each post and Approve plan at the end. Nothing internal: no reasons, costs, models,
// notes or statuses. An unknown, revoked or expired link gets the same page.
async function ClientPlan({ params }: Pick<PageProps<"/plan/[token]">, "params">) {
  // Always read fresh: the page is the client's live view of the plan.
  await connection();
  const { token } = await params;
  const plan = await publicPlan(token);
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host");
  if (!plan) {
    return (
      <section className="bfm-card app-client-card">
        <h1 className="title app-page-title">This link is not active</h1>
        <p className="body">Ask BrandFactory London for a new link to the plan.</p>
      </section>
    );
  }
  return (
    <>
      <header className="app-client-head">
        <p className="small app-muted" style={{ margin: 0 }}>
          {plan.clientName} · {plan.projectName}
        </p>
        <h1 className="title app-page-title">Content plan</h1>
        <p className="body" style={{ margin: 0 }}>
          {plan.items.length} blog {plan.items.length === 1 ? "post" : "posts"} from {longDate(plan.startsOn)} to {longDate(plan.endsOn)}
          {plan.derived.length ? `, plus ${plan.derived.map((item) => `${item.count} ${item.label.toLowerCase()}${item.count === 1 ? "" : "s"}`).join(", ")}` : ""}.
        </p>
        {plan.open && !plan.approvedAt ? (
          <p className="small app-muted app-client-hint" style={{ margin: 0 }}>
            Comment on any post or suggest a change, then approve the plan at the end.
          </p>
        ) : null}
      </header>
      <ol className="app-client-items">
        {plan.items.map((item) => (
          <li key={item.id} className="bfm-card app-client-item">
            <p className="small app-muted" style={{ margin: 0 }}>
              {longDate(item.date)}
            </p>
            <h2 className="heading" style={{ margin: 0 }}>
              {item.title}
            </h2>
            <p className="body" style={{ margin: 0 }}>
              {item.excerpt}
            </p>
            {plan.open ? <ItemFeedback action={sendFeedbackAction.bind(null, token, item.id)} title={item.title} /> : null}
          </li>
        ))}
      </ol>
      <section className="bfm-card app-client-card" aria-labelledby="approve-heading">
        <h2 id="approve-heading" className="heading" style={{ margin: 0 }}>
          {plan.approvedAt ? RUN_STATUSES.find((item) => item.key === "plan_approved")!.label : "Approve the plan"}
        </h2>
        {plan.approvedAt ? (
          <p className="body" style={{ margin: 0 }}>
            Approved by {plan.approvedBy} on {formatDate(plan.approvedAt)}. Thank you.
          </p>
        ) : plan.open ? (
          <>
            <p className="body" style={{ margin: 0 }}>
              Happy with the plan? Approve it here. You can still comment on a post afterwards.
            </p>
            <ApprovePlan action={sendFeedbackAction.bind(null, token, null)} />
          </>
        ) : (
          <p className="body" style={{ margin: 0 }}>
            This plan is final. Contact BrandFactory London with any changes.
          </p>
        )}
      </section>
      <footer className="small app-muted app-client-foot">
        <p style={{ margin: 0 }}>Prepared by BrandFactory London. This link works until {formatDate(plan.expiresAt)}.</p>
        <p className="app-print-only" style={{ margin: 0 }}>
          Printed {formatDate(new Date())}{host ? ` from https://${host}/plan/${token}` : ""}.
        </p>
      </footer>
    </>
  );
}
