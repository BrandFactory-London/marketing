import { expect, query, test, resetDomain } from "./fixtures";

// γ3.3, reworked in Phase 2 A1: the Run plan tab with runs, the Posts page and the project cards.

test.describe.configure({ mode: "serial" });

const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });
const today = londonToday();

let migssId = "";
let projectId = "";
let otherClientId = "";

test.beforeAll(async () => {
  await resetDomain();
  [{ id: migssId }] = await query<{ id: string }>("insert into clients (name) values ('Migss Interiors') returning id");
  [{ id: otherClientId }] = await query<{ id: string }>("insert into clients (name) values ('Another client') returning id");
  [{ id: projectId }] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, package, status) values ($1, 'Migss Interiors Website', 'https://www.migssinteriors.com', 'premium', 'active') returning id",
    [migssId],
  );
});

async function slots() {
  return query<{ id: string; slot_date: string; cadence_date: string; status: string; topic: string | null }>(
    "select id, to_char(slot_date, 'YYYY-MM-DD') as slot_date, to_char(cadence_date, 'YYYY-MM-DD') as cadence_date, status, topic from posts where project_id = $1 order by slot_date, created_at",
    [projectId],
  );
}

// Every day from `from` to `to` on the given weekdays.
const matching = (from: string, to: string, weekdays: number[]) => {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) if (weekdays.includes(weekday(day))) days.push(day);
  return days;
};
// The day before the same date a month later, as the app's run end.
const monthEnd = (start: string) => {
  const [year, month, day] = start.split("-").map(Number);
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return addDays(new Date(Date.UTC(year, month, Math.min(day, last))).toISOString().slice(0, 10), -1);
};
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)).replace(",", "");

async function derived() {
  return query<{ id: string; parent_post_id: string; content_type: string; slot_date: string }>(
    "select d.id, d.parent_post_id, d.content_type, to_char(d.slot_date, 'YYYY-MM-DD') as slot_date from derived_slots d join posts p on p.id = d.parent_post_id where p.project_id = $1 order by d.slot_date",
    [projectId],
  );
}

test("setting up a run puts typed SEO and GBP slots on the Run plan (Phase 2 A1)", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/plan`);
  await expect(page.getByRole("heading", { name: "No run set up" })).toBeVisible();
  await page.getByRole("button", { name: "Set up a run" }).click();
  const form = page.getByRole("form", { name: "Run configuration" });
  await expect(form.getByRole("combobox", { name: "Preset" })).toHaveValue("mid");
  await form.getByRole("combobox", { name: "Preset" }).selectOption("premium");
  await form.getByRole("combobox", { name: "Length" }).selectOption("1");
  const end = monthEnd(today);
  const seoDays = matching(today, end, [1, 3, 5]);
  await expect(form.getByRole("spinbutton", { name: "How many SEO posts" })).toHaveValue(String(seoDays.length));
  // GBP stays, the other channels are switched off: the run becomes Custom.
  for (const name of ["How many LinkedIn posts", "How many Facebook posts", "How many Pinterest pins"]) await form.getByRole("spinbutton", { name }).fill("0");
  await expect(form.getByRole("combobox", { name: "Preset" })).toHaveValue("custom");
  const gbp = seoDays.filter((day) => addDays(day, 1) <= end).length;
  await expect(form.getByRole("status")).toHaveText(`${seoDays.length} SEO posts from ${longDate(seoDays[0])} to ${longDate(seoDays.at(-1)!)}; ${gbp} GBP. The run ends on ${longDate(end)}.`);
  await page.screenshot(shot("run-form"));
  await form.getByRole("button", { name: "Create run" }).click();

  await expect(page.getByRole("heading", { name: "Run 1", level: 2 })).toBeVisible();
  await expect(page.getByText("Setting up", { exact: true }).first()).toBeVisible();
  const all = await slots();
  expect(all.map((row) => row.slot_date)).toEqual(seoDays);
  const children = await derived();
  expect(children).toHaveLength(gbp);
  expect(children.every((child) => child.content_type === "gmb")).toBe(true);
  await expect(page.locator(".app-plan-row")).toHaveCount(seoDays.length);
  const first = page.locator(".app-plan-row").first();
  await expect(first).toContainText("SEO post 1");
  await expect(first.locator(".app-plan-derived-row")).toContainText("GBP post");
  await page.screenshot(shot("run-plan"));
});

test("a topic and moves are kept in place, and the GBP slot follows its SEO post", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/plan`);
  const first = page.locator(".app-plan-row").first();
  await first.getByText("Set topic or date").click();
  await first.getByRole("textbox", { name: "Topic" }).fill("Bathroom renovation cost in Essex");
  await first.getByRole("button", { name: "Set topic" }).click();
  await expect(first).toContainText("Topic set");
  await expect(first).toContainText("Bathroom renovation cost in Essex");

  // Moving the second SEO post a day takes its GBP slot with it.
  const [, second] = await slots();
  const secondRow = page.locator(".app-plan-row").nth(1);
  await secondRow.getByText("Set topic or date").click();
  await secondRow.getByLabel("Date", { exact: true }).fill(addDays(second.slot_date, 1));
  await secondRow.getByRole("button", { name: "Move slot" }).click();
  await expect(secondRow.getByText("Slot moved")).toBeVisible();
  await expect.poll(async () => (await derived()).find((child) => child.parent_post_id === second.id)?.slot_date).toBe(addDays(second.slot_date, 2));

  // A GBP slot cannot go before its SEO post.
  const [firstPost] = await slots();
  const gbp = (await derived()).find((child) => child.parent_post_id === firstPost.id)!;
  const derivedRow = page.locator(".app-plan-row").first().locator(".app-plan-derived-row");
  await derivedRow.getByText("Move date").click();
  await derivedRow.getByLabel("Date for the GBP post").fill(addDays(firstPost.slot_date, -1));
  await derivedRow.getByRole("button", { name: "Move slot" }).click();
  await expect(derivedRow.getByText(/Keep it on or after its SEO post|Choose today or a later date/)).toBeVisible();
  await derivedRow.getByLabel("Date for the GBP post").fill(addDays(gbp.slot_date, 1));
  await derivedRow.getByRole("button", { name: "Move slot" }).click();
  await expect(derivedRow.getByText("Date saved")).toBeVisible();
  expect((await derived()).find((child) => child.id === gbp.id)?.slot_date).toBe(addDays(gbp.slot_date, 1));
});

