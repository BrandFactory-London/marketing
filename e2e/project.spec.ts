import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, query, test, resetDomain, TEST_EMAIL } from "./fixtures";

// γ2.3: the project page. The sitemap import reads a small site served by this test on localhost, so the
// real import code runs end to end without reaching the internet.

test.describe.configure({ mode: "serial" });

let site: Server;
let siteUrl = "";
let projectId = "";
const pages: Record<string, string> = {
  "/": "Home | Example Interiors",
  "/renovation-services/bathroom": "Bathroom Renovation in London &amp; Essex | Example Interiors",
  "/locations/chigwell": "Bathroom fitters in Chigwell",
};

test.beforeAll(async () => {
  site = createServer((request, response) => {
    const path = request.url ?? "/";
    if (path === "/sitemap.xml") {
      const urls = [...Object.keys(pages), "/broken"]
        .map((page) => `<url><loc>${siteUrl}${page}</loc><lastmod>2026-10-15T10:02:22.163Z</lastmod></url>`)
        .join("");
      response.writeHead(200, { "Content-Type": "application/xml" });
      response.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
      return;
    }
    if (pages[path]) {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<html><head><title>${pages[path]}</title></head><body></body></html>`);
      return;
    }
    response.writeHead(500);
    response.end("Server error");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  siteUrl = `http://localhost:${(site.address() as AddressInfo).port}`;

  await resetDomain();
  const [client] = await query<{ id: string }>("insert into clients (name) values ('Migss Interiors') returning id");
  await query("insert into clients (name) values ('BrandFactory London')");
  const [project] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, package, status) values ($1, 'Migss Interiors website', $2, 'entry', 'active') returning id",
    [client.id, siteUrl],
  );
  projectId = project.id;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => site.close(() => resolve()));
});

const shot = (name: string) => ({ path: `e2e/screenshots/${name}.png`, fullPage: true, animations: "disabled" as const });

test("a project opens on its Knowledge tab, with the tabs in the prototype's order", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}`);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/knowledge$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Migss Interiors website");
  await expect(page.getByText(/^localhost:\d+ · publishes to Wix Blog$/)).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Project sections" });
  await expect(tabs.getByRole("link")).toHaveText(["Content and performance", "Sitemap", "Run plan", "Knowledge", "Settings"]);
  await expect(tabs.getByRole("link", { name: "Knowledge" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Projects", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Migss Interiors" }).first()).toHaveAttribute("href", /\/crm\//);
});

test("project knowledge saves versions with the project's four sections", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/knowledge`);
  await expect(page.getByText("Posts here also follow the Migss Interiors client knowledge and the BrandFactory rules.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See the Sitemap tab" })).toHaveAttribute("href", `/projects/${projectId}/sitemap`);
  const editor = page.getByRole("form", { name: "Project knowledge" });
  const sections = editor.getByRole("navigation", { name: "Project knowledge sections" });
  await expect(sections.getByRole("button")).toHaveText([
    "Ideal customer profilesEmpty",
    "Project factsEmpty",
    "Call to actionEmpty",
    "Allowed internal linksEmpty",
  ]);
  await editor.getByRole("textbox", { name: "Ideal customer profiles (Markdown)" }).fill(
    "Homeowners in Chigwell, Loughton, Ilford and the wider Essex and East London area planning a bathroom or kitchen renovation.",
  );
  await sections.getByRole("button", { name: /Call to action/ }).click();
  await editor.getByRole("textbox", { name: "Call to action (Markdown)" }).fill("Book a free design consultation.");
  await sections.getByRole("button", { name: /Allowed internal links/ }).click();
  await editor.getByRole("textbox", { name: "Allowed internal links (Markdown)" }).fill("/renovation-services/bathroom\n/locations/chigwell\n/contact");
  await editor.getByRole("button", { name: "Save version" }).click();
  await expect(editor.getByText(/^Version 1, saved .* · Saved as version 1$/)).toBeVisible();
  const rows = await query<{ tier: string; project_id: string; client_id: string | null }>("select tier, project_id, client_id from knowledge_versions");
  expect(rows).toEqual([{ tier: "project", project_id: projectId, client_id: null }]);
  await page.screenshot(shot("project-knowledge"));
});

