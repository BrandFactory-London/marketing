import { expect, query, resetDomain, test } from "./fixtures";

// γ4.3: pillar tags, the batch form and the spec confirmation page. Trigger.dev is the local stand-in;
// the test plays the draft-spec task's part by writing the proposed spec to the database.

test.describe.configure({ mode: "serial" });

const STANDIN = "http://localhost:3199";
const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });
const triggered = async () => (await (await fetch(`${STANDIN}/__triggered`)).json()) as { task: string; payload: Record<string, string> }[];
const resetStandin = (fail = 0) => fetch(`${STANDIN}/__reset?fail=${fail}`, { method: "POST" });

let projectId = "";
let postIds: string[] = [];
let batchId = "";

test.beforeAll(async () => {
  await resetDomain();
  const [{ id: clientId }] = await query<{ id: string }>("insert into clients (name) values ('Migss Interiors') returning id");
  [{ id: projectId }] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, package, status) values ($1, 'Migss Interiors Website', 'https://www.migssinteriors.com', 'entry', 'paused') returning id",
    [clientId],
  );
  await query("insert into knowledge_versions (tier, project_id, version, sections) values ('project', $1, 1, $2)", [
    projectId,
    JSON.stringify({ icps: "", project_facts: "", cta: "Book a free design consultation at /contact.", allowed_links: "/contact" }),
  ]);
  const rows = await query<{ id: string }>(
    `insert into posts (project_id, status, slot_date, topic) values
       ($1, 'topic_set', current_date + 7, 'Wet room or shower tray: which suits your bathroom?'),
       ($1, 'topic_set', current_date + 14, 'How much does a bathroom renovation cost in Essex?')
     returning id`,
    [projectId],
  );
  postIds = rows.map((row) => row.id);
  await resetStandin();
});

test("project Settings adds and removes pillar tags", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/settings`);
  const pillars = page.locator(".bfm-card", { has: page.getByRole("heading", { name: "Pillar tags" }) });
  await pillars.getByRole("textbox", { name: "Pillar name" }).fill("Bathroom Renovation");
  await pillars.getByRole("button", { name: "Add pillar" }).click();
  await expect(pillars.getByText("Pillar added: Bathroom Renovation")).toBeVisible();
  await expect(pillars.getByText("bathroom-renovation")).toBeVisible();
  await pillars.getByRole("textbox", { name: "Pillar name" }).fill("Kitchen Renovation");
  await pillars.getByRole("textbox", { name: "Tag" }).fill("Kitchen Renovation");
  await pillars.getByRole("button", { name: "Add pillar" }).click();
  await expect(pillars.getByText("Use lower-case letters, numbers and single hyphens, such as bathroom-renovation.")).toBeVisible();
  await pillars.getByRole("textbox", { name: "Tag" }).fill("kitchen-renovation");
  await pillars.getByRole("button", { name: "Add pillar" }).click();
  await expect(pillars.getByText("kitchen-renovation")).toBeVisible();
  await pillars.getByRole("textbox", { name: "Pillar name" }).fill("Spare");
  await pillars.getByRole("button", { name: "Add pillar" }).click();
  await pillars.getByRole("button", { name: "Remove pillar Spare" }).click();
  await expect(pillars.getByText("spare", { exact: true })).toHaveCount(0);
  expect(await query("select slug from project_pillars where project_id = $1 order by position", [projectId])).toEqual([
    { slug: "bathroom-renovation" },
    { slug: "kitchen-renovation" },
  ]);
  await page.screenshot(shot("g4-pillars"));
});

test("Create content opens the batch form with the project's slots and CTA", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/knowledge`);
  await page.getByRole("link", { name: "Create content" }).click();
  await page.waitForURL(`**/batches/new?project=${projectId}`);
  await expect(page.getByRole("heading", { name: "New batch" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Call to action" })).toHaveValue("Book a free design consultation at /contact.");
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await expect(page.locator(".bfm-step-current")).toHaveText("1Spec");

  // Mistakes are explained and the choices kept.
  await page.getByRole("textbox", { name: "Fewest words" }).fill("2000");
  await page.getByRole("textbox", { name: "Most words" }).fill("1000");
  await page.getByRole("combobox", { name: "Pillar", exact: true }).selectOption({ label: "Bathroom Renovation" });
  await page.getByRole("button", { name: "Draft the specs" }).click();
  await expect(page.getByText("The second number must be at least the first.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Pillar", exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await page.screenshot(shot("g4-batch-form"));

  await page.getByRole("textbox", { name: "Most words" }).fill("2500");
  await page.getByRole("combobox", { name: "Pillar for this post" }).nth(1).selectOption({ label: "Kitchen Renovation" });
  await page.getByRole("textbox", { name: "Note for this post" }).first().fill("Mention Chigwell.");
  await page.getByRole("button", { name: "Draft the specs" }).click();
  await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/);
  batchId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: "Confirm the spec" })).toBeVisible();
  await expect(page.getByText("Drafting spec")).toHaveCount(2);

  const runs = await triggered();
  expect(runs.map((run) => run.task)).toEqual(["draft-spec", "draft-spec"]);
  const specs = await query<{ id: string; notes: string | null; pillar: string | null }>(
    `select s.id, s.notes, pp.slug as pillar from post_specs s join posts p on p.id = s.post_id
     left join project_pillars pp on pp.id = p.pillar_id where s.batch_id = $1 order by p.slot_date`,
    [batchId],
  );
  expect(specs.map((spec) => [spec.notes, spec.pillar])).toEqual([
    ["Mention Chigwell.", "bathroom-renovation"],
    [null, "kitchen-renovation"],
  ]);
  expect(runs.map((run) => run.payload.specId).sort()).toEqual(specs.map((spec) => spec.id).sort());
});

