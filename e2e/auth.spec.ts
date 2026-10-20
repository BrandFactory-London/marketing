import { SESSION_COOKIE, createSession, expect, query, test } from "./fixtures";

test.describe("signed out", () => {
  for (const path of ["/", "/calendar", "/settings/models"]) {
    test(`${path} redirects to the sign-in page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/signin$/);
    });
  }

  test("API routes answer 401 instead of redirecting", async ({ request }) => {
    const response = await request.get("/api/anything", { maxRedirects: 0 });
    expect(response.status()).toBe(401);
  });

  test("the sign-in page renders", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/signin.png", fullPage: true });
  });

  test("a refused account sees the access message, without the allowed address", async ({ page }) => {
    await page.goto("/signin?error=AccessDenied");
    await expect(page.getByRole("alert").filter({ hasText: "access" })).toHaveText("This Google account does not have access.");
    await expect(page.getByText("hello@brandfactorylondon.com")).toHaveCount(0);
    await page.screenshot({ path: "e2e/screenshots/signin-refused.png", fullPage: true });
  });

  for (const [code, text] of [
    ["EncryptionKey", "Sign-in is switched off: the server's encryption key (APP_ENCRYPTION_KEY) is missing or invalid."],
    ["GoogleTokenNotSaved", "Google accepted the sign-in, but the Google connection could not be saved, so you are not signed in."],
    ["Configuration", "Sign-in could not finish because of a server problem. Check the server log."],
  ]) {
    test(`the sign-in page explains the ${code} error`, async ({ page }) => {
      await page.goto(`/signin?error=${code}`);
      await expect(page.getByRole("alert").filter({ hasText: "ign" }).first()).toContainText(text);
      if (code === "EncryptionKey") await page.screenshot({ path: "e2e/screenshots/signin-key-error.png", fullPage: true });
    });
  }

  test("an expired session is treated as signed out", async ({ context, page, baseURL }) => {
    const token = await createSession(new Date(Date.now() - 60_000));
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL! }]);
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/signin$/);
  });

  test("Sign in with Google asks for Drive read access with offline access", async ({ page }) => {
    let googleUrl: URL | undefined;
    await page.route("https://accounts.google.com/**", (route) => {
      googleUrl = new URL(route.request().url());
      return route.fulfill({ status: 200, body: "stopped at Google" });
    });
    await page.goto("/signin");
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect.poll(() => googleUrl?.pathname).toContain("/o/oauth2");
    expect(googleUrl!.searchParams.get("scope")).toBe(
      "openid email profile https://www.googleapis.com/auth/drive.readonly",
    );
    expect(googleUrl!.searchParams.get("access_type")).toBe("offline");
    expect(googleUrl!.searchParams.get("prompt")).toBe("consent");
  });
});

test("Sign out ends the session in the database", async ({ context, page, baseURL }) => {
  const token = await createSession();
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL! }]);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  expect(await query("select 1 from sessions where session_token = $1", [token])).toHaveLength(0);
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin$/);
});
