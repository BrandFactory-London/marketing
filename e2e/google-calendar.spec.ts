import { encrypt } from "../src/lib/crypto";
import { expect, query, resetDomain, test, TEST_EMAIL, seedRun } from "./fixtures";

// γ8: Google Calendar on Connections (needs connecting, choosing the calendar, Sync calendar now), events following a
// topic and a move, a Google failure that never blocks the action, and the client's short name. Google is the local
// stand-in (e2e/google-standin.mjs), with an in-memory calendar.

test.describe.configure({ mode: "serial" });

const GOOGLE = "http://localhost:3198";
const DRIVE = "https://www.googleapis.com/auth/drive.readonly";
const CALENDAR = "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.owned";
const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });
type Event = { id: string; summary: string; description: string; colorId: string; status: string; start: { date: string }; extendedProperties?: { private?: Record<string, string> } };
const events = async () => ((await (await fetch(`${GOOGLE}/__calendar/events`)).json()) as { events: Event[] }).events.filter((event) => event.status !== "cancelled");
const eventFor = async (postId: string) => (await events()).find((event) => event.extendedProperties?.private?.bfmPostId === postId);

let clientId = "";
let projectId = "";

async function storeGoogleToken(scope: string) {
  process.env.APP_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const [user] = await query<{ id: string }>("select id from users where email = $1", [TEST_EMAIL]);
  await query("delete from google_tokens where user_id = $1", [user.id]);
  await query("insert into google_tokens (user_id, refresh_token_enc, scope) values ($1, $2, $3)", [user.id, encrypt("playwright-refresh", `google-refresh-token:${user.id}`), scope]);
}

async function slots() {
  return query<{ id: string; slot_date: string; status: string }>("select id, to_char(slot_date, 'YYYY-MM-DD') as slot_date, status from posts where project_id = $1 order by slot_date", [projectId]);
}

test.beforeAll(async () => {
  await resetDomain();
  await fetch(`${GOOGLE}/__calendar/reset`);
  [{ id: clientId }] = await query<{ id: string }>("insert into clients (name) values ('Migss Interiors') returning id");
  [{ id: projectId }] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, status) values ($1, 'Migss Interiors Website', 'https://www.migssinteriors.com', 'active') returning id",
    [clientId],
  );
  // Phase 2 A1: eight weeks of Tuesday slots from a run.
  await seedRun(projectId, [2], { preset: "entry" });
});

test.afterAll(async () => {
  const [user] = await query<{ id: string }>("select id from users where email = $1", [TEST_EMAIL]);
  if (user) await query("delete from google_tokens where user_id = $1", [user.id]);
  await query("update app_settings set calendar_user_id = null, calendar_id = null, calendar_name = null, calendar_synced_at = null, calendar_error = null, calendar_error_at = null");
});

test("Calendar needs connecting until Google grants it; Drive is unaffected", async ({ page, signedIn }) => {
  void signedIn;
  await storeGoogleToken(DRIVE);
  await page.goto("/settings/connections");
  const row = page.locator(".app-connection", { has: page.getByText("Google Calendar", { exact: true }) });
  await expect(row.getByText("Needs connecting", { exact: true })).toBeVisible();
  await expect(row.getByText("Calendar needs connecting. Reconnect Google above", { exact: false })).toBeVisible();
  await expect(page.locator(".app-connection", { has: page.getByText("Google", { exact: true }) }).getByText("Google Drive, read only", { exact: false })).toBeVisible();
  await expect(row.getByRole("button", { name: "Sync calendar now" })).toHaveCount(0);
  await page.screenshot(shot("g8-calendar-needs-connecting"));
});

