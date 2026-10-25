import { expect, query, resetDomain, seedRun, test } from "./fixtures";

// Phase 2 A3: plan a run, regenerate an item, share it with the client, take the client's comment and approval, approve
// and activate. The Trigger.dev stand-in records each run; the test plays the planner's part in the database.

test.describe.configure({ mode: "serial" });

const TRIGGER = "http://localhost:3199";
const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });

let projectId = "";
let runId = "";
let link = "";

type Triggered = { id: string; task: string; payload: Record<string, string> };
const triggered = async () => (await (await fetch(`${TRIGGER}/__triggered`)).json()) as Triggered[];

// The planner's part: one item per slot (or one slot), then the draft is done.
async function playPlanner(planDraftId: string, title: (index: number) => string) {
  const [draft] = await query<{ scope: string; post_id: string | null }>("select scope, post_id from plan_drafts where id = $1", [planDraftId]);
  const slots = await query<{ id: string }>("select id from posts where run_id = $1 order by slot_date", [runId]);
  const targets = draft.scope === "item" ? slots.filter((slot) => slot.id === draft.post_id) : slots;
  for (const slot of targets) {
    const index = slots.findIndex((item) => item.id === slot.id);
    const [{ version }] = await query<{ version: number }>("select coalesce(max(version), 0)::int as version from plan_items where post_id = $1", [slot.id]);
    await query("update plan_items set status = 'replaced' where post_id = $1 and status <> 'replaced'", [slot.id]);
    await query(
      "insert into plan_items (run_id, post_id, draft_id, version, title, excerpt, category, reason, close_to) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [runId, slot.id, planDraftId, version + 1, title(index), `What to know about bathroom question ${index + 1}.`, index === 0 ? "Cost" : "Other", `Internal reason ${index + 1}`, index === 1 ? "Wet room or shower tray" : null],
    );
  }
  await query("update plan_drafts set status = 'done' where id = $1", [planDraftId]);
}

test.beforeAll(async () => {
  await resetDomain();
  await fetch(`${TRIGGER}/__reset`, { method: "POST" });
  const [{ id: clientId }] = await query<{ id: string }>("insert into clients (name) values ('Migss Interiors') returning id");
  [{ id: projectId }] = await query<{ id: string }>("insert into projects (client_id, name, site_url, status) values ($1, 'Migss Interiors Website', 'https://www.migssinteriors.com', 'active') returning id", [clientId]);
  await query("insert into project_categories (project_id, label, position) values ($1, 'Cost', 0), ($1, 'Technical', 1)", [projectId]);
  runId = await seedRun(projectId, [2], { weeks: 4, preset: "entry" });
});

test("Plan the run drafts a plan, shown per slot with its category, pillar, reason and closeness", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/plan`);
  await page.getByRole("button", { name: "Plan the run" }).click();
  await expect(page.getByText("Drafting the plan", { exact: true }).first()).toBeVisible();
  const run = (await triggered()).find((item) => item.task === "draft-plan")!;
  expect(run.payload.planDraftId).toBeTruthy();
  await playPlanner(run.payload.planDraftId, (index) => `Bathroom question ${index + 1}`);
  // The tab looks again by itself while drafting.
  await expect(page.locator(".app-plan-item").first()).toContainText("Bathroom question 1", { timeout: 15_000 });
  const first = page.locator(".app-plan-item").first();
  await expect(first).toContainText("To approve");
  await expect(first).toContainText("Cost");
  await expect(first).toContainText("Why: Internal reason 1");
  await expect(page.locator(".app-plan-item").nth(1)).toContainText("Close to an existing topic");
  await page.screenshot(shot("a3-plan"));
});

test("Regenerate post with a note starts the planner for that slot, and a suggestion run from the note", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/plan`);
  const second = page.locator(".app-plan-item").nth(1);
  await second.locator("summary", { hasText: "Regenerate post" }).click();
  await second.getByRole("textbox", { name: "What should change (optional)" }).fill("Make it about tile choice, not wet rooms.");
  await second.getByRole("button", { name: "Regenerate post" }).click();
  await expect(page.getByText("Drafting the plan", { exact: true }).first()).toBeVisible();
  const runs = await triggered();
  const item = runs.filter((entry) => entry.task === "draft-plan").at(-1)!;
  expect(runs.some((entry) => entry.task === "propose-candidates" && entry.payload.planFeedbackId)).toBe(true);
  await playPlanner(item.payload.planDraftId, () => "Choosing bathroom tiles that last");
  await expect(page.locator(".app-plan-item").nth(1)).toContainText("Choosing bathroom tiles that last", { timeout: 15_000 });
  const [{ n }] = await query<{ n: number }>("select count(*)::int as n from plan_items where run_id = $1 and status = 'replaced'", [runId]);
  expect(n).toBe(1);
});

