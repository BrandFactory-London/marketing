import { expect, query, test } from "./fixtures";

// γ2.2: CRM, the Client page with its knowledge editor, Projects and the Home gallery, as one serial story
// against the local test database. Screenshots go to e2e/screenshots/ for the visual check.

const facts = `## Business
Bathroom and kitchen renovation company serving London, with a core area of Chigwell and Loughton, plus Ilford, Essex and Epping Forest.

## Services
- Fit only: Migss installs a bathroom the customer has already bought.
- Full design, supply and build.

## Locations
- Chigwell
- Loughton
- Ilford`;

test.describe.configure({ mode: "serial" });

test.describe("CRM, client and projects", () => {
  test.beforeAll(async () => {
    await query("delete from site_pages");
    await query("delete from knowledge_versions");
    await query("delete from projects");
    await query("delete from clients");
  });

  test("an empty CRM shows the three packages and no clients", async ({ page, signedIn }) => {
    void signedIn;
    await page.goto("/crm");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CRM");
    const packages = page.getByRole("region", { name: "Marketing packages" });
    for (const name of ["Entry", "Mid", "Premium"]) await expect(packages.getByText(name, { exact: true })).toBeVisible();
    await expect(packages.getByText("No projects")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "No clients yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  });

  test("adding a client checks the fields, then opens the client page", async ({ page, signedIn }) => {
    void signedIn;
    await page.goto("/crm");
    await page.getByRole("button", { name: "Add client" }).click();
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Save client" }).click();
    await expect(page.getByText("Enter the client's name.")).toBeVisible();
    await expect(page.getByText("Enter an email address such as name@business.com.")).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/crm-add-errors.png", fullPage: true, animations: "disabled" });

    await page.getByLabel("Client name").fill("Migss Interiors");
    await page.getByLabel("Main contact").fill("Migss office");
    await page.getByLabel("Email").fill("hello@migssinteriors.com");
    await page.getByRole("button", { name: "Save client" }).click();
    await expect(page).toHaveURL(/\/crm\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Migss Interiors");
    await expect(page.getByText("Migss office · hello@migssinteriors.com")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "CRM", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("editing a client updates the header", async ({ page, signedIn }) => {
    void signedIn;
    await page.goto("/crm");
    await page.getByRole("link", { name: "Migss Interiors" }).click();
    await page.getByRole("button", { name: "Edit client" }).click();
    await expect(page.getByLabel("Client name")).toHaveValue("Migss Interiors");
    await page.getByLabel("Phone").fill("020 0000 0000");
    await page.getByRole("button", { name: "Save client" }).click();
    await expect(page.getByText("Migss office · hello@migssinteriors.com · 020 0000 0000")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save client" })).toHaveCount(0);
  });

  test("client knowledge saves versions and keeps old ones readable", async ({ page, signedIn }) => {
    void signedIn;
    await page.goto("/crm");
    await page.getByRole("link", { name: "Migss Interiors" }).click();
    const editor = page.getByRole("form", { name: "Client knowledge" });
    const sections = editor.getByRole("navigation", { name: "Client knowledge sections" });
    await expect(sections.getByRole("button")).toHaveText(["Business factsEmpty", "VoiceEmpty", "ExamplesEmpty", "Counter-examplesEmpty"]);
    await expect(editor.getByText("Not saved yet")).toBeVisible();
    await expect(editor.getByRole("button", { name: "Save version" })).toBeDisabled();

    await editor.getByLabel("Business facts (Markdown)").fill(facts);
    await sections.getByRole("button", { name: /Voice/ }).click();
    await expect(editor.getByLabel("Business facts (Markdown)")).toBeHidden();
    await editor.getByLabel("Voice (Markdown)").fill('Speak to homeowners as "you" and to Migss as "we".');
    await expect(editor.getByText("Unsaved changes")).toBeVisible();
    await editor.getByRole("button", { name: "Save version" }).click();
    await expect(editor.getByText(/^Version 1, saved .* · Saved as version 1$/)).toBeVisible();
    await expect(sections.getByRole("button", { name: /Business facts/ })).toContainText("words");
    await sections.getByRole("button", { name: /Business facts/ }).click();
    await page.screenshot({ path: "e2e/screenshots/client.png", fullPage: true, animations: "disabled" });

    await page.reload();
    await expect(editor.getByLabel("Business facts (Markdown)")).toHaveValue(facts);
    await sections.getByRole("button", { name: /Voice/ }).click();
    await editor.getByLabel("Voice (Markdown)").fill('Speak to homeowners as "you" and to Migss as "we". Prefer practical guidance.');
    await editor.getByRole("button", { name: "Save version" }).click();
    await expect(editor.getByText(/^Version 2, saved /)).toBeVisible();

    const rows = await query<{ version: number }>("select version from knowledge_versions where tier = 'client' order by version");
    expect(rows.map((row) => row.version)).toEqual([1, 2]);

    await page.getByText("View versions (2)").click();
    await page.getByRole("link", { name: "Version 1" }).click();
    await expect(page).toHaveURL(/\?version=1$/);
    await expect(page.getByText(/Viewing version 1 of 2, saved .*Read only\./)).toBeVisible();
    await expect(page.getByText('Speak to homeowners as "you" and to Migss as "we".', { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save version" })).toHaveCount(0);
    await page.screenshot({ path: "e2e/screenshots/client-version.png", fullPage: true, animations: "disabled" });
    await page.getByRole("link", { name: "Back to the current version" }).click();
    await expect(page.getByRole("button", { name: "Save version" })).toBeVisible();
  });

  test("adding a project from the client page preselects the client", async ({ page, signedIn }) => {
    void signedIn;
    await page.goto("/crm");
    await page.getByRole("link", { name: "Migss Interiors" }).click();
    await page.getByRole("link", { name: "Add project" }).click();
    await expect(page).toHaveURL(/\/projects\?add=1&client=/);
    await expect(page.getByRole("combobox", { name: "Client" })).toHaveText("Migss Interiors");
    await page.getByRole("button", { name: "Save project" }).click();
    await expect(page.getByText("Enter a project name.")).toBeVisible();
    await expect(page.getByText("Enter the website address.")).toBeVisible();
    await page.getByRole("textbox", { name: "Project name" }).fill("Migss Interiors website");
    await page.getByRole("textbox", { name: "Website URL" }).fill("www.migssinteriors.com");
    await page.screenshot({ path: "e2e/screenshots/projects-add.png", fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "Save project" }).click();
    // The project page itself arrives in γ2.3.
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const [row] = await query<{ site_url: string; package: string; status: string; publishing_target: string }>(
      "select site_url, package, status, publishing_target from projects",
    );
    expect(row).toEqual({ site_url: "https://www.migssinteriors.com", package: "entry", status: "active", publishing_target: "wix_blog" });
  });

  test("Projects groups cards by client, and CRM and Home show the project", async ({ page, signedIn }) => {
    void signedIn;
    await page.goto("/projects");
    const group = page.getByRole("region", { name: "Migss Interiors" });
    const card = group.getByRole("link", { name: /Migss Interiors website/ });
    await expect(card).toContainText("migssinteriors.com");
    await expect(card).toContainText("Entry · 1 post a week");
    await expect(card).toContainText("Wix Blog");
    await expect(card).toContainText("Active");
    await page.screenshot({ path: "e2e/screenshots/projects.png", fullPage: true, animations: "disabled" });

    await page.goto("/crm");
    const table = page.getByRole("table");
    await expect(table.getByRole("row", { name: /Migss Interiors/ })).toContainText("Migss Interiors website: Entry");
    await expect(table.getByRole("row", { name: /Migss Interiors/ })).toContainText("Active");
    await expect(page.getByText("1 project: Migss Interiors website")).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/crm.png", fullPage: true, animations: "disabled" });

    await page.goto("/crm");
    await page.getByRole("link", { name: "Migss Interiors" }).click();
    await expect(page.getByRole("region", { name: "Projects" }).getByRole("link", { name: /Migss Interiors website/ })).toContainText("Entry · 1 post a week");
    await page.screenshot({ path: "e2e/screenshots/client-with-project.png", fullPage: true, animations: "disabled" });

    await page.goto("/");
    const tile = page.getByRole("region", { name: "Projects" }).getByRole("link", { name: /Migss Interiors website/ });
    await expect(tile).toContainText("Migss Interiors · Wix Blog");
    await expect(page.getByRole("link", { name: "Add project" })).toHaveAttribute("href", "/projects?add=1");
    await expect(page.getByRole("heading", { name: "Next two weeks" })).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/home.png", fullPage: true, animations: "disabled" });
  });

  // The page streams, so notFound() runs after the status line is sent: the not-found page shows with a 200.
  test("an unknown or malformed client shows the not-found page", async ({ page, signedIn }) => {
    void signedIn;
    for (const path of ["/crm/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", "/crm/not-a-client"]) {
      await page.goto(path);
      await expect(page.getByText("This page could not be found.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit client" })).toHaveCount(0);
    }
  });
});
