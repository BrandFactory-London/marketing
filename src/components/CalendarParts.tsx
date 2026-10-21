import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { getPostStatus, isMissed, MISSED, postStatusLabel, POST_STATUSES } from "@/config/post-status";
import { dayName, longDate, shortDate } from "@/lib/dates";
import type { SlotView } from "@/lib/posts";

// The pieces shared by the calendar page and Home: a slot chip, a grid of days, the phone agenda and
// the legend. Colours and words all come from src/config/post-status.ts.

export function SlotStatus({ slot, today }: { slot: Pick<SlotView, "status" | "slotDate">; today: string }) {
  const info = getPostStatus(slot.status);
  return (
    <span className="app-badges">
      {isMissed(slot.status, slot.slotDate, today) ? <Badge tone={MISSED.tone}>{MISSED.label}</Badge> : null}
      <Badge tone={info.tone}>{postStatusLabel(slot.status)}</Badge>
    </span>
  );
}

function slotTitle(slot: SlotView) {
  return slot.topic ?? "No topic yet";
}

export function SlotChip({
  slot,
  href,
  today,
  showProject,
  selected = false,
}: {
  slot: SlotView;
  href: string;
  today: string;
  showProject: boolean;
  selected?: boolean;
}) {
  const info = getPostStatus(slot.status);
  const missed = isMissed(slot.status, slot.slotDate, today);
  const label = [
    slotTitle(slot),
    slot.projectName,
    postStatusLabel(slot.status),
    missed ? MISSED.label : null,
    longDate(slot.slotDate),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Link
      href={href}
      scroll={false}
      className={["app-slot", `app-slot-${info.calendar}`, missed ? "app-slot-missed" : ""].filter(Boolean).join(" ")}
      aria-current={selected ? "true" : undefined}
      aria-label={label}
      title={label}
    >
      <span className="app-slot-title">{slotTitle(slot)}</span>
      {showProject ? <span className="app-slot-project">{slot.projectName}</span> : null}
    </Link>
  );
}

type GridProps = {
  weeks: string[][];
  slots: SlotView[];
  today: string;
  hrefFor: (slot: SlotView) => string;
  showProject: boolean;
  selectedId?: string;
  // Month view: days outside the month are dimmed and show only their number.
  month?: string;
  label?: "number" | "name";
};

export function CalendarGrid({ weeks, slots, today, hrefFor, showProject, selectedId, month, label = "number" }: GridProps) {
  const byDay = groupByDay(slots);
  return (
    <div className="app-cal" role="grid" aria-label={month ? "Month" : "Next two weeks"}>
      {label === "number" ? (
        <div className="app-cal-row app-cal-head" role="row">
          {weeks[0].map((day) => (
            <div key={day} className="label app-cal-weekday" role="columnheader">
              {dayName(day)}
            </div>
          ))}
        </div>
      ) : null}
      {weeks.map((week) => (
        <div key={week[0]} className="app-cal-row" role="row">
          {week.map((day) => {
            const isToday = day === today;
            const outside = month ? !day.startsWith(month) : false;
            return (
              <div
                key={day}
                role="gridcell"
                aria-label={longDate(day)}
                className={["app-cal-day", outside ? "app-cal-outside" : "", isToday ? "app-cal-today" : ""].filter(Boolean).join(" ")}
              >
                <span className="small app-cal-num">
                  {label === "number" ? Number(day.slice(8)) : `${isToday ? "Today," : dayName(day)} ${shortDate(day)}`}
                </span>
                {(byDay.get(day) ?? []).map((slot) => (
                  <SlotChip key={slot.id} slot={slot} href={hrefFor(slot)} today={today} showProject={showProject} selected={slot.id === selectedId} />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Phones get a list of the days that have slots instead of a seven-column grid.
export function CalendarAgenda({
  slots,
  today,
  hrefFor,
  showProject,
  selectedId,
  empty,
}: {
  slots: SlotView[];
  today: string;
  hrefFor: (slot: SlotView) => string;
  showProject: boolean;
  selectedId?: string;
  empty: string;
}) {
  const byDay = groupByDay(slots);
  if (byDay.size === 0) return <p className="body app-muted app-cal-agenda">{empty}</p>;
  return (
    <ol className="app-cal-agenda">
      {[...byDay.entries()].map(([day, daySlots]) => (
        <li key={day} className="app-cal-agenda-day">
          <span className={["small app-cal-agenda-date", day === today ? "app-cal-agenda-today" : ""].filter(Boolean).join(" ")}>
            {day === today ? `Today, ${shortDate(day)}` : longDate(day)}
          </span>
          {daySlots.map((slot) => (
            <SlotChip key={slot.id} slot={slot} href={hrefFor(slot)} today={today} showProject={showProject} selected={slot.id === selectedId} />
          ))}
        </li>
      ))}
    </ol>
  );
}

// Lists only the styles that appear, in the status module's order, then Missed.
export function CalendarLegend({ slots, today }: { slots: SlotView[]; today: string }) {
  const present = POST_STATUSES.filter((item) => slots.some((slot) => slot.status === item.key));
  const missed = slots.some((slot) => isMissed(slot.status, slot.slotDate, today));
  if (present.length === 0) return null;
  return (
    <ul className="small app-cal-legend" aria-label="Legend">
      {present.map((item) => (
        <li key={item.key}>
          <span className={`app-cal-swatch app-slot-${item.calendar}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
      {missed ? (
        <li>
          <span className="app-cal-swatch app-slot-planned app-slot-missed" aria-hidden="true" />
          {MISSED.label}
        </li>
      ) : null}
    </ul>
  );
}

function groupByDay(slots: SlotView[]) {
  const byDay = new Map<string, SlotView[]>();
  for (const slot of slots) byDay.set(slot.slotDate, [...(byDay.get(slot.slotDate) ?? []), slot]);
  return byDay;
}
