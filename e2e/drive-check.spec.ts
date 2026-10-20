import { expect, query, test } from "./fixtures";

test("the Drive check needs a session", async ({ page }) => {
  await page.goto("/dev/drive-check");
  await expect(page).toHaveURL(/\/signin$/);
});

test("the Drive check is not in the nav", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /drive/i })).toHaveCount(0);
});

test("with no stored Google connection, the Drive check asks for a new sign-in", async ({ page, signedIn }) => {
  void signedIn;
  await query("delete from google_tokens");
  await page.goto("/dev/drive-check");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Drive check");
  await expect(page.getByRole("alert").filter({ hasText: "sign in with Google again" })).toContainText(
    "No Google connection is stored.",
  );
  await page.screenshot({ path: "e2e/screenshots/drive-check-no-connection.png", fullPage: true });
});
