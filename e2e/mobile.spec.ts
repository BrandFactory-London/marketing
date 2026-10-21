import { expect, query, test, resetDomain } from "./fixtures";

// Phone width (390px) screenshots of every screen γ2 and γ3 add, with a check that none scrolls sideways.
// Wide tables scroll inside their own wrapper, not the page.

test.describe.configure({ mode: "serial" });

let clientId = "";
let projectId = "";

test.beforeAll(async () => {
  await resetDomain();
  const [client] = await query<{ id: string }>(
    "insert into clients (name, main_contact, email) values ('Migss Interiors', 'Migss office', 'hello@migssinteriors.com') returning id",
  );
  clientId = client.id;
  const [project] = await query<{ id: string }>(
    "insert into projects (client_id, name, site_url, package, status) values ($1, 'Migss Interiors website', 'https://www.migssinteriors.com', 'entry', 'active') returning id",
    [clientId],
  );
  projectId = project.id;
  await query(
    `insert into knowledge_versions (tier, client_id, version, sections) values ('client', $1, 1, $2)`,
    [clientId, JSON.stringify({ business_facts: "## Business\nBathroom and kitchen renovation company serving London.", voice: "", examples: "", counter_examples: "" })],
  );
  await query(
    `insert into site_pages (project_id, url, path, title, lastmod) values
      ($1, 'https://www.migssinteriors.com/', '/', 'Migss Interiors | Bathroom & Kitchen Renovation in London & Essex', '2026-10-15'),
      ($1, 'https://www.migssinteriors.com/renovation-services/bathroom', '/renovation-services/bathroom', 'Bathroom Renovation in London & Essex | Migss Interiors', '2026-10-15')`,
    [projectId],
  );
  await query("update projects set sitemap_imported_at = now() where id = $1", [projectId]);
});

const screens = () => [
  { name: "home", path: "/" },
  { name: "crm", path: "/crm" },
  { name: "client", path: `/crm/${clientId}` },
  { name: "projects", path: "/projects" },
  { name: "project-knowledge", path: `/projects/${projectId}/knowledge` },
  { name: "project-sitemap", path: `/projects/${projectId}/sitemap` },
  { name: "project-settings", path: `/projects/${projectId}/settings` },
  { name: "settings-rules", path: "/settings/rules" },
  { name: "settings-models", path: "/settings/models" },
  { name: "settings-connections", path: "/settings/connections" },
  { name: "calendar", path: "/calendar" },
  { name: "posts", path: "/posts" },
  { name: "project-plan", path: `/projects/${projectId}/plan` },
];

test("every γ2 and γ3 screen fits a 390px phone without sideways scrolling", async ({ page, signedIn }) => {
  void signedIn;
  await page.setViewportSize({ width: 390, height: 844 });
  for (const screen of screens()) {
    await page.goto(screen.path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, screen.path).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `e2e/screenshots/mobile-${screen.name}.png`, fullPage: true, animations: "disabled" });
  }
});
