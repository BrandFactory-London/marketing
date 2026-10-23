import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SlotStatus } from "@/components/CalendarParts";
import { SlotEditor } from "@/components/SlotEditor";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { CONTENT_TYPES, CONTENT_TYPE_KEYS } from "@/config/content-types";
import { MODELS } from "@/config/models";
import { isMissed, PRE_WRITING_STATUSES } from "@/config/post-status";
import { presetLabel, RUN_MONTHS, type RunPresetKey } from "@/config/run-presets";
import { derivedSlotLine, OUTSIDE_RUN, runStatusInfo } from "@/config/run-status";
import { runEnd } from "@/lib/cadence";
import { syncCalendarAfter } from "@/lib/calendar-hooks";
import { londonToday, longDate, monthOf } from "@/lib/dates";
import { getProject } from "@/lib/projects";
import { presetConfiguration } from "@/lib/run-config";
import { adoptOrphanSlots, currentRun, listProjectRuns, orphanSlots, runFormDefaults, runSlots, suggestedStart, type Run, type RunChannel } from "@/lib/runs";
import { requireUser } from "@/lib/session";
import { saveRunAction } from "./actions";
import { DeleteRunButton, DerivedMoveForm, RunFormToggle } from "./RunControls";
import type { RunFormValues } from "./RunForm";

export const metadata: Metadata = { title: "Run plan" };

