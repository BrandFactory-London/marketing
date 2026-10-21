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

test("Generate starts one run per post and the Generating screen follows them by polling", async ({ page, signedIn }) => {
  void signedIn;
  await resetStandin();
  // The redrafted spec comes back and is confirmed, as the task and Amir would do it.
  await query(
    `update post_specs set status = 'confirmed', confirmed_at = now(), keyword = 'wet room or shower tray', post_type = 'comparison',
       angle = 'Answer first.', outline = '["What each one is"]', facts = '[]', links = '["/contact"]', faq = false
     where post_id = $1 and status = 'drafting'`,
    [postIds[0]],
  );
  await query("update posts set status = 'spec_confirmed' where id = $1", [postIds[0]]);
  await page.goto(`/batches/${batchId}`);
  await page.getByRole("button", { name: "Generate 2 posts" }).click();
  await page.waitForURL(`**/batches/${batchId}/generating`);
  await expect(page.getByRole("heading", { name: "Generating" })).toBeVisible();
  await expect(page.getByText("Queued", { exact: true })).toHaveCount(2);
  await expect(page.locator(".bfm-aurora-active")).toBeVisible();
  const runs = await triggered();
  expect(runs.map((run) => run.task)).toEqual(["generate-post", "generate-post"]);
  const generations = await query<{ id: string; post_id: string; trigger_run_id: string }>(
    "select id, post_id, trigger_run_id from post_generations where batch_id = $1 order by created_at",
    [batchId],
  );
  expect(generations.map((row) => row.trigger_run_id).sort()).toEqual(runs.map((run) => (run as unknown as { id: string }).id).sort());

  // The generate-post task's part: post A writes, checks and passes; post B could not finish.
  const a = generations.find((row) => row.post_id === postIds[0])!;
  const b = generations.find((row) => row.post_id === postIds[1])!;
  await query(
    `update post_generations set status = 'running', round = 1, started_at = now(), updated_at = now(),
       project_version_id = (select id from knowledge_versions where project_id = $2 and version = 1)
     where id = $1`,
    [a.id, projectId],
  );
  await query("update posts set status = 'generating', generation_step = 'writer' where id = $1", [postIds[0]]);
  await expect(page.getByText("Writing", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.screenshot(shot("g4-generating"));

  const [{ id: callId }] = await query<{ id: string }>(
    `insert into ai_calls (batch_id, post_id, purpose, requested_model, served_model, prompt_version, effort, input_tokens, output_tokens, cache_read_tokens, cost_usd)
     values ($1, $2, 'writer', 'claude-opus-5-5', 'claude-opus-5-5', 'writer-1', 'high', 5800, 8000, 1200, 0.18344) returning id`,
    [batchId, postIds[0]],
  );
  const body = "# Wet room or shower tray?\n\nExcerpt: Which one suits a small bathroom.\n\nA wet room suits small rooms. <b>raw html</b>\n\n## Book a free design consultation\n\n[Contact us](/contact).";
  const [{ id: draftId }] = await query<{ id: string }>(
    `insert into post_drafts (generation_id, round, title, excerpt, body_md, word_count, checks, checks_passed, ai_call_id)
     values ($1, 1, 'Wet room or shower tray?', 'Which one suits a small bathroom.', $2, 1850, $3, true, $4) returning id`,
    [a.id, body, JSON.stringify({ passed: true, issues: [], title: "Wet room or shower tray?", excerpt: "x", wordCount: 1850, info: { links: ["/contact"], placeholders: [], moneyFigures: [], yearsClaims: [], percentages: [], h2: 1 } }), callId],
  );
  const [{ id: criticCall }] = await query<{ id: string }>(
    `insert into ai_calls (batch_id, post_id, purpose, requested_model, served_model, prompt_version, effort, input_tokens, output_tokens, cost_usd)
     values ($1, $2, 'critic', 'claude-opus-5-5', 'claude-opus-5-5', 'critic-1', 'high', 10000, 4000, 0.12) returning id`,
    [batchId, postIds[0]],
  );
  await query(
    `insert into critic_verdicts (draft_id, verdict, summary, issues, scores, ai_call_id) values ($1, 'pass', 'Clear and specific.', $2, $3, $4)`,
    [draftId, JSON.stringify([{ quote: "suits small rooms", category: "voice", note: "Could name a room size.", severity: "minor" }]), JSON.stringify({ voice: 8, usefulness: 8, specificity: 7 }), criticCall],
  );
  await query("update post_generations set status = 'in_review', finished_at = now(), updated_at = now() where id = $1", [a.id]);
  await query("update posts set status = 'in_review', generation_step = null where id = $1", [postIds[0]]);
  await query("update post_generations set status = 'failed', error = 'claude-opus-5-5 declined to write this. Retry the post, or choose another model for the batch.', finished_at = now() where id = $1", [b.id]);
  await query("update posts set status = 'spec_confirmed' where id = $1", [postIds[1]]);

  await expect(page.getByText("2 of 2 posts finished")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".bfm-aurora-active")).toHaveCount(0);
  await expect(page.locator(".bfm-progress")).toHaveCount(0);
  await expect(page.getByText("Could not finish")).toBeVisible();
  await expect(page.getByText("declined to write this", { exact: false })).toBeVisible();
  await expect(page.getByText("1,850 words", { exact: false })).toBeVisible();
  await expect(page.getByText("$0.30", { exact: false }).first()).toBeVisible();
  await page.screenshot(shot("g4-generating-done"));

  await page.getByRole("button", { name: "Retry post" }).click();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  expect((await triggered()).map((run) => run.task)).toEqual(["generate-post", "generate-post", "generate-post"]);
  expect(await query("select status from post_generations where post_id = $1 order by created_at", [postIds[1]])).toEqual([{ status: "failed" }, { status: "queued" }]);
});

test("the review queue lists the drafted post and the draft view shows it read only", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/review");
  await expect(page.locator(".bfm-step-current")).toHaveText("4Review");
  await page.getByRole("link", { name: /Wet room or shower tray\?/ }).click();
  await page.waitForURL(`**/posts/${postIds[0]}`);
  await expect(page.getByRole("heading", { name: "Wet room or shower tray?", level: 1 })).toBeVisible();
  await expect(page.getByText("Which one suits a small bathroom.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Book a free design consultation", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "https://www.migssinteriors.com/contact");
  // Raw HTML in a draft is never rendered.
  await expect(page.locator(".app-draft-body b")).toHaveCount(0);
  await expect(page.getByText("Critic passed it")).toBeVisible();
  await expect(page.getByText("Claude Opus 5.5: Clear and specific.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Writer call 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "version 1" })).toHaveAttribute("href", `/projects/${projectId}/knowledge?version=1`);
  await page.screenshot(shot("g4-draft"));

  const [{ month }] = await query<{ month: string }>("select to_char(slot_date, 'YYYY-MM') as month from posts where id = $1", [postIds[0]]);
  await page.goto(`/calendar?month=${month}&slot=${postIds[0]}`);
  await expect(page.getByRole("link", { name: "Open post" })).toHaveAttribute("href", `/posts/${postIds[0]}`);
});

test("Connections shows the Trigger.dev environment and runs the Anthropic check through it", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/settings/connections");
  await expect(page.getByText("Specs and posts are written by tasks in Development.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Check connection" }).click();
  // The stand-in accepts the run but cannot report on it, so the check says so plainly.
  await expect(page.getByText("Not working")).toBeVisible({ timeout: 10_000 });
  expect((await triggered()).at(-1)?.task).toBe("check-anthropic");
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
