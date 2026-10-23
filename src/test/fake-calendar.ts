// A fake Google token endpoint and Calendar v3 API for Vitest (γ8 orientation Q7). Events live in memory; any call
// can be made to fail once with a status and reason.

type StoredEvent = Record<string, unknown> & { id: string; status: string };
type Failure = { method: string; status: number; reason?: string };

export const CALENDAR_SCOPE_STRING =
  "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.owned";

export function createFakeCalendar(options: { calendars?: { id: string; summary: string; accessRole?: string }[] } = {}) {
  const calendars = options.calendars ?? [{ id: "content@group.calendar.google.com", summary: "BrandFactory Content", accessRole: "owner" }];
  const events = new Map<string, StoredEvent>();
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const failures: Failure[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/token")) return json(200, { access_token: "fake-access", expires_in: 3600, scope: CALENDAR_SCOPE_STRING });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, body });
    const failure = failures.findIndex((item) => item.method === method);
    if (failure !== -1) {
      const [item] = failures.splice(failure, 1);
      return json(item.status, { error: { message: `Fake ${item.status}`, errors: item.reason ? [{ reason: item.reason }] : [] } });
    }
    if (url.pathname === "/calendar/v3/users/me/calendarList") {
      return json(200, { items: calendars.filter((item) => (item.accessRole ?? "owner") === "owner") });
    }
    const one = /^\/calendar\/v3\/calendars\/[^/]+\/events\/([^/]+)$/.exec(url.pathname);
    if (one) {
      const id = decodeURIComponent(one[1]);
      const event = events.get(id);
      if (method === "DELETE") {
        if (!event || event.status === "cancelled") return json(event ? 410 : 404, { error: { message: "Gone" } });
        events.set(id, { ...event, status: "cancelled" });
        return new Response(null, { status: 204 });
      }
      if (!event) return json(404, { error: { message: "Not found" } });
      const patched = { ...event, ...body, id };
      events.set(id, patched);
      return json(200, patched);
    }
    if (/^\/calendar\/v3\/calendars\/[^/]+\/events$/.test(url.pathname)) {
      if (method === "POST") {
        if (events.has(body.id)) return json(409, { error: { message: "The requested identifier already exists." } });
        events.set(body.id, { ...body });
        return json(200, body);
      }
      const [key, value] = (url.searchParams.get("privateExtendedProperty") ?? "=").split("=");
      const items = [...events.values()].filter(
        (event) => event.status !== "cancelled" && (event.extendedProperties as { private?: Record<string, string> } | undefined)?.private?.[key] === value,
      );
      return json(200, { items });
    }
    return json(404, { error: { message: "Unknown path" } });
  }) as typeof fetch;

  return {
    fetchImpl,
    events,
    calls,
    failNext: (method: string, status: number, reason?: string) => failures.push({ method, status, reason }),
    live: () => [...events.values()].filter((event) => event.status !== "cancelled"),
  };
}
