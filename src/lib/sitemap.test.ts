import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { createClient } from "./clients";
import { createProject, getProject } from "./projects";
import { extractTitle, importSitemap, listSitePages, pagePath, parseSitemap, readSitemap, SitemapError } from "./sitemap";

const site = "https://www.example.com";

function urlset(paths: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
    .map((path) => `<url><loc>${site}${path}</loc><lastmod>2026-10-15T10:02:22.163Z</lastmod></url>`)
    .join("")}</urlset>`;
}

type Route = { status?: number; body?: string; delayMs?: number };

// A fake fetch that serves fixed routes, honours the abort signal, and records each request.
function fakeFetch(routes: Record<string, Route>) {
  const requested: string[] = [];
  let active = 0;
  let peak = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requested.push(url);
    active += 1;
    peak = Math.max(peak, active);
    try {
      const route = routes[url];
      if (route?.delayMs) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, route.delayMs);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted", "TimeoutError"));
          });
        });
      }
      if (!route) return new Response("Not found", { status: 404 });
      return new Response(route.body ?? "", { status: route.status ?? 200 });
    } finally {
      active -= 1;
    }
  }) as typeof fetch;
  return { impl, requested, peak: () => peak };
}

const page = (title: string, delayMs?: number): Route => ({ body: `<html><head><title> ${title} </title></head></html>`, delayMs });

describe("sitemap parsing", () => {
  it("reads locations and lastmod from a urlset", () => {
    const parsed = parseSitemap(urlset(["/", "/blog/post"]));
    expect(parsed).toEqual({
      kind: "urlset",
      urls: [
        { loc: `${site}/`, lastmod: new Date("2026-10-15T10:02:22.163Z") },
        { loc: `${site}/blog/post`, lastmod: new Date("2026-10-15T10:02:22.163Z") },
      ],
    });
  });

  it("reads a sitemap index, entities and CDATA", () => {
    const xml = `<sitemapindex><sitemap><loc>${site}/pages.xml?a=1&amp;b=2</loc></sitemap><sitemap><loc><![CDATA[${site}/blog.xml]]></loc></sitemap></sitemapindex>`;
    expect(parseSitemap(xml)).toEqual({ kind: "index", sitemaps: [`${site}/pages.xml?a=1&b=2`, `${site}/blog.xml`] });
  });

  it("refuses something that is not a sitemap", () => {
    expect(() => parseSitemap("<html></html>")).toThrow(SitemapError);
  });

  it("extracts and decodes page titles", () => {
    expect(extractTitle("<title>Bathroom Renovation in London &amp; Essex | Migss&#39;s</title>")).toBe(
      "Bathroom Renovation in London & Essex | Migss's",
    );
    expect(extractTitle("<title>  </title>")).toBeNull();
    expect(extractTitle("<p>no title</p>")).toBeNull();
  });

  it("turns URLs into paths", () => {
    expect(pagePath(`${site}/`)).toBe("/");
    expect(pagePath(`${site}/blog/post/`)).toBe("/blog/post");
  });
});

describe("reading a sitemap", () => {
  it("fetches every page title, at most six at a time, falling back to the path when a page fails", async () => {
    const paths = ["/", "/a", "/b", "/c", "/d", "/e", "/f", "/g", "/broken"];
    const routes: Record<string, Route> = { [`${site}/sitemap.xml`]: { body: urlset(paths) }, [`${site}/broken`]: { status: 500 } };
    for (const path of paths.slice(0, -1)) routes[`${site}${path}`] = page(`Title ${path}`, 20);
    const fake = fakeFetch(routes);
    const result = await readSitemap(site, { fetchImpl: fake.impl });
    expect(result.sitemapUrl).toBe(`${site}/sitemap.xml`);
    expect(result.pages.map((p) => p.title)).toEqual([...paths.slice(0, -1).map((path) => `Title ${path}`), "/broken"]);
    expect(result).toMatchObject({ titlesFetched: 8, titlesFromPath: 1, budgetRanOut: false });
    expect(fake.peak()).toBeLessThanOrEqual(6);
    expect(fake.peak()).toBeGreaterThan(1);
  });

  it("stops fetching titles when the time budget runs short and uses paths for the rest", async () => {
    const paths = Array.from({ length: 20 }, (_, i) => `/p${i}`);
    const routes: Record<string, Route> = { [`${site}/sitemap.xml`]: { body: urlset(paths) } };
    for (const path of paths) routes[`${site}${path}`] = page(path.toUpperCase(), 400);
    const fake = fakeFetch(routes);
    const started = Date.now();
    const result = await readSitemap(site, { fetchImpl: fake.impl, budgetMs: 1_500, concurrency: 2 });
    expect(Date.now() - started).toBeLessThan(2_500);
    expect(result.pages).toHaveLength(20);
    expect(result.budgetRanOut).toBe(true);
    expect(result.titlesFetched).toBeGreaterThan(0);
    expect(result.titlesFromPath).toBeGreaterThan(0);
    expect(result.titlesFetched + result.titlesFromPath).toBe(20);
    // Pages after the cut keep their path, and were never requested.
    expect(result.pages.at(-1)!.title).toBe("/p19");
    expect(fake.requested).not.toContain(`${site}/p19`);
  });

  it("follows a sitemap index on the same site only", async () => {
    const index = `<sitemapindex><sitemap><loc>${site}/pages.xml</loc></sitemap><sitemap><loc>https://evil.example.org/x.xml</loc></sitemap></sitemapindex>`;
    const fake = fakeFetch({
      [`${site}/sitemap.xml`]: { body: index },
      [`${site}/pages.xml`]: { body: urlset(["/one"]) },
      [`${site}/one`]: page("One"),
    });
    const result = await readSitemap(site, { fetchImpl: fake.impl });
    expect(result.pages.map((p) => p.title)).toEqual(["One"]);
    expect(fake.requested).not.toContain("https://evil.example.org/x.xml");
  });

  it("skips pages on other hosts, accepts the bare domain, and drops duplicates", async () => {
    const xml = `<urlset><url><loc>https://example.com/bare</loc></url><url><loc>https://other.org/x</loc></url><url><loc>https://example.com/bare</loc></url></urlset>`;
    const fake = fakeFetch({ [`${site}/sitemap.xml`]: { body: xml }, "https://example.com/bare": page("Bare") });
    const result = await readSitemap(site, { fetchImpl: fake.impl });
    expect(result.pages.map((p) => [p.url, p.title])).toEqual([["https://example.com/bare", "Bare"]]);
  });

  it("explains a missing sitemap, an empty one, and one that is too large", async () => {
    await expect(readSitemap(site, { fetchImpl: fakeFetch({}).impl })).rejects.toThrow("The site has no sitemap at https://www.example.com/sitemap.xml.");
    await expect(readSitemap(site, { fetchImpl: fakeFetch({ [`${site}/sitemap.xml`]: { body: "<urlset></urlset>" } }).impl })).rejects.toThrow(
      "lists no pages",
    );
    const big = fakeFetch({ [`${site}/sitemap.xml`]: { body: urlset(["/a", "/b", "/c"]) } });
    await expect(readSitemap(site, { fetchImpl: big.impl, maxUrls: 2 })).rejects.toThrow("lists 3 pages, more than the 2");
  });
});

