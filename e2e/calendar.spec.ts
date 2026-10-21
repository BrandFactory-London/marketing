import { expect, query, test } from "./fixtures";

// γ3.2: the calendar page and Home's two weeks, against the local test database. "Today" is the real
// London date, so dates are worked out here the same way the app does.

test.describe.configure({ mode: "serial" });

const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });

let clientId = "";
let projectId = "";
const today = londonToday();

test.beforeAll(async () => {
  await query("delete from posts");
  await query("delete from site_pages");
  await query("delete from knowledge_versions");
  await query("delete from projects");
  await query("delete from clients");
  [{ id: clientId }] = await query<{ id: string }>("insert into clients (name) values ('Migss Interiors') returning id");
  [{ id: projectId }] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, package, status) values ($1, 'Migss Interiors Website', 'https://www.migssinteriors.com', 'premium', 'active') returning id",
    [clientId],
  );
});

async function slotRows() {
  return query<{ id: string; slot_date: string; cadence_date: string; status: string; topic: string | null }>(
    "select id, to_char(slot_date, 'YYYY-MM-DD') as slot_date, to_char(cadence_date, 'YYYY-MM-DD') as cadence_date, status, topic from posts where project_id = $1 order by slot_date, created_at",
    [projectId],
  );
}

test("opening the calendar plans eight weeks of Mon, Wed and Fri slots", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BrandFactory calendar");
  const rows = await slotRows();
  expect(rows).toHaveLength(24);
  expect(new Set(rows.map((row) => weekday(row.slot_date)))).toEqual(new Set([1, 3, 5]));
  expect(rows[0].slot_date >= today && rows.at(-1)!.slot_date <= addDays(today, 55)).toBe(true);
  // Reloading tops up nothing new.
  await page.reload();
  expect(await slotRows()).toHaveLength(24);

  const month = page.getByRole("grid", { name: "Month" });
  const visible = rows.filter((row) => row.slot_date <= addDays(today, 41));
  await expect(month.getByRole("link").first()).toBeVisible();
  const inGrid = await month.getByRole("link").count();
  expect(inGrid).toBeGreaterThan(0);
  expect(inGrid).toBeLessThanOrEqual(visible.length);
  await expect(month.getByRole("link").first()).toHaveAccessibleName(/^No topic yet, Migss Interiors Website, Planned, /);
  await expect(page.getByRole("list", { name: "Legend" })).toContainText("Planned");
  await expect(page.getByRole("complementary", { name: "Selected slot" })).toContainText("Select a slot");
});

test("selecting a slot sets its topic", async ({ page, signedIn }) => {
  void signedIn;
  const [first] = await slotRows();
  await page.goto(`/calendar?month=${first.slot_date.slice(0, 7)}&slot=${first.id}`);
  const panel = page.getByRole("complementary", { name: "Selected slot" });
  await expect(panel.getByRole("heading")).toHaveText("No topic yet");
  await expect(panel).toContainText("Planned");
  await panel.getByRole("textbox", { name: "Topic" }).fill("Wet room or shower tray");
  await panel.getByRole("button", { name: "Set topic" }).click();
  await expect(panel.getByRole("heading")).toHaveText("Wet room or shower tray");
  await expect(panel).toContainText("Topic set");
  await expect(page.getByRole("grid", { name: "Month" }).getByRole("link", { name: /^Wet room or shower tray, / })).toBeVisible();
  const [row] = (await slotRows()).filter((slot) => slot.id === first.id);
  expect(row).toMatchObject({ status: "topic_set", topic: "Wet room or shower tray" });
  await page.screenshot(shot("calendar-topic"));
});

