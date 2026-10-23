import type { Page } from "@playwright/test";
import { encrypt } from "../src/lib/crypto";
import { expect, query, resetDomain, test, TEST_EMAIL } from "./fixtures";

// γ5.2: the review editor, on the production smoke post's placeholders (γ5 orientation approval). The test seeds a
// drafted post as the generate-post task would leave it.

test.describe.configure({ mode: "serial" });

const STANDIN = "http://localhost:3199";
const triggered = async () => (await (await fetch(`${STANDIN}/__triggered`)).json()) as { task: string; payload: Record<string, string> }[];

const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });

const BODY = [
  "[CONFIRM: Migss wet room specialism wording] We use our own tradespeople [CONFIRM], and specialist oversight is included in every Migss quote.",
  "",
  "Every installation carries a 10-year labour guarantee [CONFIRM].",
  "",
  "## Week one: check the seals",
  "",
  "Look at the silicone around the tray and the screen. " + "Keep the drain clear of hair and soap. ".repeat(4),
  "",
  "## Book a free design consultation",
  "",
  "[Talk to us about your wet room](/contact).",
].join("\n");
const DRAFT = `# Wet room maintenance week by week\n\nExcerpt: How to keep a wet room watertight, week by week.\n\n${BODY}\n`;

let projectId = "";
let postIds: string[] = [];

async function seedDraftedPost(topic: string, slotOffset: number): Promise<string> {
  const [{ id: batchId }] = await query<{ id: string }>(
    `insert into batches (project_id, name, length_min, length_max, cta, faq_mode, writer_model, critic_model, derivative_model)
     values ($1, 'November', 20, 400, 'Book a free design consultation', 'never', 'claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5') returning id`,
    [projectId],
  );
  const [{ id: postId }] = await query<{ id: string }>(
    "insert into posts (project_id, status, slot_date, topic, batch_id) values ($1, 'in_review', current_date + $3::int, $2, $4) returning id",
    [projectId, topic, slotOffset, batchId],
  );
  const [{ id: specId }] = await query<{ id: string }>(
    `insert into post_specs (post_id, batch_id, version, status, keyword, post_type, angle, outline, facts, links, length_min, length_max, cta, faq)
     values ($1, $2, 1, 'confirmed', 'wet room maintenance', 'guide', 'Start with the seals.', '[]', '[]', '["/contact"]', 20, 400, 'Book a free design consultation', false) returning id`,
    [postId, batchId],
  );
  const [{ id: generationId }] = await query<{ id: string }>(
    "insert into post_generations (post_id, spec_id, batch_id, status, round) values ($1, $2, $3, 'in_review', 2) returning id",
    [postId, specId, batchId],
  );
  const checks = { passed: true, issues: [], title: "x", excerpt: "x", wordCount: 120, info: { links: ["/contact"], placeholders: [], moneyFigures: [], yearsClaims: [], percentages: [], h2: 2 } };
  const [{ id: draftId }] = await query<{ id: string }>(
    `insert into post_drafts (generation_id, round, title, excerpt, body_md, word_count, checks, checks_passed)
     values ($1, 2, 'Wet room maintenance week by week', 'How to keep a wet room watertight, week by week.', $2, 120, $3, true) returning id`,
    [generationId, DRAFT, JSON.stringify(checks)],
  );
  await query(
    `insert into critic_verdicts (draft_id, verdict, summary, issues, placeholders, scores) values ($1, 'pass', 'Practical, with three facts to confirm.', $2, $3, $4)`,
    [
      draftId,
      JSON.stringify([{ quote: "Keep the drain clear of hair and soap.", category: "usefulness", note: "Say how often.", severity: "minor" }]),
      JSON.stringify([
        { quote: "[CONFIRM: Migss wet room specialism wording]", ask: "How Migss describes its wet room specialism." },
        { quote: "[CONFIRM]", ask: "Whether Migss uses its own tradespeople." },
        { quote: "[CONFIRM]", ask: "How long the labour guarantee runs." },
      ]),
      JSON.stringify({ voice: 8, usefulness: 7, specificity: 7 }),
    ],
  );
  return postId;
}

