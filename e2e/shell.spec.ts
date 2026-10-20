import { expect, test } from "./fixtures";

// Every page in the signed-in shell, with screenshots for the visual check.
const pages = [
  { path: "/", title: "Home", nav: "Home" },
  { path: "/calendar", title: "BrandFactory calendar", nav: "Calendar" },
  { path: "/crm", title: "CRM", nav: "CRM" },
  { path: "/projects", title: "Projects", nav: "Projects" },
  { path: "/posts", title: "Posts", nav: "Posts" },
  { path: "/review", title: "Review queue", nav: "Review queue" },
  { path: "/settings/rules", title: "Settings", nav: "BrandFactory rules" },
  { path: "/settings/models", title: "Settings", nav: "AI models" },
  { path: "/settings/connections", title: "Settings", nav: "Connections" },
];

test.describe("signed in", () => {
  for (const page of pages) {
    test(`${page.path} renders its title, marks its nav item and shows the account`, async ({ page: browser, signedIn }) => {
      void signedIn;
      await browser.goto(page.path);
      await expect(browser.getByRole("heading", { level: 1 })).toHaveText(page.title);
      const nav = browser.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link", { name: page.nav, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.getByText("hello@brandfactorylondon.com")).toBeVisible();
      await expect(nav.getByRole("button", { name: "Sign out" })).toBeVisible();
      const slug = page.path === "/" ? "home" : page.path.slice(1).replace(/\//g, "-");
      await browser.screenshot({ path: `e2e/screenshots/${slug}.png`, fullPage: true });
    });
  }

  test("/settings redirects to the rules tab", async ({ page, signedIn }) => {
    void signedIn;
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/rules$/);
  });

  test("narrow screens collapse the sidebar into a menu", async ({ page, signedIn }) => {
    void signedIn;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeHidden();
    await page.screenshot({ path: "e2e/screenshots/mobile-closed.png", fullPage: true });
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/mobile-open.png", fullPage: true });
  });
});