test("choosing BrandFactory Content fills it with every slot, then Sync calendar now finds nothing to change", async ({ page, signedIn }) => {
  void signedIn;
  await storeGoogleToken(`${DRIVE} ${CALENDAR}`);
  await page.goto("/calendar");
  const all = await slots();
  expect(all.length).toBeGreaterThan(0);
  await page.goto("/settings/connections");
  const row = page.locator(".app-connection", { has: page.getByText("Google Calendar", { exact: true }) });
  await expect(row.getByText("No calendar chosen", { exact: true })).toBeVisible();
  // Only calendars Amir owns are offered.
  const picker = row.getByLabel("Calendar for every slot");
  await expect(picker.locator("option")).toHaveText(["BrandFactory Content", "hello@brandfactorylondon.com"]);
  await picker.selectOption({ label: "BrandFactory Content" });
  await row.getByRole("button", { name: "Use this calendar" }).click();
  await expect(row.getByText("Events now go to BrandFactory Content. Filling it now.")).toBeVisible();
  await expect.poll(async () => (await events()).length, { timeout: 15_000 }).toBe(all.length);
  const first = (await eventFor(all[0].id))!;
  expect(first).toMatchObject({ summary: "Migss · SEO · Planned slot", colorId: "8", start: { date: all[0].slot_date } });
  expect(first.description).toContain("Open in BrandFactory Marketing: http://localhost:3100/calendar");

  await page.reload();
  await row.getByRole("button", { name: "Sync calendar now" }).click();
  await expect(row.getByText("Nothing to change.")).toBeVisible();
  await expect(row.getByText("In sync", { exact: true })).toBeVisible();
  await expect(row.getByText("Every slot appears in BrandFactory Content", { exact: false })).toBeVisible();
  await page.screenshot(shot("g8-calendar-connected"));
});

test("a topic and a move update the slot's event", async ({ page, signedIn }) => {
  void signedIn;
  const [first] = await slots();
  await page.goto(`/projects/${projectId}/plan`);
  const row = page.locator(".app-plan-row").first();
  await row.getByText("Set topic or date").click();
  await row.getByRole("textbox", { name: "Topic" }).fill("Wet room maintenance week by week");
  await row.getByRole("button", { name: "Set topic" }).click();
  await expect(row).toContainText("Topic set");
  await expect.poll(async () => (await eventFor(first.id))?.summary, { timeout: 15_000 }).toBe("Migss · SEO · Wet room maintenance week by week");
  expect((await eventFor(first.id))?.colorId).toBe("1");

  const target = (await slots()).at(-1)!.slot_date;
  if (!(await row.getByLabel("Date", { exact: true }).isVisible())) await row.getByText("Set topic or date").click();
  await row.getByLabel("Date", { exact: true }).fill(target);
  await row.getByRole("button", { name: "Move slot" }).click();
  await expect.poll(async () => (await eventFor(first.id))?.start.date, { timeout: 15_000 }).toBe(target);
});

test("a Google failure never blocks the action; Connections shows it, and Sync calendar now repairs it", async ({ page, signedIn }) => {
  void signedIn;
  // The first slot moved to the end, so the plan's first row is now the next slot.
  const [second] = await slots();
  await fetch(`${GOOGLE}/__calendar/fail?method=PATCH&status=500`);
  await page.goto(`/projects/${projectId}/plan`);
  const row = page.locator(".app-plan-row").first();
  await row.getByText("Set topic or date").click();
  await row.getByRole("textbox", { name: "Topic" }).fill("Shower trays compared");
  await row.getByRole("button", { name: "Set topic" }).click();
  // The topic is saved whatever Google said.
  await expect(row).toContainText("Shower trays compared");
  await page.goto("/settings/connections");
  const calendar = page.locator(".app-connection", { has: page.getByText("Google Calendar", { exact: true }) });
  await expect.poll(async () => {
    await page.reload();
    return calendar.getByText("Not fully synced", { exact: true }).count();
  }, { timeout: 15_000 }).toBe(1);
  await expect(calendar.getByText("1 not synced. Updating the event failed with status 500. Google said: Stand-in 500", { exact: false })).toBeVisible();
  await page.screenshot(shot("g8-calendar-error"));
  await calendar.getByRole("button", { name: "Sync calendar now" }).click();
  await expect(calendar.getByText("1 updated.")).toBeVisible();
  expect((await eventFor(second.id))?.summary).toBe("Migss · SEO · Shower trays compared");
  await page.reload();
  await expect(calendar.getByText("In sync", { exact: true })).toBeVisible();
});

test("the client's short name titles its events", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/crm/${clientId}`);
  await page.getByRole("button", { name: "Edit client" }).click();
  await page.getByLabel("Short name (optional)").fill("MI");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect.poll(async () => (await events()).every((event) => event.summary.startsWith("MI · SEO · ")), { timeout: 15_000 }).toBe(true);
});

test("the Calendar row fits a 390px phone", async ({ page, signedIn }) => {
  void signedIn;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/connections");
  await expect(page.getByRole("button", { name: "Sync calendar now" })).toBeVisible();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  await page.screenshot(shot("g8-mobile-connections"));
});
