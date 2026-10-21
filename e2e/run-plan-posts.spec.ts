import { expect, query, test, resetDomain } from "./fixtures";

// γ3.3: the Run plan tab, the Posts page and the project cards, plus the smoke's pause and package
// changes made through the real Settings form.

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

test("the Run plan lists eight weeks of slots and edits them in place", async ({ page, signedIn }) => {
  void signedIn;
  const yesterday = addDays(today, -1);
  await query("insert into posts (project_id, cadence_date, slot_date, status) values ($1, $2, $2, 'planned')", [projectId, yesterday]);
  await page.goto(`/projects/${projectId}/plan`);
  await expect(page.getByText("Premium package: 3 planned slots a week, kept eight weeks ahead. Give each one a topic.")).toBeVisible();
  await expect(page.locator(".app-plan-row")).toHaveCount(25);
  // The missed slot comes first.
  await expect(page.locator(".app-plan-row").first()).toContainText("Missed");

  const all = await slots();
  const future = all.filter((row) => row.slot_date >= today);
  expect(future).toHaveLength(24);
  const first = page.locator(".app-plan-row").nth(1);
  await first.getByText("Set topic or date").click();
  await first.getByRole("textbox", { name: "Topic" }).fill("Bathroom renovation cost in Essex");
  await first.getByRole("button", { name: "Set topic" }).click();
  await expect(first).toContainText("Topic set");
  await expect(first).toContainText("Bathroom renovation cost in Essex");
  await page.screenshot(shot("run-plan"));
});

test("pausing in Settings removes empty future slots and keeps the topic", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/settings`);
  const form = page.getByRole("form", { name: "Project settings" });
  await form.getByRole("combobox", { name: "Status" }).selectOption("paused");
  await form.getByRole("button", { name: "Save settings" }).click();
  await expect(form.getByText("Settings saved")).toBeVisible();
  const after = await slots();
  expect(after.filter((row) => row.slot_date >= today).map((row) => row.topic)).toEqual(["Bathroom renovation cost in Essex"]);
  // The missed slot in the past is kept.
  expect(after.filter((row) => row.slot_date < today)).toHaveLength(1);

  await page.goto("/projects");
  const card = page.getByRole("link", { name: /Migss Interiors Website/ });
  await expect(card).toContainText("Paused");
  await expect(card).toContainText("Bathroom renovation cost in Essex");
});

test("resuming, then switching to Mid and back, ends with the same cadence and the topic intact", async ({ page, signedIn }) => {
  void signedIn;
  const save = async (status: string, pkg: string) => {
    await page.goto(`/projects/${projectId}/settings`);
    const form = page.getByRole("form", { name: "Project settings" });
    await form.getByRole("combobox", { name: "Status" }).selectOption(status);
    await form.getByRole("combobox", { name: "Marketing package" }).selectOption(pkg);
    await form.getByRole("button", { name: "Save settings" }).click();
    await expect(form.getByText("Settings saved")).toBeVisible();
    return (await slots()).filter((row) => row.slot_date >= today);
  };
  const resumed = await save("active", "premium");
  expect(resumed).toHaveLength(24);
  const mid = await save("active", "mid");
  const midEmpty = mid.filter((row) => row.topic === null);
  expect(new Set(midEmpty.map((row) => weekday(row.cadence_date)))).toEqual(new Set([2, 4]));
  expect(midEmpty).toHaveLength(16);
  expect(mid.filter((row) => row.topic !== null).map((row) => row.topic)).toEqual(["Bathroom renovation cost in Essex"]);
  const back = await save("active", "premium");
  expect(back).toHaveLength(24);
  expect(new Set(back.map((row) => weekday(row.cadence_date)))).toEqual(new Set([1, 3, 5]));
  expect(back.filter((row) => row.topic !== null)).toHaveLength(1);
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
  await page.goto("/posts");
  await expect(page.getByRole("table", { name: "Posts" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot(shot("posts-mobile"));
});