test.beforeAll(async () => {
  await resetDomain();
  const [{ id: clientId }] = await query<{ id: string }>("insert into clients (name) values ('Migss Interiors') returning id");
  [{ id: projectId }] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, package, status) values ($1, 'Migss Interiors Website', 'https://www.migssinteriors.com', 'entry', 'paused') returning id",
    [clientId],
  );
  await query("insert into knowledge_versions (tier, version, sections) values ('agency', 1, $1)", [JSON.stringify({ writing_rules: "Never use em dashes.", banned_phrases: '- "elevate"' })]);
  await query("insert into knowledge_versions (tier, client_id, version, sections) values ('client', $1, 1, $2)", [
    clientId,
    JSON.stringify({ examples: "Rushing or skipping a stage hides problems behind finished tiles." }),
  ]);
  await query("insert into knowledge_versions (tier, project_id, version, sections) values ('project', $1, 1, $2)", [
    projectId,
    JSON.stringify({ cta: "Book a free design consultation at /contact.", allowed_links: "/contact" }),
  ]);
  await query("insert into project_pillars (project_id, label, slug, position) values ($1, 'Bathroom Renovation', 'bathroom-renovation', 0)", [projectId]);
  // The project's Drive folder is the Google stand-in's Migss tree.
  await query("update projects set drive_folder_id = 'playwright-migss', drive_folder_name = 'Migss Interiors' where id = $1", [projectId]);
  postIds = [await seedDraftedPost("Wet room maintenance week by week", 7), await seedDraftedPost("Second post to reject", 9)];
  await fetch(`${STANDIN}/__reset?fail=0`, { method: "POST" });
});

// Replaces the editor's current selection (set by clicking a placeholder in the panel) with text.
async function replaceSelection(page: Page, text: string) {
  if (text) await page.keyboard.insertText(text);
  else await page.keyboard.press("Backspace");
}

test("the smoke post's placeholders are highlighted and listed with the critic's asks, and block Approve", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/review?filter=input");
  // Both seeded posts carry the smoke post's three placeholders.
  await expect(page.getByText("3 to fill")).toHaveCount(2);
  await page.goto(`/posts/${postIds[0]}`);
  await expect(page.locator(".cm-content .app-mark-placeholder")).toHaveCount(3);
  await expect(page.getByLabel("Preview").locator("mark.app-placeholder")).toHaveCount(3);
  const panel = page.getByRole("complementary", { name: "Review notes" });
  await expect(panel.getByRole("heading", { name: "Needs your input" })).toBeVisible();
  await expect(panel.getByText("How long the labour guarantee runs.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve post" })).toBeDisabled();
  await expect(page.getByText("Fill in 3 placeholders to approve.")).toBeVisible();
  await expect(panel.getByText("Say how often.")).toBeVisible();
  await page.screenshot(shot("g5-review-placeholders"));
});

test("filling the placeholders, then a typed em dash, then removing it: Approve follows each change", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/posts/${postIds[0]}`);
  const panel = page.getByRole("complementary", { name: "Review notes" });
  await panel.getByRole("button", { name: "[CONFIRM: Migss wet room specialism wording]" }).click();
  await replaceSelection(page, "Wet rooms are our speciality.");
  await expect(page.locator(".cm-content .app-mark-placeholder")).toHaveCount(2);
  await panel.getByRole("button", { name: "[CONFIRM]" }).first().click();
  await replaceSelection(page, "");
  await expect(page.locator(".cm-content .app-mark-placeholder")).toHaveCount(1);
  await panel.getByRole("button", { name: "[CONFIRM]" }).first().click();
  await replaceSelection(page, "");
  await expect(page.locator(".cm-content .app-mark-placeholder")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve post" })).toBeEnabled();

  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\nOne more line \u2014 with a dash.");
  await expect(page.getByRole("button", { name: "Approve post" })).toBeDisabled();
  await expect(page.getByText("Remove 1 dash or banned phrase to approve.")).toBeVisible();
  await expect(page.locator(".cm-content .app-mark-blocking")).toHaveCount(1);
  for (let i = 0; i < "\n\nOne more line \u2014 with a dash.".length; i++) await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "Approve post" })).toBeEnabled();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  const versions = await query<{ version: number; body_md: string }>("select version, body_md from post_versions where post_id = $1", [postIds[0]]);
  expect(versions).toHaveLength(1);
  expect(versions[0].body_md).toContain("Wet rooms are our speciality.");
  expect(versions[0].body_md).not.toContain("[CONFIRM");
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("Wet rooms are our speciality.");
});

test("copying a client Example shows as a warning, not a block", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/posts/${postIds[0]}`);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\nRushing or skipping a stage hides problems behind finished tiles.");
  await expect(page.getByText("Reuses the client's example", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve post" })).toBeEnabled();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
});