test("Share with the client shows the link once; the client sees titles and excerpts only, comments and approves", async ({ page, signedIn, browser }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/plan`);
  await page.getByRole("button", { name: "Share with the client" }).click();
  const box = page.getByRole("textbox", { name: "Link for the client" });
  await expect(box).toBeVisible();
  link = await box.inputValue();
  expect(link).toMatch(/\/plan\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText("Sent to client", { exact: true })).toBeVisible();

  // The client is not signed in.
  const client = await browser.newContext();
  const visitor = await client.newPage();
  const response = await visitor.goto(link);
  expect(response!.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(visitor.getByRole("heading", { name: "Content plan" })).toBeVisible();
  await expect(visitor.getByText("Bathroom question 1", { exact: true })).toBeVisible();
  await expect(visitor.getByText("What to know about bathroom question 1.")).toBeVisible();
  await expect(visitor.locator("body")).not.toContainText("Internal reason");
  await expect(visitor.locator("body")).not.toContainText("Cost");
  await visitor.screenshot(shot("a3-client-plan"));

  const firstItem = visitor.locator(".app-client-item").first();
  await firstItem.getByText("Comment or suggest a change").click();
  await firstItem.getByRole("textbox", { name: "Your comment or suggestion" }).fill("We now offer a 10-year guarantee on every bathroom.");
  await firstItem.getByRole("textbox", { name: "Your name" }).fill("Ana Migss");
  await firstItem.getByRole("button", { name: "Suggest a change" }).click();
  await expect(firstItem.getByText("Thank you. Your suggestion has been sent to BrandFactory London.")).toBeVisible();

  const approve = visitor.getByRole("form", { name: "Approve the plan" });
  // The name is remembered in this browser.
  await expect(approve.getByRole("textbox", { name: "Your name" })).toHaveValue("Ana Migss");
  await approve.getByRole("button", { name: "Approve plan" }).click();
  // The page reloads the plan, which now shows who approved it.
  await expect(visitor.getByText(/^Approved by Ana Migss on .*\. Thank you\.$/)).toBeVisible();

  // Print: no forms or buttons.
  await visitor.reload();
  await visitor.emulateMedia({ media: "print" });
  await expect(visitor.getByRole("button")).toHaveCount(0);
  await expect(visitor.getByText(/^Printed .* from https?:\/\//)).toBeVisible();
  await visitor.emulateMedia({ media: "screen" });
  await client.close();

  const rows = await query<{ kind: string; name: string }>("select kind, name from plan_feedback where share_id is not null order by created_at");
  expect(rows).toEqual([
    { kind: "suggest", name: "Ana Migss" },
    { kind: "approve", name: "Ana Migss" },
  ]);
});

test("Amir sees the client's words with a badge on the tab, then approves the plan and activates the run", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/details`);
  await expect(page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: /Run plan.*2 new from the client/ })).toBeVisible();
  await page.goto(`/projects/${projectId}/plan`);
  await expect(page.getByText("Approved by client", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Approved by Ana Migss on /)).toBeVisible();
  await expect(page.locator(".app-plan-item").first()).toContainText("We now offer a 10-year guarantee on every bathroom.");
  await page.getByRole("button", { name: "Approve plan" }).click();
  // The panel moves on: the run is Plan approved, and Activate run takes the button's place.
  await expect(page.getByRole("button", { name: "Activate run" })).toBeVisible();
  await expect(page.locator(".app-run-head").first()).toContainText("Plan approved");
  const topics = await query<{ topic: string; status: string; planned_excerpt: string }>("select topic, status, planned_excerpt from posts where run_id = $1 order by slot_date", [runId]);
  expect(topics[0]).toEqual({ topic: "Bathroom question 1", status: "topic_set", planned_excerpt: "What to know about bathroom question 1." });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Activate run" }).click();
  await expect(page.getByRole("button", { name: "Activate run" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".app-run-head").first()).toContainText("Active");
  await expect(page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Run plan", exact: true })).toBeVisible();
  await page.screenshot(shot("a3-plan-approved"));
});

test("after activation the link shows the plan but takes no more comments; a turned-off link is not active", async ({ page, signedIn, browser }) => {
  void signedIn;
  const client = await browser.newContext();
  const visitor = await client.newPage();
  await visitor.goto(link);
  await expect(visitor.getByText("Bathroom question 1", { exact: true })).toBeVisible();
  await expect(visitor.getByText(/^Approved by Ana Migss on /)).toBeVisible();
  await expect(visitor.getByText("Comment or suggest a change")).toHaveCount(0);
  await page.goto(`/projects/${projectId}/plan`);
  await page.getByRole("button", { name: "Turn off link" }).click();
  await expect(page.getByText("Link turned off.")).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "This link is not active" })).toBeVisible();
  await visitor.goto("/plan/not-a-real-token");
  await expect(visitor.getByRole("heading", { name: "This link is not active" })).toBeVisible();
  await client.close();
});

test("phone width: the client page and the planned Run plan fit without sideways scrolling", async ({ page, signedIn, browser }) => {
  void signedIn;
  const overflow = (target: typeof page) => target.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}/plan`);
  await expect(page.locator(".app-plan-item").first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.screenshot(shot("a3-plan-mobile"));
  await query("update runs set status = 'plan_approved' where id = $1", [runId]);
  await page.reload();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Share with the client" }).click();
  const fresh = await page.getByRole("textbox", { name: "Link for the client" }).inputValue();
  const client = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const visitor = await client.newPage();
  await visitor.goto(fresh);
  await expect(visitor.getByRole("heading", { name: "Content plan" })).toBeVisible();
  expect(await overflow(visitor)).toBeLessThanOrEqual(0);
  await visitor.screenshot(shot("a3-client-plan-mobile"));
  await client.close();
});
