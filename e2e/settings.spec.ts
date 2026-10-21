import { expect, query, test, TEST_EMAIL } from "./fixtures";

// γ2.4: BrandFactory rules (the agency knowledge tier), AI models and Connections.

test.describe.configure({ mode: "serial" });

const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });

test.beforeAll(async () => {
  await query("delete from knowledge_versions where tier = 'agency'");
  await query("delete from app_settings");
});

test("BrandFactory rules save as versions of the agency tier", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/settings/rules");
  const editor = page.getByRole("form", { name: "BrandFactory rules" });
  const sections = editor.getByRole("navigation", { name: "BrandFactory rules sections" });
  await expect(sections.getByRole("button")).toHaveText(["Writing rulesEmpty", "Banned phrasesEmpty"]);
  await editor.getByRole("textbox", { name: "Writing rules (Markdown)" }).fill(
    "1. Never use em dashes. Use commas, full stops, colons or restructure the sentence.\n2. Plain British English. Short sentences.",
  );
  await sections.getByRole("button", { name: /Banned phrases/ }).click();
  await editor.getByRole("textbox", { name: "Banned phrases (Markdown)" }).fill('- "elevate"\n- "look no further"');
  await editor.getByRole("button", { name: "Save version" }).click();
  await expect(editor.getByText(/^Version 1, saved .* · Saved as version 1$/)).toBeVisible();
  const rows = await query<{ client_id: string | null; project_id: string | null; sections: Record<string, string> }>(
    "select client_id, project_id, sections from knowledge_versions where tier = 'agency'",
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ client_id: null, project_id: null });
  expect(rows[0].sections.banned_phrases).toBe('- "elevate"\n- "look no further"');
  await sections.getByRole("button", { name: /Writing rules/ }).click();
  await page.screenshot(shot("settings-rules"));
});

test("AI models default to Opus 5.5 and save a change", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/settings/models");
  for (const role of ["Writer", "Critic", "Derivatives"]) {
    await expect(page.getByRole("combobox", { name: role })).toHaveValue("claude-opus-5-5");
  }
  await expect(page.getByRole("combobox", { name: "Writer" }).getByRole("option")).toHaveText(["Claude Opus 5.5", "Claude Sonnet 5.5", "Claude Haiku 5.5"]);
  await page.getByRole("combobox", { name: "Derivatives" }).selectOption("claude-sonnet-5-5");
  await page.getByRole("button", { name: "Save models" }).click();
  await expect(page.getByText("Models saved")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Derivatives" })).toHaveValue("claude-sonnet-5-5");
  const [row] = await query<{ writer_model: string; critic_model: string; derivative_model: string }>(
    "select writer_model, critic_model, derivative_model from app_settings",
  );
  expect(row).toEqual({ writer_model: "claude-opus-5-5", critic_model: "claude-opus-5-5", derivative_model: "claude-sonnet-5-5" });
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Derivatives" })).toHaveValue("claude-sonnet-5-5");
  await page.screenshot(shot("settings-models"));
});

test("Connections shows the Google connection, the Anthropic check, Trigger.dev and Wix", async ({ page, signedIn }) => {
  void signedIn;
  const [user] = await query<{ id: string }>("select id from users where email = $1", [TEST_EMAIL]);
  await query("delete from google_tokens where user_id = $1", [user.id]);
  await page.goto("/settings/connections");
  const google = page.getByRole("listitem").filter({ hasText: "Google" });
  await expect(google).toContainText("Not connected");
  await expect(google).toContainText("No Google connection is stored.");

  await query(
    "insert into google_tokens (user_id, refresh_token_enc, scope, updated_at) values ($1, 'v1.placeholder', $2, '2026-10-21T09:15:00Z')",
    [user.id, "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.readonly"],
  );
  try {
    await page.reload();
    await expect(google).toContainText("Connected as hello@brandfactorylondon.com.");
    await expect(google).toContainText("Access: Sign-in, Email address, Name and photo, Google Drive, read only.");
    await expect(google).toContainText("Last refreshed 21 Oct 2026 at 10:15.");
    await expect(page.getByRole("listitem").filter({ hasText: "Anthropic API" })).toContainText("Not checked");
    await expect(page.getByRole("listitem").filter({ has: page.getByText("Trigger.dev", { exact: true }) })).toContainText("Configured");
    await expect(page.getByRole("listitem").filter({ hasText: "Wix" })).toContainText("Not connected yet");
    await page.screenshot(shot("settings-connections"));

    let googleUrl: URL | undefined;
    await page.route("https://accounts.google.com/**", (route) => {
      googleUrl = new URL(route.request().url());
      return route.fulfill({ status: 200, body: "stopped at Google" });
    });
    await page.getByRole("button", { name: "Reconnect Google" }).click();
    await expect.poll(() => googleUrl?.pathname).toContain("/o/oauth2");
    expect(googleUrl!.searchParams.get("prompt")).toBe("consent");
    expect(googleUrl!.searchParams.get("scope")).toContain("drive.readonly");
  } finally {
    await query("delete from google_tokens where user_id = $1", [user.id]);
  }
});