test("editing the run to Mid regenerates only the empty, unmoved slots", async ({ page, signedIn }) => {
  void signedIn;
  const before = await slots();
  const moved = before[1];
  await page.goto(`/projects/${projectId}/plan`);
  await page.getByRole("button", { name: "Edit run" }).click();
  const form = page.getByRole("form", { name: "Run configuration" });
  // Only SEO weekdays change: Tuesday and Thursday instead of Monday, Wednesday and Friday.
  for (const day of ["Mon", "Wed", "Fri"]) await form.locator(".app-weekday", { hasText: day }).first().click();
  for (const day of ["Tue", "Thu"]) await form.locator(".app-weekday", { hasText: day }).first().click();
  await form.getByRole("button", { name: "Save run" }).click();
  await expect(form).toHaveCount(0);
  const after = await slots();
  // The amount stays, but a month has fewer Tuesdays and Thursdays: the two kept slots plus every free one.
  const [run] = await query<{ ends_on: string }>("select to_char(ends_on, 'YYYY-MM-DD') as ends_on from runs where project_id = $1", [projectId]);
  expect(after).toHaveLength(Math.min(before.length, 2 + matching(today, run.ends_on, [2, 4]).length));
  expect(after.find((row) => row.topic === "Bathroom renovation cost in Essex")).toBeTruthy();
  expect(after.find((row) => row.id === moved.id)).toMatchObject({ slot_date: moved.slot_date });
  const fresh = after.filter((row) => row.topic === null && row.id !== moved.id);
  expect(fresh.every((row) => [2, 4].includes(weekday(row.slot_date)))).toBe(true);
});

test("the next run starts after Run 1, and an overlap is refused", async ({ page, signedIn }) => {
  void signedIn;
  const [run1] = await query<{ ends_on: string }>("select to_char(ends_on, 'YYYY-MM-DD') as ends_on from runs where project_id = $1", [projectId]);
  await page.goto(`/projects/${projectId}/plan`);
  await page.getByRole("button", { name: "Set up the next run" }).click();
  const form = page.getByRole("form", { name: "Run configuration" });
  await expect(form.getByLabel("Starts on")).toHaveValue(addDays(run1.ends_on, 1));
  await form.getByLabel("Starts on").fill(today);
  await form.getByRole("button", { name: "Create run" }).click();
  await expect(form.getByRole("alert")).toContainText(`This run overlaps Run 1`);
  await form.getByLabel("Starts on").fill(addDays(run1.ends_on, 1));
  await form.getByRole("button", { name: "Create run" }).click();
  const runs = page.getByRole("region", { name: "Runs" });
  await expect(runs.getByRole("listitem")).toHaveCount(2);
  await runs.getByRole("link", { name: "Run 2" }).click();
  await expect(page).toHaveURL(/\?run=/);
  await expect(page.getByRole("heading", { name: "Run 2", level: 2 })).toBeVisible();
});

