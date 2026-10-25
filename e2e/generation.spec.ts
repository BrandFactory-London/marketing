import { expect, query, resetDomain, seedRun, test } from "./fixtures";

// Phase 2 A4: activating a planned run generates its first fortnight in the half-price batch; later posts show when
// they will be written, and Generate now writes one at once. The Trigger.dev stand-in records each run.

test.describe.configure({ mode: "serial" });

const TRIGGER = "http://localhost:3199";
const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });
type Triggered = { id: string; task: string; payload: Record<string, string> };
const triggered = async () => (await (await fetch(`${TRIGGER}/__triggered`)).json()) as Triggered[];

let projectId = "";
let runId = "";

test.beforeAll(async () => {
  await resetDomain();
  await fetch(`${TRIGGER}/__reset`, { method: "POST" });
  const [{ id: clientId }] = await query<{ id: string }>("insert into clients (name) values ('Migss Interiors') returning id");
  [{ id: projectId }] = await query<{ id: string }>("insert into projects (client_id, name, site_url, status) values ($1, 'Migss Interiors Website', 'https://www.migssinteriors.com', 'active') returning id", [clientId]);
  // Eight weeks of Tuesdays with an approved plan: four weeks are generated at once, the rest later.
  runId = await seedRun(projectId, [2], { weeks: 8, preset: "entry", status: "plan_approved" });
  const slots = await query<{ id: string }>("select id from posts where run_id = $1 order by slot_date", [runId]);
  for (const [index, slot] of slots.entries()) {
    await query("update posts set status = 'topic_set', topic = $2, planned_excerpt = $3, topic_set_at = now() where id = $1", [slot.id, `Planned post ${index + 1}`, `Excerpt ${index + 1}.`]);
  }
});

test("Activate run generates the first four weeks in the half-price batch and shows the next generation", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/plan`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Activate run" }).click();
  await expect(page.locator(".app-run-head").first()).toContainText("Active");
  const run = (await triggered()).find((item) => item.task === "batch-round")!;
  const [batch] = await query<{ id: string; name: string; run_id: string }>("select id, name, run_id from batches where id = $1", [run.payload.batchId]);
  expect(batch.run_id).toBe(runId);
  const specs = await query<{ auto: boolean; status: string; notes: string }>("select auto, status, notes from post_specs where batch_id = $1", [batch.id]);
  expect(specs.length).toBeGreaterThanOrEqual(3);
  expect(specs.every((spec) => spec.auto && spec.status === "drafting" && spec.notes.startsWith("Planned excerpt, from the approved plan:"))).toBe(true);
  const [{ next }] = await query<{ next: string; auto: boolean }>("select to_char(next_generation_on, 'YYYY-MM-DD') as next, auto_generate as auto from runs where id = $1", [runId]);
  expect(next).toBeTruthy();

  await page.reload();
  await expect(page.getByText(/^Next generation: .+, \d+ posts?$/)).toBeVisible();
  await expect(page.getByText(/^Generates on /).first()).toBeVisible();
  await page.screenshot(shot("a4-run-active"));
});

test("a spec drafted from the plan says so, and Generate now writes a later post at once", async ({ page, signedIn }) => {
  void signedIn;
  const run = (await triggered()).find((item) => item.task === "batch-round")!;
  const [spec] = await query<{ id: string }>("select id from post_specs where batch_id = $1 limit 1", [run.payload.batchId]);
  await query("update post_specs set status = 'proposed', keyword = 'bathroom', post_type = 'guide', angle = 'Answer first.', outline = '[\"Book\"]', facts = '[]', links = '[]', faq = false where id = $1", [spec.id]);
  await page.goto(`/batches/${run.payload.batchId}`);
  await expect(page.getByText("Spec drafted from the approved plan").first()).toBeVisible();

  await page.goto(`/projects/${projectId}/plan`);
  const later = page.locator(".app-plan-row").filter({ hasText: /Generates on/ }).first();
  await expect(later).toContainText("Full price, starts at once.");
  await later.getByRole("button", { name: "Generate now" }).click();
  await expect.poll(async () => (await triggered()).some((item) => item.task === "generate-now")).toBe(true);
  const now = (await triggered()).find((item) => item.task === "generate-now")!;
  const [made] = await query<{ auto: boolean; batch_run: string }>("select s.auto, b.run_id as batch_run from post_specs s join batches b on b.id = s.batch_id where s.id = $1", [now.payload.specId]);
  expect(made).toEqual({ auto: true, batch_run: runId });
});

test("Generate the next fortnight now sends only posts within four weeks that are not in a batch, and the phone layout fits", async ({ page, signedIn }) => {
  void signedIn;
  // The first generation day has passed: a fortnight later, the rest of the run is due.
  await query("update runs set next_generation_on = (now() at time zone 'Europe/London')::date where id = $1", [runId]);
  await page.goto(`/projects/${projectId}/plan`);
  await page.getByRole("button", { name: "Generate the next fortnight now" }).click();
  // Every post within four weeks is already in a batch, so there is nothing new to send.
  await expect(page.getByText("No planned posts fall in the next four weeks.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot(shot("a4-run-active-mobile"));
});
