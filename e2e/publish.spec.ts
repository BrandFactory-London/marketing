import type { Page } from "@playwright/test";
import { encrypt } from "../src/lib/crypto";
import { expect, query, resetDomain, test, TEST_EMAIL } from "./fixtures";

// γ6.1 to γ6.4: Wix credentials, the connection check, the author, Publish post with its confirmation, a failed step
// and its retry, the live check's states, and the live link. Wix is the local stand-in (e2e/wix-standin.mjs); the live
// check task is played in the database, as γ4 and γ5 play their tasks.

test.describe.configure({ mode: "serial" });

const TRIGGER = "http://localhost:3199";
const WIX = "http://localhost:3197";
const KEY = "IST.playwright-wix-key-0000000000000000-pw01";
const SITE = "cba1d6e0-2aaa-4097-b52d-71939abe2255";
const ACCOUNT = "0f0f0f0f-1111-2222-3333-444444444444";
const triggered = async () => (await (await fetch(`${TRIGGER}/__triggered`)).json()) as { task: string; payload: Record<string, string> }[];
const wixState = async () => (await (await fetch(`${WIX}/__state`)).json()) as { drafts: { sent: { draftPost: Record<string, unknown> } }[]; posts: unknown[]; files: { name: string }[] };
const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });

const BODY = "Wet rooms need care.\n\n## Week one: check the seals\n\n- Look at the **silicone**\n- Clear the drain\n\n## Book a free design consultation\n\n[Talk to us](/contact).";
const DRAFT = (title: string) => `# ${title}\n\nExcerpt: How to keep a wet room watertight, week by week.\n\n${BODY}\n`;

let projectId = "";
let pillarId = "";

async function seedApprovedPost(title: string, slug: string, slotOffset: number): Promise<string> {
  const [{ id: batchId }] = await query<{ id: string }>(
    `insert into batches (project_id, name, length_min, length_max, cta, faq_mode, writer_model, critic_model, derivative_model)
     values ($1, 'November', 20, 400, 'Book a free design consultation', 'never', 'claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5') returning id`,
    [projectId],
  );
  const [{ id: postId }] = await query<{ id: string }>(
    `insert into posts (project_id, status, slot_date, topic, batch_id, pillar_id, slug, cover_drive_file_id, cover_name, cover_path, approved_at)
     values ($1, 'approved', current_date + $3::int, $2, $4, $5, $6, 'pw-bath-3', 'Wet room 3.jpg', 'Migss Interiors / Bathrooms', now()) returning id`,
    [projectId, title, slotOffset, batchId, pillarId, slug],
  );
  const [{ id: specId }] = await query<{ id: string }>(
    `insert into post_specs (post_id, batch_id, version, status, keyword, post_type, angle, outline, facts, links, length_min, length_max, cta, faq)
     values ($1, $2, 1, 'confirmed', 'wet room maintenance', 'guide', 'Start with the seals.', '[]', '[]', '["/contact"]', 20, 400, 'Book a free design consultation', false) returning id`,
    [postId, batchId],
  );
  const [{ id: generationId }] = await query<{ id: string }>(
    "insert into post_generations (post_id, spec_id, batch_id, status, round) values ($1, $2, $3, 'in_review', 1) returning id",
    [postId, specId, batchId],
  );
  const checks = { passed: true, issues: [], title, excerpt: "x", wordCount: 30, info: { links: ["/contact"], placeholders: [], moneyFigures: [], yearsClaims: [], percentages: [], h2: 2 } };
  await query(
    `insert into post_drafts (generation_id, round, title, excerpt, body_md, word_count, checks, checks_passed)
     values ($1, 1, $2, 'How to keep a wet room watertight, week by week.', $3, 30, $4, true)`,
    [generationId, title, DRAFT(title), JSON.stringify(checks)],
  );
  return postId;
}

let postIds: string[] = [];