test("the sitemap import stores each page with its real title, falling back to the path", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/sitemap`);
  await expect(page.getByText(/^Not imported yet\. The page list is read from localhost:\d+\/sitemap\.xml\.$/)).toBeVisible();
  await page.getByRole("button", { name: "Import sitemap" }).click();
  await expect(page.getByText("Imported 4 pages. 3 titles read from the pages; 1 use their path because their pages did not answer or had no title.")).toBeVisible();
  const table = page.getByRole("table", { name: "Pages from the sitemap" });
  await expect(table.getByRole("row")).toHaveCount(5);
  await expect(table.getByRole("row", { name: /\/renovation-services\/bathroom/ })).toContainText("Bathroom Renovation in London & Essex | Example Interiors");
  await expect(table.getByRole("row", { name: /\/broken/ }).getByRole("cell").first()).toHaveText("/broken");
  await expect(page.getByText(/last read/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import again" })).toBeVisible();
  await page.screenshot(shot("project-sitemap"));

  // Re-import replaces the list rather than adding to it.
  delete pages["/locations/chigwell"];
  await page.getByRole("button", { name: "Import again" }).click();
  await expect(page.getByText(/^Imported 3 pages\./)).toBeVisible();
  const stored = await query<{ path: string }>("select path from site_pages where project_id = $1 order by path", [projectId]);
  expect(stored.map((row) => row.path)).toEqual(["/", "/broken", "/renovation-services/bathroom"]);

  await page.goto(`/projects/${projectId}/knowledge`);
  await expect(page.getByText("3 site pages imported.")).toBeVisible();
});

test("settings save the project, and the change shows on Projects", async ({ page, signedIn }) => {
  void signedIn;
  const [before] = await query<{ status_changed_at: Date }>("select status_changed_at from projects where id = $1", [projectId]);
  await page.goto(`/projects/${projectId}/settings`);
  const form = page.getByRole("form", { name: "Project settings" });
  await expect(form.getByRole("combobox", { name: "Marketing package" })).toHaveValue("entry");
  await form.getByRole("combobox", { name: "Marketing package" }).selectOption("mid");
  await form.getByRole("combobox", { name: "Status" }).selectOption("paused");
  await form.getByRole("textbox", { name: "Website URL" }).fill("not a url");
  await form.getByRole("button", { name: "Save settings" }).click();
  await expect(form.getByText("Enter a website address such as https://www.example.com.")).toBeVisible();
  await form.getByRole("textbox", { name: "Website URL" }).fill(siteUrl);
  await form.getByRole("button", { name: "Save settings" }).click();
  await expect(form.getByText("Settings saved")).toBeVisible();
  const [after] = await query<{ package: string; status: string; status_changed_at: Date }>(
    "select package, status, status_changed_at from projects where id = $1",
    [projectId],
  );
  expect(after.package).toBe("mid");
  expect(after.status).toBe("paused");
  expect(after.status_changed_at.getTime()).toBeGreaterThan(before.status_changed_at.getTime());
  await page.screenshot(shot("project-settings"));

  await page.goto("/projects");
  const card = page.getByRole("link", { name: /Migss Interiors website/ });
  await expect(card).toContainText("Mid · 2 posts a week");
  await expect(card).toContainText("Paused");
});

test("the Drive folder is checked before it is saved", async ({ page, signedIn }) => {
  void signedIn;
  // No stored Google connection, whatever ran before (the γ1 Drive proof spec used to clear it).
  const [user] = await query<{ id: string }>("select id from users where email = $1", [TEST_EMAIL]);
  await query("delete from google_tokens where user_id = $1", [user.id]);
  await page.goto(`/projects/${projectId}/settings`);
  const field = page.getByRole("textbox", { name: "Folder link or ID" });
  await expect(page.getByText("No folder set yet.")).toBeVisible();
  await page.getByRole("button", { name: "Check and save folder" }).click();
  await expect(page.getByText("Paste a Google Drive folder link or ID.")).toBeVisible();
  await field.fill("https://example.com/not-drive");
  await page.getByRole("button", { name: "Check and save folder" }).click();
  await expect(page.getByText(/That is not a Google Drive folder link or ID\./)).toBeVisible();
  // The Playwright user has no stored Google connection, so the check stops there and nothing is saved.
  await field.fill("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345?usp=sharing");
  await page.getByRole("button", { name: "Check and save folder" }).click();
  await expect(page.getByText("No Google connection is stored. Reconnect Google in Settings, Connections, then try again.")).toBeVisible();
  const [row] = await query<{ drive_folder_id: string | null }>("select drive_folder_id from projects where id = $1", [projectId]);
  expect(row.drive_folder_id).toBeNull();
  await page.screenshot(shot("project-drive-error"));
});

test("Content and performance is an empty state, and a paused project's Run plan says so", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto(`/projects/${projectId}/content`);
  await expect(page.getByRole("heading", { name: "No performance figures yet" })).toBeVisible();
  // The settings test above paused this project.
  await page.goto(`/projects/${projectId}/plan`);
  await expect(page.getByText("Paused: no planned slots. Resume it in Settings to plan again.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Run plan" })).toHaveAttribute("aria-current", "page");
});

test("an unknown project shows the not-found page", async ({ page, signedIn }) => {
  void signedIn;
  await page.goto("/projects/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed/knowledge");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});
