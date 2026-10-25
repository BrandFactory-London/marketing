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
import { derivedSlotLine, GENERATION_LINES, generatesOnLabel, nextGenerationLine, OUTSIDE_RUN, PLAN_LINES, runStatusInfo } from "@/config/run-status";
import { batchesInFlight } from "@/lib/batch-generation";
import { generatesOn } from "@/lib/fortnight";
import { runEnd } from "@/lib/cadence";
import { syncCalendarAfter } from "@/lib/calendar-hooks";
import { londonToday, longDate, monthOf } from "@/lib/dates";
import { getProject } from "@/lib/projects";
import { presetConfiguration } from "@/lib/run-config";
import { adoptOrphanSlots, currentRun, listProjectRuns, orphanSlots, runFormDefaults, runSlots, suggestedStart, type Run, type RunChannel } from "@/lib/runs";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { clientFeedback, markSeen, shareState, type ClientFeedback } from "@/lib/plan-share";
import { planView, type PlanView } from "@/lib/planner";
import { saveRunAction } from "./actions";
import { activateRunAction, approvePlanAction, generateFortnightAction, generateNowAction, planRunAction, regenerateItemAction, revokeShareAction, shareAction } from "./plan-actions";
import { PlanButton, PlanRunForm, RefreshWhileDrafting, RegenerateItem, ShareControls } from "./PlanControls";
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
  // The plan, for runs made in Phase 2 (Run 1 came from the Phase 1 slots and has none).
  const planned = run && !run.imported;
  const [plan, share, feedback] = planned
    ? await Promise.all([planView(run.id), shareState(run.id), clientFeedback(run.id)])
    : [null, null, [] as ClientFeedback[]];
  // Generation state (Phase 2 A4): when each planned post is written, and which are with Anthropic now.
  const generating = run?.status === "active" && run.autoGenerate;
  const inFlight = await batchesInFlight([...new Set(slots.map(({ post }) => post.batchId).filter((id): id is string => Boolean(id)))]);
  const waiting = slots.filter(({ post }) => post.status === "topic_set" && !post.batchId && post.slotDate >= today);
  const nextCount = generating && run.nextGenerationOn ? waiting.filter(({ post }) => generatesOn(post.slotDate, run.nextGenerationOn, today) === generatesOn(today, run.nextGenerationOn, today)).length : 0;
  // Opening the tab is reading what the client sent, so the tab's badge clears.
  if (planned && feedback.some((item) => !item.seenAt)) await markSeen(run.id);

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
          {generating && run.nextGenerationOn ? (
            <div className="app-run-actions">
              <p className="small" style={{ margin: 0 }}>
                {nextGenerationLine(generatesOn(today, run.nextGenerationOn, today)!, nextCount, longDate)}
              </p>
              {waiting.length ? <PlanButton action={generateFortnightAction.bind(null, run.id)} label="Generate the next fortnight now" pendingLabel="Starting" variant="secondary" /> : null}
            </div>
          ) : null}
          {planned && plan && share && run.endsOn >= today ? <PlanPanel run={run} plan={plan} share={share} feedback={feedback} /> : null}

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
                    {post.batchId && inFlight.has(post.batchId) ? <Badge tone={GENERATION_LINES.inBatch.tone}>{GENERATION_LINES.inBatch.label}</Badge> : null}
                    {generating && post.status === "topic_set" && !post.batchId && post.slotDate >= today ? (
                      <Badge tone="neutral">{generatesOnLabel(generatesOn(post.slotDate, run.nextGenerationOn, today)!, longDate)}</Badge>
                    ) : null}
                  </div>
                  {run.status === "active" && post.runId && post.status === "topic_set" && !post.batchId && post.slotDate >= today ? (
                    <div className="app-run-actions">
                      <PlanButton action={generateNowAction.bind(null, post.id)} label="Generate now" pendingLabel="Starting" variant="secondary" />
                      <span className="small app-muted">Full price, starts at once.</span>
                    </div>
                  ) : null}
                  <details className="app-plan-edit">
                    <summary className="small">
                      {post.topic ? "Change topic or date" : "Set topic or date"}
                      <span className="app-visually-hidden">, {longDate(post.slotDate)}</span>
                    </summary>
                    <SlotEditor slot={post} today={today} canChangeTopic={PRE_WRITING_STATUSES.includes(post.status) && !post.batchId} />
                  </details>
                  {plan?.items.get(post.id) ? (
                    <PlannedItem
                      item={plan.items.get(post.id)!}
                      pillar={plan.pillars.get(plan.items.get(post.id)!.pillarId ?? "") ?? null}
                      comments={feedback.filter((entry) => entry.postId === post.id)}
                      canRegenerate={run.status !== "active" && !plan.drafting}
                      regenerate={regenerateItemAction.bind(null, run.id, post.id)}
                    />
                  ) : null}
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