test("publishing details save a slug and pillar, and Approve locks the text until it is reopened", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/posts/${postIds[0]}`);
  await expect(page.getByLabel("Slug")).toHaveValue("wet-room-maintenance-week-by-week");
  await page.getByLabel("Slug").fill("wet-room-care");
  await page.getByLabel("Pillar tag").selectOption({ label: "Bathroom Renovation" });
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Publishing details saved.")).toBeVisible();

  await page.getByRole("button", { name: "Approve post" }).click();
  await expect(page.getByText("The text is locked", { exact: false })).toBeVisible();
  await expect(page.locator(".cm-content")).toHaveCount(0);
  const [post] = await query<{ status: string; slug: string; approved_at: Date | null }>("select status, slug, approved_at from posts where id = $1", [postIds[0]]);
  expect(post).toMatchObject({ status: "approved", slug: "wet-room-care" });
  expect(post.approved_at).not.toBeNull();
  const [event] = await query<{ action: string; warnings: { check: string }[] }>("select action, warnings from review_events where post_id = $1", [postIds[0]]);
  expect(event.action).toBe("approve");
  expect(event.warnings.map((item) => item.check)).toEqual(["examples"]);
  // Amir filled the placeholders, so the approval has edits and starts the candidates task.
  expect((await triggered()).at(-1)).toMatchObject({ task: "propose-candidates" });
  await expect(page.getByRole("link", { name: "Settings, BrandFactory rules" })).toBeVisible();
  await page.screenshot(shot("g5-approved"));

  await page.getByRole("button", { name: "Reopen for editing" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  expect((await query<{ status: string }>("select status from posts where id = $1", [postIds[0]]))[0].status).toBe("in_review");
});

test("Reject needs a note and keeps it with the post", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/posts/${postIds[1]}`);
  await page.getByRole("button", { name: "Reject post" }).first().click();
  const form = page.locator(".app-inline-form");
  await expect(form.getByRole("button", { name: "Reject post" })).toBeDisabled();
  await form.getByLabel("Why are you rejecting it?").fill("Wrong angle for this month.");
  await form.getByRole("button", { name: "Reject post" }).click();
  await expect(page.getByText("Rejected: Wrong angle for this month.")).toBeVisible();
  expect((await query<{ status: string }>("select status from posts where id = $1", [postIds[1]]))[0].status).toBe("rejected");
  // γ7: the note is read for rules and facts straight away.
  const [reject] = await query<{ id: string }>("select id from review_events where post_id = $1 and action = 'reject'", [postIds[1]]);
  expect((await triggered()).at(-1)).toMatchObject({ task: "propose-candidates", payload: { reviewEventId: reject.id } });
});