test("a post the retired generator left outside every run is shown, never hidden", async ({ page, signedIn }) => {
  void signedIn;
  await query("insert into posts (project_id, cadence_date, slot_date, status, topic) values ($1, $2, $2, 'topic_set', 'Started before any run')", [projectId, addDays(today, -1)]);
  await page.goto(`/projects/${projectId}/plan`);
  await expect(page.getByRole("region", { name: "Outside any run" })).toContainText("Started before any run");
  await query("delete from posts where topic = 'Started before any run'");
});

test("pausing in Settings keeps the run's slots", async ({ page, signedIn }) => {
  void signedIn;
  const before = await slots();
  await page.goto(`/projects/${projectId}/settings`);
  const form = page.getByRole("form", { name: "Project settings" });
  await form.getByRole("combobox", { name: "Status" }).selectOption("paused");
  await form.getByRole("button", { name: "Save settings" }).click();
  await expect(form.getByText("Settings saved")).toBeVisible();
  expect((await slots()).map((row) => row.id)).toEqual(before.map((row) => row.id));
  await page.goto("/projects");
  const card = page.getByRole("link", { name: /Migss Interiors Website/ });
  await expect(card).toContainText("Paused");
  await expect(card).toContainText("Run 1");
  await page.goto(`/projects/${projectId}/settings`);
  await page.getByRole("form", { name: "Project settings" }).getByRole("combobox", { name: "Status" }).selectOption("active");
  await page.getByRole("form", { name: "Project settings" }).getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
});

test("the Posts page lists posts with a topic and filters by status and client", async ({ page, signedIn }) => {
  void signedIn;
  const [{ id: otherProject }] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, package, status) values ($1, 'Another site', 'https://example.com', 'entry', 'paused') returning id",
    [otherClientId],
  );
  await query("insert into posts (project_id, slot_date, status, topic) values ($1, $2, 'in_review', 'Another client post')", [otherProject, addDays(today, 3)]);

  await page.goto("/posts");
  const table = page.getByRole("table", { name: "Posts" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table).toContainText("Bathroom renovation cost in Essex");
  await expect(table).toContainText("Another client post");
  await expect(table).not.toContainText("No topic yet");
  const filters = page.getByRole("navigation", { name: "Filter by status" });
  await expect(filters.getByRole("link")).toHaveText(["All", "Topic set", "Needs review"]);
  await expect(filters.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  await page.screenshot(shot("posts"));

  await filters.getByRole("link", { name: "Needs review" }).click();
  await expect(page).toHaveURL(/status=in_review/);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Another client post");

  await filters.getByRole("link", { name: "All" }).click();
  await expect(page).toHaveURL(/\/posts$/);
  await expect(filters.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("combobox", { name: "Client" }).selectOption(migssId);
  await expect(page).toHaveURL(new RegExp(`client=${migssId}`));
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Bathroom renovation cost in Essex");

  await table.getByRole("link", { name: "Bathroom renovation cost in Essex" }).click();
  await expect(page).toHaveURL(/\/calendar\?month=.*&slot=/);
  await expect(page.getByRole("complementary", { name: "Selected slot" }).getByRole("heading")).toHaveText("Bathroom renovation cost in Essex");
  await query("delete from posts where project_id = $1", [otherProject]);
  await query("delete from projects where id = $1", [otherProject]);
});

test("cards show the next slot in the run plan", async ({ page, signedIn }) => {
  void signedIn;
  const next = (await slots()).find((row) => row.slot_date >= today)!;
  const label = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${next.slot_date}T00:00:00Z`));
  await page.goto("/projects");
  await expect(page.getByRole("link", { name: /Migss Interiors Website/ })).toContainText(`Next in run plan${label} · ${next.topic ?? "No topic yet"}`);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Projects" }).getByRole("link", { name: /Migss Interiors Website/ })).toContainText(`Next post ${label}`);
  await page.screenshot(shot("cards-home"));
});

test("phone width: Run plan and Posts fit without sideways scrolling", async ({ page, signedIn }) => {
  void signedIn;
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.goto(`/projects/${projectId}/plan`);
  await expect(page.locator(".app-plan-row").first()).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot(shot("run-plan-mobile"));
  await page.getByRole("button", { name: "Edit run" }).click();
  await expect(page.getByRole("form", { name: "Run configuration" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot(shot("run-form-mobile"));
  await page.goto("/posts");
  await expect(page.getByRole("table", { name: "Posts" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot(shot("posts-mobile"));
});