test.beforeAll(async () => {
  await resetDomain();
  await fetch(`${WIX}/__reset`);
  const [{ id: clientId }] = await query<{ id: string }>("insert into clients (name) values ('Migss Interiors') returning id");
  [{ id: projectId }] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, status, drive_folder_id, drive_folder_name, drive_folder_checked_at) values ($1, 'Migss Interiors Website', 'https://www.migssinteriors.com', 'paused', 'playwright-migss', 'Migss Interiors', now()) returning id",
    [clientId],
  );
  [{ id: pillarId }] = await query<{ id: string }>("insert into project_pillars (project_id, label, slug) values ($1, 'Bathroom Renovation', 'bathroom-renovation') returning id", [projectId]);
  postIds = [await seedApprovedPost("Wet room maintenance week by week", "wet-room-maintenance-week-by-week", 3), await seedApprovedPost("Shower trays compared", "shower-trays-compared", 5)];
});

async function signInGoogle() {
  // The same local key the app runs with in playwright.config.ts.
  process.env.APP_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const [user] = await query<{ id: string }>("select id from users where email = $1", [TEST_EMAIL]);
  await query("delete from google_tokens where user_id = $1", [user.id]);
  await query("insert into google_tokens (user_id, refresh_token_enc, scope) values ($1, $2, 'drive.readonly')", [user.id, encrypt("playwright-refresh", `google-refresh-token:${user.id}`)]);
}

function wixCard(page: Page) {
  return page.locator(".bfm-card", { has: page.getByRole("heading", { name: "Wix Blog publishing" }) });
}