describe.skipIf(!testDatabaseUrl)("importing a sitemap (local Postgres)", () => {
  const { db, close } = createTestDb();
  beforeEach(() => resetDomainTables(db));
  afterAll(async () => {
    await resetDomainTables(db);
    await close();
  });

  it("stores the pages, then replaces them on re-import and records the time", async () => {
    const client = await createClient({ name: "Client", mainContact: null, email: null, phone: null }, db);
    const project = await createProject({ clientId: client.id, name: "Site", siteUrl: site, package: "entry", status: "active", publishingTarget: "wix_blog" }, db);
    const first = fakeFetch({ [`${site}/sitemap.xml`]: { body: urlset(["/", "/old"]) }, [`${site}/`]: page("Home") });
    await importSitemap(project, { fetchImpl: first.impl }, db);
    expect((await listSitePages(project.id, db)).map((p) => [p.path, p.title])).toEqual([["/", "Home"], ["/old", "/old"]]);
    const importedAt = (await getProject(project.id, db))!.sitemapImportedAt;
    expect(importedAt).toBeInstanceOf(Date);

    const second = fakeFetch({ [`${site}/sitemap.xml`]: { body: urlset(["/", "/new"]) }, [`${site}/new`]: page("New page") });
    await importSitemap(project, { fetchImpl: second.impl }, db);
    expect((await listSitePages(project.id, db)).map((p) => [p.path, p.title])).toEqual([["/", "/"], ["/new", "New page"]]);
  });

  it("keeps the old list when the import fails", async () => {
    const client = await createClient({ name: "Client", mainContact: null, email: null, phone: null }, db);
    const project = await createProject({ clientId: client.id, name: "Site", siteUrl: site, package: "entry", status: "active", publishingTarget: "wix_blog" }, db);
    await importSitemap(project, { fetchImpl: fakeFetch({ [`${site}/sitemap.xml`]: { body: urlset(["/kept"]) } }).impl }, db);
    await expect(importSitemap(project, { fetchImpl: fakeFetch({}).impl }, db)).rejects.toThrow(SitemapError);
    expect((await listSitePages(project.id, db)).map((p) => p.path)).toEqual(["/kept"]);
  });
});
