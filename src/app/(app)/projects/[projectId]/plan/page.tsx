import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SlotStatus } from "@/components/CalendarParts";
import { SlotEditor } from "@/components/SlotEditor";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { getPackage } from "@/config/packages";
import { PRE_WRITING_STATUSES } from "@/config/post-status";
import { londonToday, longDate, monthOf } from "@/lib/dates";
import { listProjectPlan } from "@/lib/posts";
import { getProject } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { ensureSlots } from "@/lib/slots";
import { syncCalendarAfter } from "@/lib/calendar-hooks";

export const metadata: Metadata = { title: "Run plan" };

export default function PlanPage({ params }: PageProps<"/projects/[projectId]/plan">) {
  return (
    <Suspense fallback={<LoadingCard minHeight={320} />}>
      <PlanContent params={params} />
    </Suspense>
  );
}

// The project's slots from the earliest missed one on (γ3 orientation Q9). Batches from ticked slots
// arrive with γ4; adding and removing slots are not part of γ3.
async function PlanContent({ params }: Pick<PageProps<"/projects/[projectId]/plan">, "params">) {
  await requireUser();
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const today = londonToday();
  await ensureSlots({ projectId: project.id, today });
  // New slots and changes made by Trigger.dev tasks reach the calendar after a page is read (γ8 orientation Q2).
  syncCalendarAfter("read");
  const slots = await listProjectPlan(project.id, { today });
  const pkg = getPackage(project.package);
  const paused = project.status === "paused";

  return (
    <Card className="app-section" aria-labelledby="run-plan">
      <div>
        <h2 id="run-plan" className="heading app-section-title">
          Run plan
        </h2>
        <p className="small app-section-text">
          {paused
            ? "Paused: no planned slots. Resume it in Settings to plan again."
            : `${pkg.label} package: ${pkg.postsPerWeek} planned ${pkg.postsPerWeek === 1 ? "slot" : "slots"} a week, kept eight weeks ahead. Give each one a topic.`}
        </p>
      </div>
      {slots.length === 0 ? (
        <EmptyState
          title="No slots"
          text={paused ? "This project is paused and has no slots with a topic." : "Slots appear here as soon as the project is active."}
        />
      ) : (
        <ol className="app-plan">
          {slots.map((slot) => (
            <li key={slot.id} className="app-plan-row">
              <div className="app-plan-main">
                <span className="subheading app-plan-date">{longDate(slot.slotDate)}</span>
                <span className={slot.topic ? "body" : "body app-muted"}>{slot.topic ?? "No topic yet"}</span>
                <SlotStatus slot={slot} today={today} />
              </div>
              <details className="app-plan-edit">
                <summary className="small">
                  {slot.topic ? "Change topic or date" : "Set topic or date"}
                  <span className="app-visually-hidden">, {longDate(slot.slotDate)}</span>
                </summary>
                <SlotEditor slot={slot} today={today} canChangeTopic={PRE_WRITING_STATUSES.includes(slot.status) && !slot.batchId} />
              </details>
            </li>
          ))}
        </ol>
      )}
      <p className="small app-muted" style={{ margin: 0 }}>
        <Link href={`/calendar?month=${monthOf(today)}&project=${project.id}`}>See these slots on the calendar</Link>
      </p>
    </Card>
  );
}