// The planner's panel on the run header (Phase 2 A3): the plan's state, the client line, and the actions in order:
// plan, approve, share, activate.
function PlanPanel({ run, plan, share, feedback }: { run: Run; plan: PlanView; share: Awaited<ReturnType<typeof shareState>>; feedback: ClientFeedback[] }) {
  const hasItems = plan.items.size > 0;
  const whole = feedback.filter((entry) => !entry.postId);
  // An active run with no plan and no link has nothing left to do here.
  if (run.status === "active" && !hasItems && !share.expiresAt && whole.length === 0) return null;
  return (
    <div className="app-plan-panel">
      <RefreshWhileDrafting active={plan.drafting} />
      <div className="app-run-head">
        <div className="app-badges">
          {plan.drafting ? <Badge tone={PLAN_LINES.drafting.tone}>{PLAN_LINES.drafting.label}</Badge> : null}
          {plan.failed && !plan.drafting ? <Badge tone={PLAN_LINES.failed.tone}>{PLAN_LINES.failed.label}</Badge> : null}
          {hasItems ? <Badge tone={share.line.tone as BadgeTone}>{share.line.label}</Badge> : null}
        </div>
        {run.clientApprovedAt ? (
          <p className="small app-muted" style={{ margin: 0 }}>
            Approved by {run.clientApprovedBy} on {formatDate(run.clientApprovedAt)}
          </p>
        ) : null}
      </div>
      {plan.failed && !plan.drafting ? (
        <p className="small app-form-error" role="alert" style={{ margin: 0 }}>
          {plan.failed}
        </p>
      ) : null}
      {plan.drafting ? (
        <p className="small app-muted" role="status" style={{ margin: 0 }}>
          The planner is drafting. This page updates when it finishes, usually within two minutes.
        </p>
      ) : run.status === "active" ? null : (
        <PlanRunForm action={planRunAction.bind(null, run.id)} again={hasItems} />
      )}
      <div className="app-run-actions">
        {hasItems && !plan.drafting && run.status === "planning" ? (
          <PlanButton action={approvePlanAction.bind(null, run.id)} label="Approve plan" pendingLabel="Approving" />
        ) : null}
        {run.status === "plan_approved" ? (
          <PlanButton
            action={activateRunAction.bind(null, run.id)}
            label="Activate run"
            pendingLabel="Activating"
            confirm={`Activate ${run.name}? Its posts start being written on their schedule.`}
          />
        ) : null}
      </div>
      {hasItems ? <ShareControls share={shareAction.bind(null, run.id)} revoke={revokeShareAction.bind(null, run.id)} live={Boolean(share.expiresAt)} /> : null}
      {share.expiresAt ? (
        <p className="small app-muted" style={{ margin: 0 }}>
          The client&apos;s link works until {formatDate(share.expiresAt)}
          {share.lastViewedAt ? `; last opened ${formatDate(share.lastViewedAt)}` : ""}.
        </p>
      ) : null}
      {whole.length ? (
        <div className="app-stack" style={{ gap: 6 }}>
          <h3 className="subheading" style={{ margin: 0 }}>
            From the client, on the whole plan
          </h3>
          <ClientNotes comments={whole} />
        </div>
      ) : null}
    </div>
  );
}

function ClientNotes({ comments }: { comments: ClientFeedback[] }) {
  return (
    <ul className="app-client-notes">
      {comments.map((entry) => (
        <li key={entry.id} className="small">
          <strong>{entry.name}</strong> · {entry.kind === "approve" ? "approved the plan" : entry.kind === "suggest" ? "suggested" : "commented"} · {formatDate(entry.createdAt)}
          {entry.body ? <p className="body app-client-note-body">{entry.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function PlannedItem({
  item,
  pillar,
  comments,
  canRegenerate,
  regenerate,
}: {
  item: NonNullable<ReturnType<PlanView["items"]["get"]>>;
  pillar: string | null;
  comments: ClientFeedback[];
  canRegenerate: boolean;
  regenerate: Parameters<typeof RegenerateItem>[0]["action"];
}) {
  const line = PLAN_LINES[item.status];
  return (
    <div className="app-plan-item">
      <div className="app-plan-main">
        <span className="body app-plan-item-title">{item.title}</span>
        <span className="app-badges">
          <Badge tone={line.tone}>{line.label}</Badge>
          <Badge tone="neutral">{item.category}</Badge>
          {pillar ? <Badge tone="brand">{pillar}</Badge> : null}
          {item.closeTo ? <Badge tone={PLAN_LINES.closeTo.tone}>{PLAN_LINES.closeTo.label}</Badge> : null}
        </span>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {item.excerpt}
      </p>
      <p className="small app-muted" style={{ margin: 0 }}>
        Why: {item.reason}
        {item.closeTo ? ` Close to "${item.closeTo}".` : ""}
      </p>
      {comments.length ? <ClientNotes comments={comments} /> : null}
      {canRegenerate ? <RegenerateItem action={regenerate} title={item.title} /> : null}
    </div>
  );
}