test("Regenerate with a note saves the text, starts a run, follows it, and costs it as its own run", async ({ page, signedIn }) => {
  void signedIn;
  await fetch(`${STANDIN}/__reset?fail=0`, { method: "POST" });
  await page.goto(`/posts/${postIds[0]}`);
  await page.getByRole("button", { name: "Regenerate with a note" }).click();
  await page.getByLabel("What should the writer change?").fill("Say how often to clear the drain.");
  await page.getByRole("button", { name: "Regenerate post" }).click();
  await expect(page.getByText('the writer is working on a new version for your note "Say how often to clear the drain".', { exact: false })).toBeVisible();
  const runs = await triggered();
  // γ7: the note is also read for rules and facts, beside the regenerate.
  expect(runs.slice(-2).map((run) => run.task)).toEqual(["generate-post", "propose-candidates"]);
  const [generation] = await query<{ id: string; note: string; base_version_id: string }>(
    "select id, note, base_version_id from post_generations where post_id = $1 and note is not null order by created_at desc limit 1",
    [postIds[0]],
  );
  expect(generation.note).toBe("Say how often to clear the drain.");
  expect(generation.base_version_id).toBeTruthy();
  await page.screenshot(shot("g5-regenerating"));

  // The generate-post task's part: one writer round and a critic pass.
  const [{ id: writerCall }] = await query<{ id: string }>(
    `insert into ai_calls (post_id, purpose, requested_model, served_model, prompt_version, effort, input_tokens, output_tokens, cache_read_tokens, cost_usd)
     values ($1, 'writer', 'claude-opus-5-5', 'claude-opus-5-5', 'writer-2', 'high', 4600, 6500, 2277, 0.149575) returning id`,
    [postIds[0]],
  );
  const body = DRAFT.replace(/\[CONFIRM[^\]]*\] ?/g, "").replace("Keep the drain clear of hair and soap.", "Clear the drain of hair and soap every week.");
  const checks = { passed: true, issues: [], title: "x", excerpt: "x", wordCount: 110, info: { links: ["/contact"], placeholders: [], moneyFigures: [], yearsClaims: [], percentages: [], h2: 2 } };
  const [{ id: draftId }] = await query<{ id: string }>(
    `insert into post_drafts (generation_id, round, title, excerpt, body_md, word_count, checks, checks_passed, ai_call_id)
     values ($1, 1, 'Wet room maintenance week by week', 'How to keep a wet room watertight, week by week.', $2, 110, $3, true, $4) returning id`,
    [generation.id, body, JSON.stringify(checks), writerCall],
  );
  await query(`insert into critic_verdicts (draft_id, verdict, summary, issues, placeholders, scores) values ($1, 'pass', 'Clearer.', '[]', '[]', '{"voice":8}')`, [draftId]);
  await query("update post_generations set status = 'in_review', round = 1, finished_at = now() where id = $1", [generation.id]);
  await query("update posts set status = 'in_review', generation_step = null where id = $1", [postIds[0]]);

  await expect(page.locator(".cm-content")).toContainText("Clear the drain of hair and soap every week.", { timeout: 10_000 });
  await expect(page.getByRole("row", { name: "Regenerate 1: Say how often to clear the drain. $0.15" })).toBeVisible();
  await expect(page.getByText("No placeholders, dashes or banned phrases left.")).toBeVisible();
});

test("rule candidates are triaged in Settings: edit, move, accept into a new version, or dismiss", async ({ page, signedIn }) => {
  void signedIn;
  const [{ id: eventId }] = await query<{ id: string }>("select id from review_events where post_id = $1 and action = 'approve' order by created_at limit 1", [postIds[0]]);
  // The propose-candidates task's part.
  await query(
    `insert into rule_candidates (review_event_id, post_id, tier, section, text, before, after, reason) values
       ($1, $2, 'client', 'business_facts', 'Wet rooms are a Migss speciality.', '[CONFIRM: Migss wet room specialism wording]', 'Wet rooms are our speciality.', 'Amir supplied this fact.'),
       ($1, $2, 'agency', 'writing_rules', 'Say how often to do each maintenance task.', 'Keep the drain clear.', 'Clear the drain every week.', 'Readers need a frequency.')`,
    [eventId, postIds[0]],
  );
  await page.goto("/settings/rules");
  const section = page.getByRole("region", { name: "Suggestions from your notes and edits" });
  await expect(section.getByText('From your edits when approving "Wet room maintenance week by week"')).toHaveCount(2);
  await page.screenshot(shot("g5-rule-candidates"));

  const fact = section.locator("form", { has: page.getByText("Amir supplied this fact.") });
  await fact.getByLabel("Proposed rule").fill("Migss specialises in wet rooms.");
  await fact.getByRole("button", { name: "Accept rule" }).click();
  await expect(section.getByText("Added to Client knowledge: Business facts")).toBeVisible();
  const [client] = await query<{ version: number; sections: { business_facts?: string; examples?: string } }>(
    "select version, sections from knowledge_versions where tier = 'client' order by version desc limit 1",
  );
  expect(client.version).toBe(2);
  expect(client.sections.business_facts).toBe("- Migss specialises in wet rooms.");
  expect(client.sections.examples).toBe("Rushing or skipping a stage hides problems behind finished tiles.");

  // γ6: a fact from a regenerate note is triaged the same way, with Add fact, and always applies to every channel.
  const [{ id: regenerateId }] = await query<{ id: string }>("select id from review_events where post_id = $1 and action = 'regenerate' order by created_at limit 1", [postIds[0]]);
  await query(
    `insert into rule_candidates (review_event_id, post_id, kind, tier, section, text, after, reason) values
       ($1, $2, 'fact', 'client', 'business_facts', 'Migss gives a 10-year labour guarantee on every install.', 'we give a 10-year labour guarantee on every install', 'Posts can state it instead of a placeholder.')`,
    [regenerateId, postIds[0]],
  );
  await page.reload();
  const noted = section.locator("form", { has: page.getByText('From your regenerate note on "Wet room maintenance week by week"') });
  await expect(noted.getByLabel("Proposed fact")).toHaveValue("Migss gives a 10-year labour guarantee on every install.");
  await expect(noted.getByLabel("Applies to")).toBeDisabled();
  await expect(noted.getByText("Facts apply to every channel.")).toBeVisible();
  await expect(noted.getByText("we give a 10-year labour guarantee on every install")).toBeVisible();
  await page.screenshot(shot("g6-fact-candidate"));
  await noted.getByRole("button", { name: "Add fact" }).click();
  await expect(section.getByText("Added to Client knowledge: Business facts")).toHaveCount(2);
  const [withFact] = await query<{ sections: { business_facts?: string } }>("select sections from knowledge_versions where tier = 'client' order by version desc limit 1");
  expect(withFact.sections.business_facts).toBe("- Migss specialises in wet rooms.\n- Migss gives a 10-year labour guarantee on every install.");

  const rule = section.locator("form", { has: page.getByText("Readers need a frequency.") });
  await rule.getByRole("button", { name: "Dismiss" }).click();
  await expect(section.getByText("Dismissed")).toBeVisible();
  expect((await query("select 1 from knowledge_versions where tier = 'agency'")).length).toBe(1);
});

