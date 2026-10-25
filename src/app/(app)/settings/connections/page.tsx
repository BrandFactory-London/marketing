import type { Metadata } from "next";
import { Suspense } from "react";
import { reconnectGoogleAction } from "@/app/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { describeScope, getGoogleConnection } from "@/lib/connections";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { listWixConnections } from "@/lib/wix-credentials";
import { AnthropicCheck } from "./AnthropicCheck";
import { chooseCalendarAction, syncCalendarNowAction } from "./actions";
import { CalendarControls } from "./CalendarControls";
import { getCalendarState, listCalendarsFor } from "@/lib/calendar-sync";
import type { OwnedCalendar } from "@/lib/google-calendar";
import { WixCheck } from "./WixCheck";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return (
    <Card className="app-section" aria-labelledby="connections-heading">
      <h2 id="connections-heading" className="heading app-section-title">
        Connections
      </h2>
      <ul className="app-connections">
        <Suspense
          fallback={
            <li className="app-connection" aria-busy="true">
              <span className="subheading">Google</span>
            </li>
          }
        >
          <GoogleRow />
        </Suspense>
        <Suspense
          fallback={
            <li className="app-connection" aria-busy="true">
              <span className="subheading">Google Calendar</span>
            </li>
          }
        >
          <CalendarRow />
        </Suspense>
        <li className="app-connection">
          <AnthropicCheck />
        </li>
        <li className="app-connection">
          <span>
            <span className="subheading">Trigger.dev</span>
            <br />
            <span className="small app-muted">{triggerLine()}</span>
          </span>
          <Badge tone={triggerEnvironment() ? "success" : "warning"}>{triggerEnvironment() ? "Configured" : "Not configured"}</Badge>
        </li>
        <Suspense
          fallback={
            <li className="app-connection" aria-busy="true">
              <span className="subheading">Wix</span>
            </li>
          }
        >
          <WixRows />
        </Suspense>
      </ul>
    </Card>
  );
}

async function GoogleRow() {
  const user = await requireUser();
  const connection = await getGoogleConnection(user.id);
  return (
    <li className="app-connection">
      <span>
        <span className="subheading">Google</span>
        <br />
        {connection ? (
          <span className="small app-muted">
            Connected as {connection.email}. Access: {connection.scopes.map(describeScope).filter((name, i, all) => all.indexOf(name) === i).join(", ")}.
            Last refreshed {formatDateTime(connection.lastRefresh)}.
          </span>
        ) : (
          <span className="small app-muted">No Google connection is stored. Drive folders cannot be checked until you reconnect.</span>
        )}
      </span>
      <span className="app-row">
        <Badge tone={connection ? "success" : "warning"}>{connection ? "Connected" : "Not connected"}</Badge>
        <form action={reconnectGoogleAction}>
          <Button type="submit" variant="secondary" size="sm">
            Reconnect Google
          </Button>
        </form>
      </span>
    </li>
  );
}

// The calendar every slot is mirrored to (γ8 handoff items 1, 2, 6, 7).
async function CalendarRow() {
  const user = await requireUser();
  const state = await getCalendarState(user.id);
  let calendars: OwnedCalendar[] = [];
  let listError: string | null = null;
  if (state.granted) {
    try {
      calendars = await listCalendarsFor(user.id);
    } catch (error) {
      listError = error instanceof Error ? error.message : "Your calendars could not be listed.";
    }
  }
  const badge = !state.granted
    ? { tone: "warning" as const, label: "Needs connecting" }
    : !state.calendarId
      ? { tone: "warning" as const, label: "No calendar chosen" }
      : state.error
        ? { tone: "danger" as const, label: "Not fully synced" }
        : { tone: "success" as const, label: "In sync" };
  return (
    <li className="app-connection">
      <span className="app-stack" style={{ gap: 4 }}>
        <span className="subheading">Google Calendar</span>
        {!state.granted ? (
          <span className="small app-muted">
            Calendar needs connecting. Reconnect Google above and allow your calendar list and events on calendars you own. Drive keeps working either way.
          </span>
        ) : (
          <span className="small app-muted">
            {state.calendarName ? `Every slot appears in ${state.calendarName}, one way: the app is the source of truth.` : "Choose the calendar every slot should appear in."}
            {state.syncedAt ? ` Last synced ${formatDateTime(state.syncedAt)}.` : ""}
            {state.calendarId && state.pending > 0 ? ` ${state.pending} ${state.pending === 1 ? "change is" : "changes are"} waiting.` : ""}
          </span>
        )}
        {state.error ? (
          <span className="small app-form-error">
            {state.error}
            {state.errorAt ? ` (${formatDateTime(state.errorAt)})` : ""}
          </span>
        ) : null}
        {listError ? <span className="small app-form-error">{listError}</span> : null}
        {state.granted && !listError ? (
          calendars.length > 0 ? (
            <CalendarControls calendars={calendars} chosenId={state.calendarId} chooseAction={chooseCalendarAction} syncAction={syncCalendarNowAction} />
          ) : (
            <span className="small app-muted">No calendars you own were found.</span>
          )
        ) : null}
      </span>
      <Badge tone={badge.tone}>{badge.label}</Badge>
    </li>
  );
}

// Which Trigger.dev environment the app starts runs in, read from the secret key's prefix. Never the key itself.
function triggerEnvironment(): string | null {
  const key = process.env.TRIGGER_SECRET_KEY ?? "";
  if (key.startsWith("tr_prod_")) return "Production";
  if (key.startsWith("tr_dev_")) return "Development";
  if (key.startsWith("tr_")) return "a Trigger.dev environment";
  return null;
}

function triggerLine(): string {
  const environment = triggerEnvironment();
  return environment
    ? `Specs and posts are written by tasks in ${environment}. Each run's steps are listed in the Trigger.dev dashboard.`
    : "No Trigger.dev secret key is set, so nothing can be generated. Add TRIGGER_SECRET_KEY in Vercel.";
}

// One row per project: its Wix credentials and the last connection check (γ6 orientation Q1).
async function WixRows() {
  const rows = await listWixConnections();
  if (rows.length === 0) {
    return (
      <li className="app-connection">
        <span>
          <span className="subheading">Wix</span>
          <br />
          <span className="small app-muted">Blog publishing credentials are added on each project&apos;s Details tab.</span>
        </span>
        <Badge>No projects yet</Badge>
      </li>
    );
  }
  return rows.map((row) => (
    <li key={row.projectId} className="app-connection">
      <WixCheck
        projectId={row.projectId}
        name={`Wix: ${row.projectName}`}
        settingsHref={`/projects/${row.projectId}/details#wix-heading`}
        current={
          row.settings
            ? {
                ok: row.settings.checkOk,
                message: row.settings.checkMessage,
                checkedAt: row.settings.checkedAt ? formatDateTime(row.settings.checkedAt) : null,
                author: row.settings.memberName,
              }
            : null
        }
      />
    </li>
  ));
}