test("Wix credentials: a refused key shows Wix's error, the right one connects, and the author is chosen", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/details`);
  const card = wixCard(page);
  await expect(card.getByText("No Wix credentials yet.", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "Save and check credentials" }).click();
  await expect(card.getByText("Paste the API key from Wix's API Keys Manager.")).toBeVisible();

  await card.getByLabel("API key").fill("IST.not-the-right-key-000000000000");
  await card.getByLabel("Account ID").fill(ACCOUNT);
  await card.getByLabel("Site ID").fill(SITE);
  await card.getByRole("button", { name: "Save and check credentials" }).click();
  await expect(card.getByText("403: Permission denied: The API key cannot reach this site: PERMISSION_DENIED").first()).toBeVisible();
  await expect(card.getByText("Not working")).toBeVisible();

  await card.getByLabel("Replace the API key").fill(KEY);
  await card.getByLabel("Account ID").fill(ACCOUNT);
  await card.getByLabel("Site ID").fill(SITE);
  await card.getByRole("button", { name: "Save and check credentials" }).click();
  await expect(card.getByText("Connected. 1 of 1 pillar tags found on Wix.").first()).toBeVisible();
  await expect(card.getByText("Key ending")).toContainText("pw01");
  await expect(page.getByText(KEY)).toHaveCount(0);

  await card.getByRole("button", { name: "Choose author" }).click();
  await card.getByLabel("Publish posts as").selectOption({ label: "Amir Taylor" });
  await card.getByRole("button", { name: "Save author" }).click();
  await expect(card.getByText("Posts will be published as Amir Taylor.")).toBeVisible();
  await page.screenshot(shot("g6-wix-settings"));

  await page.goto("/settings/connections");
  const row = page.getByRole("listitem").filter({ hasText: "Wix: Migss Interiors Website" });
  await expect(row.getByText("Connected", { exact: true })).toBeVisible();
  await expect(row).toContainText("Publishes as Amir Taylor.");
  await row.getByRole("button", { name: "Check connection" }).click();
  await expect(row).toContainText("Connected. 1 of 1 pillar tags found on Wix.");
  await page.screenshot(shot("g6-connections"));
});

test("Publish post asks first, sends the post to Wix, and waits for the live check", async ({ page, signedIn }) => {
  void signedIn;
  await signInGoogle();
  await fetch(`${TRIGGER}/__reset`, { method: "POST" });
  await page.goto(`/posts/${postIds[0]}`);
  const card = page.getByRole("region", { name: "Publish" });
  await expect(card.getByText("www.migssinteriors.com/blog/wet-room-maintenance-week-by-week")).toBeVisible();
  await expect(card.getByText("Bathroom Renovation (bathroom-renovation)")).toBeVisible();
  await expect(card.getByText("Amir Taylor")).toBeVisible();
  await expect(card.getByText("Wet room 3.jpg")).toBeVisible();
  await expect(card.getByText("Publishing makes this post public on the Migss Interiors blog.", { exact: false })).toBeVisible();
  await page.screenshot(shot("g6-publish-ready"));

  await card.getByRole("button", { name: "Publish post" }).click();
  await expect(card.getByText("Publish to the Migss Interiors blog now? It becomes public straight away.")).toBeVisible();
  await card.getByRole("button", { name: "Cancel" }).click();
  expect((await wixState()).drafts).toHaveLength(0);

  await card.getByRole("button", { name: "Publish post" }).click();
  await card.getByRole("button", { name: "Publish now" }).click();
  await expect(card.getByText("Checking the live page")).toBeVisible();
  await expect(card.getByText("Wix accepted the post. Looking for it at", { exact: false })).toBeVisible();
  const wix = await wixState();
  expect(wix.drafts).toHaveLength(1);
  expect(wix.posts).toHaveLength(1);
  expect(wix.files.map((file) => file.name)).toEqual(["Wet room 3.jpg"]);
  expect(wix.drafts[0].sent.draftPost).toMatchObject({ seoSlug: "wet-room-maintenance-week-by-week", tagIds: ["tag-bath"], memberId: "fa29eebd-77ca-40d3-a742-64c80d431737" });
  const [publication] = await query<{ id: string }>("select id from post_publications where post_id = $1", [postIds[0]]);
  expect((await triggered()).filter((run) => run.task === "confirm-live").map((run) => run.payload.publicationId)).toEqual([publication.id]);
  // Not Published until the live check sees it.
  expect((await query<{ status: string }>("select status from posts where id = $1", [postIds[0]]))[0].status).toBe("approved");
  await expect(page.getByRole("button", { name: "Reopen for editing" })).toHaveCount(0);
  await page.screenshot(shot("g6-publish-checking"));
});

test("a live check that does not confirm offers Check again; a confirmed one shows the live link", async ({ page, signedIn }) => {
  void signedIn;
  const [publication] = await query<{ id: string }>("select id from post_publications where post_id = $1", [postIds[0]]);
  await query("update post_publications set state = 'not_confirmed', error = $2 where id = $1", [
    publication.id,
    "Wix accepted this post, but the live page did not show it within 5 minutes: the page answered with status 404.",
  ]);
  await page.goto(`/posts/${postIds[0]}`);
  const card = page.getByRole("region", { name: "Publish" });
  await expect(card.getByText("Not confirmed live")).toBeVisible();
  await expect(card.getByText("the page answered with status 404", { exact: false })).toBeVisible();
  await page.screenshot(shot("g6-not-confirmed"));
  await fetch(`${TRIGGER}/__reset`, { method: "POST" });
  await card.getByRole("button", { name: "Check again" }).click();
  await expect(card.getByText("Checking the live page")).toBeVisible();
  expect((await triggered()).filter((run) => run.task === "confirm-live")).toHaveLength(1);

  // The task confirms the page: the post becomes Published with its live URL.
  await query("update post_publications set state = 'live', confirmed_at = now(), live_url = $2 where id = $1", [publication.id, "https://www.migssinteriors.com/blog/wet-room-maintenance-week-by-week"]);
  await query("update posts set status = 'published', published_at = now(), live_url = $2 where id = $1", [postIds[0], "https://www.migssinteriors.com/blog/wet-room-maintenance-week-by-week"]);
  await page.goto(`/posts/${postIds[0]}`);
  await expect(card.getByRole("link", { name: "www.migssinteriors.com/blog/wet-room-maintenance-week-by-week" })).toBeVisible();
  await expect(card.getByRole("button", { name: /Publish/ })).toHaveCount(0);
  await page.screenshot(shot("g6-published"));

  await page.goto("/posts");
  const row = page.getByRole("row").filter({ hasText: "Wet room maintenance week by week" });
  await expect(row.getByText("Published")).toBeVisible();
  await expect(row.getByRole("link", { name: "View live post" })).toHaveAttribute("href", "https://www.migssinteriors.com/blog/wet-room-maintenance-week-by-week");
});

test("a failed step names itself and Try again resumes without a second post", async ({ page, signedIn }) => {
  void signedIn;
  await signInGoogle();
  await fetch(`${WIX}/__fail?route=createDraft`);
  await page.goto(`/posts/${postIds[1]}`);
  const card = page.getByRole("region", { name: "Publish" });
  await card.getByRole("button", { name: "Publish post" }).click();
  await card.getByRole("button", { name: "Publish now" }).click();
  await expect(card.getByText("Publishing stopped at the draft step: Wix: 503: Service unavailable: STAND_IN")).toBeVisible();
  await page.reload();
  await expect(card.getByText("Publish failed", { exact: true })).toBeVisible();
  await card.getByText("Publishing steps", { exact: false }).click();
  await expect(card.getByText("Uploaded to Wix Media.")).toBeVisible();
  await page.screenshot(shot("g6-publish-failed"));

  await card.getByRole("button", { name: "Try again" }).click();
  await card.getByRole("button", { name: "Publish now" }).click();
  await expect(card.getByText("Checking the live page")).toBeVisible();
  const wix = await wixState();
  expect(wix.drafts).toHaveLength(2);
  expect(wix.posts).toHaveLength(2);
  // The cover was uploaded once for this post: two files in all, one per post.
  expect(wix.files).toHaveLength(2);
});

test("GBP copy: generate, live checks on edits, save as a version, copy, and the edit is read for rules", async ({ page, context, signedIn }) => {
  void signedIn;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await fetch(`${TRIGGER}/__reset`, { method: "POST" });
  await page.goto(`/posts/${postIds[0]}`);
  const card = page.getByRole("region", { name: "Derivatives" });
  const gmb = card.getByRole("region", { name: "GBP post" });
  await expect(gmb.getByText("Not generated yet.")).toBeVisible();
  await gmb.getByRole("button", { name: "Generate GBP post" }).click();
  await expect(gmb.getByText("Writing the GBP post from the approved post")).toBeVisible();
  const runs = (await triggered()).filter((run) => run.task === "write-derivative");
  expect(runs).toHaveLength(1);
  await page.screenshot(shot("g6-derivative-writing"));

  // The task writes a version with a phone number in it.
  const text = "A wet room stays watertight when the seals are looked after. Check the silicone around the tray every month. Call 020 8500 1234 to book.";
  await query("update derivatives set status = 'ready', body = $2, checks = '{}' where id = $1", [runs[0].payload.derivativeId, text]);
  await expect(gmb.getByLabel("GBP post text")).toHaveValue(text, { timeout: 10_000 });
  await expect(gmb.getByText("Google rejects posts with a phone number in the text.", { exact: false })).toBeVisible();
  await expect(gmb.getByText("1 to check")).toBeVisible();
  await expect(gmb.getByText("Add the post's link as the \"Learn more\" button: https://www.migssinteriors.com/blog/wet-room-maintenance-week-by-week")).toBeVisible();
  await page.screenshot(shot("g6-derivative-warning"));

  await gmb.getByLabel("GBP post text").fill(text.replace(" Call 020 8500 1234 to book.", " Read the full guide for a weekly routine."));
  await expect(gmb.getByText("Ready to copy")).toBeVisible();
  await gmb.getByRole("button", { name: "Save edit" }).click();
  await expect(gmb.getByText("version 2 of 2, your edit", { exact: false })).toBeVisible();
  expect((await triggered()).filter((run) => run.task === "propose-candidates")).toHaveLength(0);
  await gmb.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(gmb.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Read the full guide for a weekly routine.");
  // γ7 orientation Q3: copying Amir's edit reads it for rules, once.
  const [edit] = await query<{ id: string }>("select id from derivatives where post_id = $1 and channel = 'gmb' and source = 'edit'", [postIds[0]]);
  await expect.poll(async () => (await triggered()).filter((run) => run.task === "propose-candidates").map((run) => run.payload.derivativeId)).toEqual([edit.id]);
  await page.screenshot(shot("g6-derivatives"));
});

test("Regenerate asks what was wrong; the note becomes a LinkedIn rule in Settings, scoped to LinkedIn (γ7 items 1, 2, 4, 5)", async ({ page, signedIn }) => {
  void signedIn;
  await fetch(`${TRIGGER}/__reset`, { method: "POST" });
  const linkedinText = "Most wet room leaks start at the silicone.\n\nRead the full guide:\nhttps://www.migssinteriors.com/blog/wet-room-maintenance-week-by-week";
  await query("insert into derivatives (post_id, channel, version, status, source, body, checks) values ($1, 'linkedin', 1, 'ready', 'model', $2, '{}')", [postIds[0], linkedinText]);
  await page.goto(`/posts/${postIds[0]}`);
  const linkedin = page.getByRole("region", { name: "LinkedIn post" });
  await linkedin.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(linkedin.getByRole("button", { name: "Regenerate LinkedIn post" })).toBeDisabled();
  await linkedin.getByLabel("What was wrong with this version?").fill("Never open with a question on LinkedIn.");
  await page.screenshot(shot("g7-derivative-note"));
  await linkedin.getByRole("button", { name: "Regenerate LinkedIn post" }).click();
  await expect(linkedin.getByText("Writing the LinkedIn post from the approved post")).toBeVisible();
  const [regenerate] = await query<{ id: string; note: string }>("select id, note from derivatives where post_id = $1 and channel = 'linkedin' and version = 2", [postIds[0]]);
  expect(regenerate.note).toBe("Never open with a question on LinkedIn.");
  await expect.poll(async () => (await triggered()).map((run) => run.task)).toEqual(["write-derivative", "propose-candidates"]);
  expect((await triggered())[1].payload).toEqual({ derivativeId: regenerate.id });

  // The propose-candidates task's part: a LinkedIn writing rule.
  await query(
    `insert into rule_candidates (derivative_id, post_id, tier, section, scope, text, after, reason) values
       ($1, $2, 'agency', 'writing_rules', 'linkedin', 'Open LinkedIn posts with a plain statement, never a question.', 'Never open with a question on LinkedIn.', 'Holds for every LinkedIn post.')`,
    [regenerate.id, postIds[0]],
  );
  await page.goto("/settings/rules");
  const section = page.getByRole("region", { name: "Suggestions from your notes and edits" });
  const card = section.locator("form", { has: page.getByText('From your note on the LinkedIn post for "Wet room maintenance week by week"') });
  await expect(card.getByText("LinkedIn post", { exact: true })).toBeVisible();
  await expect(card.getByLabel("Applies to")).toHaveValue("linkedin");
  await page.screenshot(shot("g7-scoped-candidate"));
  // Amir can widen it, but here keeps it to LinkedIn.
  await card.getByLabel("Where it belongs").selectOption("agency:banned_phrases");
  await expect(card.getByLabel("Applies to")).toBeDisabled();
  await card.getByLabel("Where it belongs").selectOption("agency:writing_rules");
  await card.getByLabel("Applies to").selectOption("linkedin");
  await card.getByRole("button", { name: "Accept rule" }).click();
  await expect(section.getByText("Added to BrandFactory rules: LinkedIn post rules")).toBeVisible();
  const [agency] = await query<{ sections: Record<string, string> }>("select sections from knowledge_versions where tier = 'agency' order by version desc limit 1");
  expect(agency.sections.writing_rules_linkedin).toBe("- Open LinkedIn posts with a plain statement, never a question.");
  expect(agency.sections.writing_rules ?? "").not.toContain("plain statement");

  // The rule is readable under its channel in the BrandFactory rules editor.
  await page.getByRole("button", { name: /LinkedIn post rules/ }).click();
  await expect(page.getByLabel("LinkedIn post rules (Markdown)")).toHaveValue("- Open LinkedIn posts with a plain statement, never a question.");
  await expect(page.getByText("By channel", { exact: true })).toBeVisible();
  await page.screenshot(shot("g7-channel-rules"));
});

test("Facebook and Pinterest: Generate all, a pin's two fields with their own Copy, and the cover suggested (γ7 items 7, 8)", async ({ page, context, signedIn }) => {
  void signedIn;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await fetch(`${TRIGGER}/__reset`, { method: "POST" });
  await page.goto(`/posts/${postIds[1]}`);
  const card = page.getByRole("region", { name: "Derivatives" });
  await card.getByRole("button", { name: "Generate all channels" }).click();
  await expect.poll(async () => (await triggered()).filter((run) => run.task === "write-derivative")).toHaveLength(4);
  await expect(card.getByRole("button", { name: "Generate all channels" })).toHaveCount(0);
  const rows = await query<{ id: string; channel: string }>("select id, channel from derivatives where post_id = $1 order by channel", [postIds[1]]);
  expect(rows.map((row) => row.channel)).toEqual(["facebook", "gmb", "linkedin", "pinterest"]);

  const link = "https://www.migssinteriors.com/blog/shower-trays-compared";
  const facebookText = `Choosing a shower tray comes down to the floor it sits on.\n\nStone resin suits most bathrooms; a level-access former suits a wet room.\n\nThe full comparison:\n${link}`;
  const pin = { title: "Shower trays compared: stone resin, acrylic and wet room formers", body: "How to choose a shower tray for your bathroom: the main materials compared, which floors suit each, and what a wet room former changes." };
  await query("update derivatives set status = 'ready', body = $2, checks = '{}' where id = $1", [rows.find((row) => row.channel === "facebook")!.id, facebookText]);
  await query("update derivatives set status = 'ready', title = $2, body = $3, checks = '{}' where id = $1", [rows.find((row) => row.channel === "pinterest")!.id, pin.title, pin.body]);
  await query("update derivatives set status = 'failed', error = 'Stopped reporting.' where post_id = $1 and channel in ('gmb', 'linkedin')", [postIds[1]]);

  const facebook = card.getByRole("region", { name: "Facebook post" });
  await expect(facebook.getByLabel("Facebook post text")).toHaveValue(facebookText, { timeout: 10_000 });
  await expect(facebook.getByText("Ready to copy")).toBeVisible();

  const pinterest = card.getByRole("region", { name: "Pinterest pin" });
  await expect(pinterest.getByLabel("Pin title")).toHaveValue(pin.title);
  await expect(pinterest.getByLabel("Pin description")).toHaveValue(pin.body);
  await expect(pinterest.getByText(`The pin's destination link: ${link}`)).toBeVisible();
  await expect(pinterest.getByText("Suggested image: the post's cover, Wet room 3.jpg.", { exact: false })).toBeVisible();
  await pinterest.getByRole("button", { name: "Copy title" }).click();
  await expect(pinterest.getByRole("button", { name: "Title copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pin.title);
  await pinterest.getByRole("button", { name: "Copy description" }).click();
  await expect(pinterest.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pin.body);
  // Copying the model's own version learns nothing.
  expect((await triggered()).filter((run) => run.task === "propose-candidates")).toHaveLength(0);

  // A pin title over Pinterest's 100 characters is flagged on its field.
  await pinterest.getByLabel("Pin title").fill("x".repeat(101));
  await expect(pinterest.getByText("Title: 101 characters; pin titles take at most 100.")).toBeVisible();
  await pinterest.getByLabel("Pin title").fill(pin.title);
  // A channel whose run wrote nothing is retried without a note.
  await expect(card.getByRole("region", { name: "GBP post" }).getByRole("button", { name: "Try again" })).toBeVisible();
  await page.screenshot(shot("g7-facebook-pinterest"));
});

test("the Publish card and Wix settings fit a 390px phone", async ({ page, signedIn }) => {
  void signedIn;
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, path, heading] of [
    ["g6-mobile-publish", `/posts/${postIds[1]}`, "Publish"],
    ["g6-mobile-published", `/posts/${postIds[0]}`, "Derivatives"],
    ["g7-mobile-derivatives", `/posts/${postIds[1]}`, "Derivatives"],
    ["g7-mobile-candidates", "/settings/rules", "Suggestions from your notes and edits"],
    ["g6-mobile-wix-settings", `/projects/${projectId}/details`, "Wix Blog publishing"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways, name).toBeLessThanOrEqual(0);
    await page.screenshot(shot(name));
  }
});