export default function PlanPage({ params, searchParams }: PageProps<"/projects/[projectId]/plan">) {
  return (
    <Suspense fallback={<LoadingCard minHeight={320} />}>
      <PlanContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const MODEL_OPTIONS = MODELS.map((model) => ({ value: model.id, label: model.label }));

function channelSummary(channels: readonly RunChannel[]): string {
  const parts = channels.filter((channel) => channel.amount > 0).map((channel) => `${channel.amount} ${CONTENT_TYPES[channel.contentType].short}`);
  return parts.length ? parts.join(", ") : "No slots";
}

function formValues(run: Run & { channels: RunChannel[] }): RunFormValues {
  const months = RUN_MONTHS.find((count) => runEnd(run.startsOn, count) === run.endsOn) ?? 3;
  return {
    preset: run.preset as RunPresetKey,
    startsOn: run.startsOn,
    months,
    priorityNotes: run.priorityNotes ?? "",
    channels: CONTENT_TYPE_KEYS.map((type) => {
      const saved = run.channels.find((channel) => channel.contentType === type);
      return saved ? { contentType: type, amount: saved.amount, cadence: saved.cadence } : { contentType: type, amount: 0, cadence: type === "seo" ? { weekdays: [2] } : { after: 1 } };
    }),
    lengthMin: run.lengthMin,
    lengthMax: run.lengthMax,
    cta: run.cta ?? "",
    faqMode: run.faqMode,
    writerModel: run.writerModel,
    criticModel: run.criticModel,
  };
}

// The Run plan tab (Phase 2 A1): the project's run, its SEO slots in date order with each one's derived slots under it,
// the runs before and after it, and the form for the next run.
async function PlanContent({ params, searchParams }: Pick<PageProps<"/projects/[projectId]/plan">, "params" | "searchParams">) {
  await requireUser();
  const { projectId } = await params;
  const { run: wanted } = await searchParams;
  const project = await getProject(projectId);
  if (!project) notFound();
  const today = londonToday();
  await adoptOrphanSlots({ projectId: project.id });
  // New slots and changes made by Trigger.dev tasks reach the calendar after a page is read (γ8 orientation Q2).
  syncCalendarAfter("read");
  const runs = await listProjectRuns(project.id);
  const run = runs.find((item) => item.id === wanted) ?? currentRun(runs, today);
  const [slots, orphans, defaults] = await Promise.all([run ? runSlots(run.id) : [], orphanSlots(project.id), runFormDefaults()]);

  const nextStart = suggestedStart(runs, today);
  const nextPreset: RunPresetKey = (runs.at(-1)?.preset as RunPresetKey | undefined) ?? "mid";
  const nextValues: RunFormValues = {
    preset: nextPreset,
    startsOn: nextStart,
    months: 3,
    priorityNotes: "",
    channels: presetConfiguration(nextPreset, nextStart, 3),
    lengthMin: run?.lengthMin ?? 1200,
    lengthMax: run?.lengthMax ?? 1600,
    cta: "",
    faqMode: run?.faqMode ?? "useful",
    writerModel: run?.writerModel ?? defaults.writerModel,
    criticModel: run?.criticModel ?? defaults.criticModel,
  };

  // Long imported runs keep their published past out of the way: from the earliest missed slot on.
  const shown = slots.filter(({ post, derived }) => post.slotDate >= today || isMissed(post.status, post.slotDate, today) || derived.some((slot) => slot.slotDate >= today));
  const earlier = slots.length - shown.length;
  const status = run ? runStatusInfo(run.status, run.endsOn, today) : null;

  return (
    <div className="app-stack">
      {run && status ? (
        <Card className="app-section" aria-labelledby="run-plan">
          <div className="app-run-head">
            <div>
              <h2 id="run-plan" className="heading app-section-title">
                {run.name}
              </h2>
              <p className="small app-section-text">
                {longDate(run.startsOn)} to {longDate(run.endsOn)} · {presetLabel(run.preset as RunPresetKey)} · {channelSummary(run.channels)}
              </p>
            </div>
            <Badge tone={status.tone as BadgeTone}>{status.label}</Badge>
          </div>
          {run.priorityNotes ? <p className="body" style={{ margin: 0 }}>{run.priorityNotes}</p> : null}
          {run.imported ? (
            <p className="small app-muted" style={{ margin: 0 }}>
              Made from the Phase 1 slots. Change its slots one by one below.
            </p>
          ) : run.endsOn >= today ? (
            <div className="app-run-actions">
              <RunFormToggle openLabel="Edit run" submitLabel="Save run" initial={formValues(run)} today={today} models={MODEL_OPTIONS} action={saveRunAction.bind(null, project.id, run.id)} />
              {run.status === "setting_up" ? <DeleteRunButton runId={run.id} name={run.name} /> : null}
            </div>
          ) : null}

          {shown.length === 0 ? (
            <EmptyState title="No slots ahead" text={slots.length ? "Every slot in this run is in the past." : "This run has no slots."} />
          ) : (
            <ol className="app-plan">
              {shown.map(({ post, derived }, index) => (
                <li key={post.id} className="app-plan-row">
                  <div className="app-plan-main">
                    <span className="subheading app-plan-date">{longDate(post.slotDate)}</span>
                    <span className={post.topic ? "body" : "body app-muted"}>
                      <span className="small app-muted">SEO post {earlier + index + 1}: </span>
                      {post.topic ?? "No topic yet"}
                    </span>
                    <SlotStatus slot={post} today={today} />
                  </div>
                  <details className="app-plan-edit">
                    <summary className="small">
                      {post.topic ? "Change topic or date" : "Set topic or date"}
                      <span className="app-visually-hidden">, {longDate(post.slotDate)}</span>
                    </summary>
                    <SlotEditor slot={post} today={today} canChangeTopic={PRE_WRITING_STATUSES.includes(post.status) && !post.batchId} />
                  </details>
                  {derived.length ? (
                    <ul className="app-plan-derived">
                      {derived.map((slot) => {
                        const line = derivedSlotLine(slot.versionStatus, slot.slotDate, today);
                        const type = CONTENT_TYPES[slot.contentType];
                        return (
                          <li key={slot.id} className="app-plan-derived-row">
                            <div className="app-plan-main">
                              <span className="small app-plan-date">{longDate(slot.slotDate)}</span>
                              <span className="body">{type.label}</span>
                              <Badge tone={line.tone}>{line.label}</Badge>
                            </div>
                            {slot.slotDate >= today ? (
                              <details className="app-plan-edit">
                                <summary className="small">
                                  Move date<span className="app-visually-hidden">, {type.label} on {longDate(slot.slotDate)}</span>
                                </summary>
                                <DerivedMoveForm
                                  slotId={slot.id}
                                  slotDate={slot.slotDate}
                                  min={post.slotDate > today ? post.slotDate : today}
                                  max={run.endsOn}
                                  label={type.label}
                                />
                              </details>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          {earlier ? (
            <p className="small app-muted" style={{ margin: 0 }}>
              {earlier} earlier {earlier === 1 ? "slot is" : "slots are"} done and not shown.
            </p>
          ) : null}
          <p className="small app-muted" style={{ margin: 0 }}>
            <Link href={`/calendar?month=${monthOf(today)}&project=${project.id}`}>See these slots on the calendar</Link>
          </p>
        </Card>
      ) : (
        <Card className="app-section" aria-labelledby="run-plan">
          <h2 id="run-plan" className="heading app-section-title">
            Run plan
          </h2>
          <EmptyState title="No run set up" text="Set up a run below. Its slots appear on the calendar once it is saved." />
        </Card>
      )}

      {orphans.length ? (
        <Card className="app-section" aria-labelledby="outside-run">
          <div className="app-run-head">
            <h2 id="outside-run" className="heading app-section-title">
              {OUTSIDE_RUN.label}
            </h2>
            <Badge tone={OUTSIDE_RUN.tone}>{orphans.length}</Badge>
          </div>
          <p className="small app-section-text">These posts started before any run covered their date. Move each into a run, or leave it where it is.</p>
          <ol className="app-plan">
            {orphans.map((post) => (
              <li key={post.id} className="app-plan-row">
                <div className="app-plan-main">
                  <span className="subheading app-plan-date">{longDate(post.slotDate)}</span>
                  <span className={post.topic ? "body" : "body app-muted"}>{post.topic ?? "No topic yet"}</span>
                  <SlotStatus slot={post} today={today} />
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Card className="app-section" aria-labelledby="all-runs">
        <h2 id="all-runs" className="heading app-section-title">
          Runs
        </h2>
        {runs.length ? (
          <ul className="app-run-list">
            {runs.map((item) => {
              const info = runStatusInfo(item.status, item.endsOn, today);
              return (
                <li key={item.id}>
                  {item.id === run?.id ? (
                    <span className="body" aria-current="page">
                      <strong>{item.name}</strong>
                    </span>
                  ) : (
                    <Link className="body" href={`/projects/${project.id}/plan?run=${item.id}`}>
                      {item.name}
                    </Link>
                  )}
                  <span className="small app-muted">
                    {longDate(item.startsOn)} to {longDate(item.endsOn)} · {channelSummary(item.channels)}
                  </span>
                  <Badge tone={info.tone as BadgeTone}>{info.label}</Badge>
                </li>
              );
            })}
          </ul>
        ) : null}
        <RunFormToggle
          openLabel={runs.length ? "Set up the next run" : "Set up a run"}
          submitLabel="Create run"
          variant={runs.length ? "secondary" : "primary"}
          initial={nextValues}
          today={today}
          models={MODEL_OPTIONS}
          action={saveRunAction.bind(null, project.id, null)}
        />
      </Card>
    </div>
  );
}