test("the cover picker browses into a subfolder, pages through photos and records the choice", async ({ page, signedIn }) => {
  void signedIn;
  // A stored Google connection for the signed-in account; the app refreshes it against the stand-in.
  process.env.APP_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const [user] = await query<{ id: string }>("select id from users where email = $1", [TEST_EMAIL]);
  await query("delete from google_tokens where user_id = $1", [user.id]);
  await query("insert into google_tokens (user_id, refresh_token_enc, scope) values ($1, $2, 'drive.readonly')", [user.id, encrypt("playwright-refresh", `google-refresh-token:${user.id}`)]);

  await page.goto(`/posts/${postIds[0]}`);
  const card = page.getByRole("region", { name: "Cover image" });
  await expect(card.getByText("No cover yet.", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "Choose cover" }).click();
  await expect(card.getByRole("navigation", { name: "Folder" })).toHaveText("Migss Interiors");
  await card.getByRole("button", { name: "Bathrooms" }).click();
  await expect(card.getByRole("navigation", { name: "Folder" })).toHaveText("Migss Interiors/Bathrooms");
  const tiles = card.locator(".app-cover-tile");
  await expect(tiles).toHaveCount(60);
  await card.getByRole("button", { name: "Show more photos" }).click();
  await expect(tiles).toHaveCount(64);
  await expect(card.getByRole("button", { name: "Show more photos" })).toHaveCount(0);
  await expect(tiles.first().locator("img")).toHaveJSProperty("complete", true);
  await page.screenshot(shot("g5-cover-picker"));

  await card.getByRole("button", { name: "Wet room 3.jpg" }).click();
  await expect(card.getByRole("img", { name: "Cover: Wet room 3.jpg" })).toBeVisible();
  await expect(card.getByText("Wet room 3.jpg · Migss Interiors / Bathrooms")).toBeVisible();
  const [post] = await query<{ cover_drive_file_id: string; cover_path: string }>("select cover_drive_file_id, cover_path from posts where id = $1", [postIds[0]]);
  expect(post).toEqual({ cover_drive_file_id: "pw-bath-3", cover_path: "Migss Interiors / Bathrooms" });
  // A file outside the project's folder is never served.
  expect((await page.request.get(`/api/drive/thumbnail/elsewhere?project=${projectId}&size=320`)).status()).toBe(404);
});

test("phone width: the editor switches to Edit and Preview tabs and the actions fit", async ({ page, signedIn }) => {
  void signedIn;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/posts/${postIds[0]}`);
  await expect(page.getByRole("tab", { name: "Edit" })).toBeVisible();
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator(".cm-content")).toBeHidden();
  await expect(page.getByLabel("Preview").getByRole("heading", { name: "Book a free design consultation" })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.screenshot(shot("g5-review-phone"));
});
