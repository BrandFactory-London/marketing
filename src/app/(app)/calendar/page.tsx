import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarAgenda, CalendarGrid, CalendarLegend, SlotStatus } from "@/components/CalendarParts";
import { SlotEditor } from "@/components/SlotEditor";
import { ButtonLink } from "@/components/ui/Button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { PRE_WRITING_STATUSES } from "@/config/post-status";
import { isMonth, londonToday, longDate, monthGrid, monthLabel, monthOf, shiftMonth } from "@/lib/dates";
import { getSlot, listSlotsBetween, type SlotView } from "@/lib/posts";
import { listProjects } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { ensureSlots } from "@/lib/slots";
import { isUuid } from "@/lib/validation";
import { ProjectFilter } from "./ProjectFilter";

export const metadata: Metadata = { title: "Calendar" };

const EYEBROW = "Every post across all projects. Select a slot to set its topic or move it.";

export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader eyebrow={EYEBROW} title="BrandFactory calendar" />
          <LoadingCard minHeight={480} />
        </>
      }
    >
      <CalendarContent searchParams={searchParams} />
    </Suspense>
  );
}

function calendarHref(params: { month: string; project?: string; slot?: string }) {
  const query = new URLSearchParams({ month: params.month });
  if (params.project) query.set("project", params.project);
  if (params.slot) query.set("slot", params.slot);
  return `/calendar?${query}`;
}

async function CalendarContent({ searchParams }: Pick<PageProps<"/calendar">, "searchParams">) {
  await requireUser();
  const query = await searchParams;
  const today = londonToday();
  const month = isMonth(query.month) ? query.month : monthOf(today);
  const project = typeof query.project === "string" && isUuid(query.project) ? query.project : undefined;
  const slotId = typeof query.slot === "string" ? query.slot : undefined;

  await ensureSlots({ today });
  const weeks = monthGrid(month);
  const [slots, projects, selected] = await Promise.all([
    listSlotsBetween(weeks[0][0], weeks[5][6], { projectId: project }),
    listProjects(),
    slotId ? getSlot(slotId) : Promise.resolve(null),
  ]);
  const inMonth = slots.filter((slot) => slot.slotDate.startsWith(month));
  const showProject = !project && projects.length > 1;
  const hrefFor = (slot: SlotView) => calendarHref({ month, project, slot: slot.id });

  return (
    <>
      <PageHeader
        eyebrow={EYEBROW}
        title="BrandFactory calendar"
        actions={
          <div className="app-row app-cal-controls">
            <ButtonLink href={project ? `/batches/new?project=${project}` : "/batches/new"}>Generate from planned slots</ButtonLink>
            <ProjectFilter month={month} project={project} projects={projects.map(({ id, name }) => ({ id, name }))} />
            <div className="app-cal-nav">
              <ButtonLink variant="secondary" href={calendarHref({ month: shiftMonth(month, -1), project })}>
                <span aria-hidden="true">‹</span>
                <span className="app-visually-hidden">Previous month</span>
              </ButtonLink>
              <span className="subheading app-cal-month" aria-live="polite">
                {monthLabel(month)}
              </span>
              <ButtonLink variant="secondary" href={calendarHref({ month: shiftMonth(month, 1), project })}>
                <span aria-hidden="true">›</span>
                <span className="app-visually-hidden">Next month</span>
              </ButtonLink>
            </div>
          </div>
        }
      />
      {month !== monthOf(today) ? (
        <p className="small" style={{ margin: 0 }}>
          <Link href={calendarHref({ month: monthOf(today), project })}>Back to this month</Link>
        </p>
      ) : null}
      <CalendarLegend slots={inMonth} today={today} />
      <div className="app-cal-layout">
        <section className="bfm-card app-cal-card" aria-label={`Calendar for ${monthLabel(month)}`}>
          <div className="app-cal-wide">
            <CalendarGrid weeks={weeks} slots={slots} today={today} hrefFor={hrefFor} showProject={showProject} selectedId={selected?.id} month={month} />
          </div>
          <div className="app-cal-narrow">
            <CalendarAgenda
              slots={inMonth}
              today={today}
              hrefFor={hrefFor}
              showProject={showProject}
              selectedId={selected?.id}
              empty={projects.length === 0 ? "No projects yet. Add one to get planned slots." : "Nothing planned this month."}
            />
          </div>
        </section>
        <SlotPanel slot={selected} today={today} closeHref={calendarHref({ month, project })} project={project} />
      </div>
    </>
  );
}

// The prototype's side panel: an empty slot takes a topic; any slot can move (γ3 orientation Q7).
function SlotPanel({ slot, today, closeHref, project }: { slot: SlotView | null; today: string; closeHref: string; project?: string }) {
  if (!slot) {
    return (
      <aside className="bfm-card app-cal-panel" aria-label="Selected slot">
        <p className="subheading" style={{ margin: 0 }}>
          Select a slot
        </p>
        <p className="small app-muted" style={{ margin: 0 }}>
          Its details, topic and date appear here.
        </p>
      </aside>
    );
  }
  return (
    <aside className="bfm-card bfm-reveal app-cal-panel" aria-label="Selected slot">
      <div className="app-card-head">
        <SlotStatus slot={slot} today={today} />
        <Link href={closeHref} scroll={false} className="small">
          Close
        </Link>
      </div>
      <h2 className="heading" style={{ margin: 0 }}>
        {slot.topic ?? "No topic yet"}
      </h2>
      <dl className="app-facts small">
        <dt>Date</dt>
        <dd>{longDate(slot.slotDate)}</dd>
        <dt>Project</dt>
        <dd>
          <Link href={`/projects/${slot.projectId}/plan`}>{slot.projectName}</Link>
        </dd>
        <dt>Client</dt>
        <dd>{slot.clientName}</dd>
      </dl>
      {slot.batchId ? (
        <ButtonLink href={`/batches/${slot.batchId}`}>Open batch</ButtonLink>
      ) : slot.status === "topic_set" ? (
        <ButtonLink href={`/batches/new?project=${slot.projectId}&post=${slot.id}`}>Generate post</ButtonLink>
      ) : null}
      <SlotEditor
        key={slot.id}
        slot={slot}
        today={today}
        canChangeTopic={PRE_WRITING_STATUSES.includes(slot.status) && !slot.batchId}
        calendar={{ project }}
      />
    </aside>
  );
}
