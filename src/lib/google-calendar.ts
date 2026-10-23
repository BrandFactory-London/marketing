import { googleApiBase } from "./drive";
import type { CalendarEvent } from "./calendar-events";

// Minimal Google Calendar v3 client (γ8 orientation Q1, Q4): the calendars Amir owns, and the app's own events in one
// of them. Writes only; nothing is ever read back into the app except to compare in the resync.

export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events.owned"];

export function hasCalendarScopes(scope: string | null | undefined): boolean {
  const granted = new Set((scope ?? "").split(/\s+/));
  return CALENDAR_SCOPES.every((item) => granted.has(item));
}

export class CalendarError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CalendarError";
  }
}

export type CalendarOptions = { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> };
export type OwnedCalendar = { id: string; name: string; primary: boolean };
export type RemoteEvent = Partial<CalendarEvent> & { id: string };

// A rate-limited call is retried after 1, 2 and 4 seconds, then given up for the next pass (γ8 orientation Q2).
const BACKOFF_MS = [1000, 2000, 4000];

type GoogleErrorBody = { error?: { message?: string; errors?: { reason?: string }[] } };

async function call(accessToken: string, path: string, init: RequestInit, options: CalendarOptions): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(`${googleApiBase()}/calendar/v3${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
    });
    if (response.ok || attempt >= BACKOFF_MS.length || !(await rateLimited(response))) return response;
    await sleep(BACKOFF_MS[attempt]);
  }
}

async function rateLimited(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  const body = (await response.clone().json().catch(() => ({}))) as GoogleErrorBody;
  return (body.error?.errors ?? []).some((item) => item.reason === "rateLimitExceeded" || item.reason === "userRateLimitExceeded");
}

async function fail(response: Response, what: string): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as GoogleErrorBody;
  const messages: Record<number, string> = {
    401: "Google rejected the access token.",
    403: "Google refused access. Reconnect Google on this page and allow Google Calendar.",
    404: "Google could not find the calendar. Choose it again.",
  };
  const detail = body.error?.message ? ` Google said: ${body.error.message}` : "";
  throw new CalendarError(`${messages[response.status] ?? `${what} failed with status ${response.status}.`}${detail}`, response.status);
}

// The calendars Amir owns; the events scope reaches no other kind (γ8 orientation Q1).
export async function listOwnedCalendars(accessToken: string, options: CalendarOptions = {}): Promise<OwnedCalendar[]> {
  const calendars: OwnedCalendar[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ minAccessRole: "owner", maxResults: "250", ...(pageToken ? { pageToken } : {}) });
    const response = await call(accessToken, `/users/me/calendarList?${params}`, { method: "GET" }, options);
    if (!response.ok) await fail(response, "Listing calendars");
    const body = (await response.json()) as { items?: { id?: string; summary?: string; summaryOverride?: string; primary?: boolean }[]; nextPageToken?: string };
    for (const item of body.items ?? []) if (item.id) calendars.push({ id: item.id, name: item.summaryOverride || item.summary || item.id, primary: Boolean(item.primary) });
    pageToken = body.nextPageToken;
  } while (pageToken);
  return calendars;
}

const eventsPath = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}/events`;

// Creates the event, or, if Google already has its ID (a lost reply, or an event deleted in Google, which keeps its ID
// as cancelled), patches it back to what the app says.
export async function upsertEvent(accessToken: string, calendarId: string, event: CalendarEvent, options: CalendarOptions = {}): Promise<"created" | "updated"> {
  const created = await call(accessToken, eventsPath(calendarId), { method: "POST", body: JSON.stringify(event) }, options);
  if (created.ok) return "created";
  if (created.status !== 409) await fail(created, "Creating the event");
  const { id, ...fields } = event;
  const patched = await call(accessToken, `${eventsPath(calendarId)}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) }, options);
  if (!patched.ok) await fail(patched, "Updating the event");
  return "updated";
}

// Deletes the event. One that is already gone counts as done.
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string, options: CalendarOptions = {}): Promise<void> {
  const response = await call(accessToken, `${eventsPath(calendarId)}/${encodeURIComponent(eventId)}`, { method: "DELETE" }, options);
  if (response.ok || response.status === 404 || response.status === 410) return;
  await fail(response, "Deleting the event");
}

// Every event the app made in the calendar, found by its private tag. Events without the tag are never listed, so the
// resync cannot touch Amir's own events.
export async function listAppEvents(accessToken: string, calendarId: string, tag: string, options: CalendarOptions = {}): Promise<RemoteEvent[]> {
  const events: RemoteEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ privateExtendedProperty: `bfmApp=${tag}`, maxResults: "2500", showDeleted: "false", ...(pageToken ? { pageToken } : {}) });
    const response = await call(accessToken, `${eventsPath(calendarId)}?${params}`, { method: "GET" }, options);
    if (!response.ok) await fail(response, "Listing the app's events");
    const body = (await response.json()) as { items?: RemoteEvent[]; nextPageToken?: string };
    events.push(...(body.items ?? []).filter((item) => item.id));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return events;
}