test("moving a slot keeps one slot for that cadence day", async ({ page, signedIn }) => {
  void signedIn;
  const rows = await slotRows();
  const target = rows.find((row) => row.slot_date > today && row.topic === null)!;
  const newDate = addDays(target.slot_date, 1);
  await page.goto(`/calendar?month=${target.slot_date.slice(0, 7)}&slot=${target.id}`);
  const panel = page.getByRole("complementary", { name: "Selected slot" });
  await panel.getByLabel("Date").fill("2020-01-01");
  await panel.getByRole("button", { name: "Move slot" }).click();
  await expect(panel.getByText("Choose today or a later date.")).toBeVisible();
  await panel.getByLabel("Date").fill(newDate);
  await panel.getByRole("button", { name: "Move slot" }).click();
  await expect(panel.getByText("Slot moved")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`month=${newDate.slice(0, 7)}.*slot=${target.id}`));
  await page.reload();
  const after = await slotRows();
  expect(after).toHaveLength(24);
  expect(after.filter((row) => row.slot_date === target.slot_date)).toHaveLength(0);
  expect(after.find((row) => row.id === target.id)).toMatchObject({ slot_date: newDate, cadence_date: target.slot_date });
});

test("a past slot with no writing shows as missed", async ({ page, signedIn }) => {
  void signedIn;
  const yesterday = addDays(today, -1);
  const [missed] = await query<{ id: string }>(
    "insert into posts (project_id, cadence_date, slot_date, status) values ($1, $2, $2, 'planned') returning id",
    [projectId, yesterday],
  );
  await page.goto(`/calendar?month=${yesterday.slice(0, 7)}&slot=${missed.id}`);
  const panel = page.getByRole("complementary", { name: "Selected slot" });
  await expect(panel).toContainText("Missed");
  await expect(page.getByRole("list", { name: "Legend" })).toContainText("Missed");
  await expect(page.getByRole("link", { name: new RegExp(`No topic yet, Migss Interiors Website, Planned, Missed`) }).first()).toBeVisible();
});

test("the project filter and month arrows change what is shown", async ({ page, signedIn }) => {
  void signedIn;
  const [{ id: other }] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, package, status) values ($1, 'Second site', 'https://example.com', 'entry', 'active') returning id",
    [clientId],
  );
  await page.goto("/calendar");
  const month = page.getByRole("grid", { name: "Month" });
  await expect(month.getByRole("link", { name: /Second site/ }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Project" }).selectOption(other);
  await expect(page).toHaveURL(new RegExp(`project=${other}`));
  await expect(month.getByRole("link", { name: /Migss Interiors Website/ })).toHaveCount(0);
  await expect(month.getByRole("link", { name: /Second site/ }).first()).toBeVisible();
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page).toHaveURL(/month=\d{4}-\d{2}.*project=/);
  await expect(page.getByRole("link", { name: "Back to this month" })).toBeVisible();
  await query("delete from posts where project_id = $1", [other]);
  await query("delete from projects where id = $1", [other]);
});

test("Home shows the next two weeks from the same slots", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/");
  const weeks = page.getByRole("grid", { name: "Next two weeks" });
  await expect(weeks.getByRole("gridcell").first()).toContainText("Today,");
  const expected = (await slotRows()).filter((row) => row.slot_date >= today && row.slot_date <= addDays(today, 13));
  await expect(weeks.getByRole("link")).toHaveCount(expected.length);
  // The topic was set on the first slot from today, so it is always inside the two weeks.
  await page.screenshot(shot("calendar-home"));
  await weeks.getByRole("link", { name: /^Wet room or shower tray, / }).click();
  await expect(page).toHaveURL(/\/calendar\?month=.*&slot=/);
  await expect(page.getByRole("complementary", { name: "Selected slot" }).getByRole("heading")).toHaveText("Wet room or shower tray");
});

test("phones get a list of days instead of the grid, with no sideways scroll", async ({ page, signedIn }) => {
  void signedIn;
  await page.setViewportSize({ width: 390, height: 844 });
  const [first] = await slotRows();
  await page.goto(`/calendar?month=${first.slot_date.slice(0, 7)}`);
  await expect(page.getByRole("grid", { name: "Month" })).toBeHidden();
  await expect(page.getByRole("link", { name: /^Wet room or shower tray, / })).toBeVisible();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot(shot("calendar-mobile"));
  await page.getByRole("link", { name: /^Wet room or shower tray, / }).click();
  await expect(page.getByRole("complementary", { name: "Selected slot" }).getByRole("heading")).toHaveText("Wet room or shower tray");
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot(shot("calendar-mobile-selected"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Next two weeks" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Wet room or shower tray, / })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Next two weeks" })).toBeHidden();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot(shot("calendar-mobile-home"));
});
