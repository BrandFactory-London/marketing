// A local stand-in for Google's token, Drive and Calendar APIs (γ5 orientation Q6, γ8 orientation Q7), so Playwright
// never reaches Google. It serves a small folder tree like Migss's (a parent folder with Bathrooms and Kitchens
// subfolders) and an in-memory calendar. /__calendar/* lets a test read the events, fail the next call, or grant the
// token without the Calendar scopes.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3198);
const origin = `http://localhost:${port}`;
const FOLDER = "application/vnd.google-apps.folder";
const files = [
  { id: "playwright-migss", name: "Migss Interiors", mimeType: FOLDER, parents: ["my-drive"] },
  { id: "pw-bathrooms", name: "Bathrooms", mimeType: FOLDER, parents: ["playwright-migss"] },
  { id: "pw-kitchens", name: "Kitchens", mimeType: FOLDER, parents: ["playwright-migss"] },
  ...Array.from({ length: 64 }, (_, index) => ({ id: `pw-bath-${index + 1}`, name: `Wet room ${index + 1}.jpg`, mimeType: "image/jpeg", parents: ["pw-bathrooms"] })),
  { id: "pw-kitchen-1", name: "Shaker kitchen.jpg", mimeType: "image/jpeg", parents: ["pw-kitchens"] },
];

// A labelled tile, so screenshots show which photo is which.
function tile(id) {
  const file = files.find((item) => item.id === id);
  const hue = (Number(id.replace(/\D/g, "")) * 37) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="hsl(${hue} 35% 78%)"/><text x="16" y="128" font-family="sans-serif" font-size="22" fill="#1f2a30">${file?.name ?? id}</text></svg>`;
}

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const CALENDAR_SCOPES = "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.owned";
const calendars = [
  { id: "content-calendar@group.calendar.google.com", summary: "BrandFactory Content", accessRole: "owner" },
  { id: "hello@brandfactorylondon.com", summary: "hello@brandfactorylondon.com", accessRole: "owner", primary: true },
  { id: "shared@group.calendar.google.com", summary: "Shared with Amir", accessRole: "reader" },
];
const calendar = { events: new Map(), grantCalendar: true, failures: [] };

function readBody(request) {
  return new Promise((resolve) => {
    let data = "";
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => resolve(data ? JSON.parse(data) : undefined));
  });
}

async function calendarApi(request, url, json) {
  const method = request.method ?? "GET";
  const failure = calendar.failures.findIndex((item) => item.method === method);
  if (failure !== -1) {
    const [item] = calendar.failures.splice(failure, 1);
    return json(item.status, { error: { message: `Stand-in ${item.status}`, errors: [] } });
  }
  if (url.pathname === "/calendar/v3/users/me/calendarList") return json(200, { items: calendars.filter((item) => item.accessRole === "owner") });
  const one = /^\/calendar\/v3\/calendars\/[^/]+\/events\/([^/]+)$/.exec(url.pathname);
  if (one) {
    const id = decodeURIComponent(one[1]);
    const event = calendar.events.get(id);
    if (method === "DELETE") {
      if (!event || event.status === "cancelled") return json(event ? 410 : 404, { error: { message: "Gone" } });
      calendar.events.set(id, { ...event, status: "cancelled" });
      return json(204, null);
    }
    if (!event) return json(404, { error: { message: "Not found" } });
    const patched = { ...event, ...(await readBody(request)), id };
    calendar.events.set(id, patched);
    return json(200, patched);
  }
  if (/^\/calendar\/v3\/calendars\/[^/]+\/events$/.test(url.pathname)) {
    if (method === "POST") {
      const body = await readBody(request);
      if (calendar.events.has(body.id)) return json(409, { error: { message: "The requested identifier already exists." } });
      calendar.events.set(body.id, body);
      return json(200, body);
    }
    const [key, value] = (url.searchParams.get("privateExtendedProperty") ?? "=").split("=");
    return json(200, { items: [...calendar.events.values()].filter((event) => event.status !== "cancelled" && event.extendedProperties?.private?.[key] === value) });
  }
  return json(404, { error: { message: "not found" } });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", origin);
  const json = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body === null ? undefined : JSON.stringify(body));
  };
  if (url.pathname === "/") return json(200, { ok: true });
  if (url.pathname === "/token") return json(200, { access_token: "playwright-access-token", expires_in: 3600, scope: calendar.grantCalendar ? `${DRIVE_SCOPE} ${CALENDAR_SCOPES}` : DRIVE_SCOPE });
  if (url.pathname === "/__calendar/reset") {
    calendar.events.clear();
    calendar.failures = [];
    calendar.grantCalendar = url.searchParams.get("grant") !== "0";
    return json(200, { ok: true });
  }
  if (url.pathname === "/__calendar/fail") {
    calendar.failures.push({ method: url.searchParams.get("method") ?? "POST", status: Number(url.searchParams.get("status") ?? 500) });
    return json(200, { ok: true });
  }
  if (url.pathname === "/__calendar/events") return json(200, { events: [...calendar.events.values()] });
  if (request.headers.authorization !== "Bearer playwright-access-token") return json(401, { error: "unauthorised" });
  if (url.pathname.startsWith("/calendar/v3/")) return calendarApi(request, url, json);
  const thumb = /^\/thumb\/([^=]+)=s\d+$/.exec(url.pathname);
  if (thumb) {
    response.writeHead(200, { "content-type": "image/svg+xml" });
    return response.end(tile(thumb[1]));
  }
  const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
  if (one) {
    const file = files.find((item) => item.id === decodeURIComponent(one[1]));
    if (!file) return json(404, { error: "not found" });
    // γ6 publish downloads the chosen cover.
    if (url.searchParams.get("alt") === "media") {
      response.writeHead(200, { "content-type": "image/svg+xml" });
      return response.end(tile(file.id));
    }
    return json(200, { ...file, thumbnailLink: file.mimeType.startsWith("image/") ? `${origin}/thumb/${file.id}=s220` : undefined });
  }
  if (url.pathname === "/drive/v3/files") {
    const parent = /'([^']+)' in parents/.exec(url.searchParams.get("q") ?? "")?.[1];
    const all = files.filter((file) => file.parents.includes(parent) && (file.mimeType === FOLDER || file.mimeType.startsWith("image/")));
    const size = Number(url.searchParams.get("pageSize") ?? 100);
    const start = Number(url.searchParams.get("pageToken") ?? 0);
    return json(200, { files: all.slice(start, start + size), nextPageToken: start + size < all.length ? String(start + size) : undefined });
  }
  return json(404, { error: "not found" });
});

server.listen(port, () => console.log(`Google stand-in on ${origin}`));