test("the spec page shows proposed specs as the task fills them in, then edits and confirms them", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/batches/${batchId}`);
  await expect(page.getByText("Drafting spec")).toHaveCount(2);
  // The draft-spec task's part.
  await query(
    `update post_specs set status = 'proposed', keyword = 'wet room or shower tray', post_type = 'comparison', location = 'Chigwell',
       angle = 'Answer the question in the first paragraph.', outline = '["What each one is","Cost and time","Book a free design consultation"]',
       facts = '["Bathrooms take two to six weeks on site."]', links = '["/contact"]', faq = true
     where batch_id = $1 and status = 'drafting'`,
    [batchId],
  );
  // The page refreshes itself while specs are drafting.
  await expect(page.getByText("To confirm")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByText("Keyword: wet room or shower tray").first()).toBeVisible();
  await expect(page.getByText("0 of 2 specs confirmed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate 2 posts" })).toBeDisabled();
  await page.screenshot(shot("g4-spec-confirm"));

  const second = page.locator(".app-spec").nth(1);
  await second.getByRole("button", { name: "Edit spec" }).click();
  await second.getByRole("textbox", { name: "Primary keyword" }).fill("bathroom renovation cost essex");
  await second.getByRole("textbox", { name: "Internal links" }).fill("https://example.com");
  await second.getByRole("button", { name: "Save spec" }).click();
  await expect(second.getByText('"https://example.com" is not a path.', { exact: false })).toBeVisible();
  await second.getByRole("textbox", { name: "Internal links" }).fill("/contact\n/renovation-services/bathroom");
  await second.getByRole("button", { name: "Save spec" }).click();
  await expect(second.getByText("Keyword: bathroom renovation cost essex")).toBeVisible();
  await expect(second.getByText("/contact, /renovation-services/bathroom")).toBeVisible();

  await page.locator(".app-spec").first().getByRole("button", { name: "Confirm spec" }).click();
  await expect(page.getByText("1 of 2 specs confirmed")).toBeVisible();
  await page.getByRole("button", { name: "Confirm all" }).click();
  await expect(page.getByText("2 of 2 specs confirmed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate 2 posts" })).toBeEnabled();
  expect(await query("select status from posts where batch_id = $1", [batchId])).toEqual([{ status: "spec_confirmed" }, { status: "spec_confirmed" }]);
});

test("a redraft makes a new version, and a trigger that fails shows on the card", async ({ page, signedIn }) => {
  void signedIn;
  await resetStandin(1);
  await page.goto(`/batches/${batchId}`);
  const first = page.locator(".app-spec").first();
  await first.getByRole("button", { name: "Redraft with a note" }).click();
  await first.getByRole("textbox", { name: "Note for the writer" }).fill("Lead with the price range.");
  await first.getByRole("button", { name: "Redraft spec" }).click();
  await expect(first.getByText("Spec not drafted")).toBeVisible();
  await expect(first.getByText("Trigger.dev could not be reached, so this spec was not started. Redraft the spec to try again.")).toBeVisible();
  await expect(page.getByText("1 of 2 specs confirmed")).toBeVisible();

  await first.getByRole("button", { name: "Redraft spec" }).click();
  await first.getByRole("button", { name: "Redraft spec" }).click();
  await expect(first.getByText("Drafting spec")).toBeVisible();
  const versions = await query<{ version: number; status: string; redraft_note: string | null }>(
    "select version, status, redraft_note from post_specs where post_id = $1 order by version",
    [postIds[0]],
  );
  expect(versions).toEqual([
    { version: 1, status: "superseded", redraft_note: null },
    { version: 2, status: "failed", redraft_note: "Lead with the price range." },
    { version: 3, status: "drafting", redraft_note: null },
  ]);
  expect((await triggered()).map((run) => run.task)).toEqual(["draft-spec"]);
});

test("the calendar links a slot in a batch to its batch", async ({ page, signedIn }) => {
  void signedIn;
  const [{ month }] = await query<{ month: string }>("select to_char(slot_date, 'YYYY-MM') as month from posts where id = $1", [postIds[1]]);
  await page.goto(`/calendar?month=${month}&slot=${postIds[1]}`);
  await expect(page.getByRole("link", { name: "Open batch" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Topic" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Generate from planned slots" })).toHaveAttribute("href", "/batches/new");
});

test("phone width: the batch form and spec page fit", async ({ page, signedIn }) => {
  void signedIn;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/batches/${batchId}`);
  await expect(page.getByRole("heading", { name: "Confirm the spec" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot(shot("g4-spec-confirm-phone"));
  await query("insert into posts (project_id, status, slot_date, topic) values ($1, 'topic_set', current_date + 21, 'Kitchen layouts that work')", [projectId]);
  await page.goto(`/batches/new?project=${projectId}`);
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot(shot("g4-batch-form-phone"));
});
