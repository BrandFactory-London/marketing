import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { projects, sitePages } from "@/db/schema";

// Reads a project's page list from its sitemap.xml (design decision 8). Sitemaps carry no titles, so each
// page's <title> is fetched, six at a time. The whole import has a time budget: once it runs short, the
// remaining pages use their path as the title instead of failing the import.

export type SitemapEntry = { loc: string; lastmod: Date | null };
export type ParsedSitemap = { kind: "urlset"; urls: SitemapEntry[] } | { kind: "index"; sitemaps: string[] };

export type ImportedPage = { url: string; path: string; title: string; lastmod: Date | null; titleFromPage: boolean };

export type SitemapReadResult = {
  sitemapUrl: string;
  pages: ImportedPage[];
  titlesFetched: number;
  titlesFromPath: number;
  budgetRanOut: boolean;
};

export type SitemapOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  budgetMs?: number;
  concurrency?: number;
  pageTimeoutMs?: number;
  maxUrls?: number;
  maxChildSitemaps?: number;
};

export const SITEMAP_DEFAULTS = {
  budgetMs: 45_000,
  concurrency: 6,
  pageTimeoutMs: 10_000,
  maxUrls: 500,
  maxChildSitemaps: 20,
};

// Below this much budget left, a page title is not worth starting: the path is used instead.
const MIN_TITLE_FETCH_MS = 1_000;
const USER_AGENT = "BrandFactoryMarketing/1.0 (sitemap import)";

export class SitemapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SitemapError";
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function unwrap(text: string): string {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(text.trim());
  return cdata ? cdata[1].trim() : decodeEntities(text.trim());
}

function tag(block: string, name: string): string | null {
  const match = new RegExp(`<(?:[a-z0-9]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${name}>`, "i").exec(block);
  return match ? unwrap(match[1]) : null;
}

export function parseSitemap(xml: string): ParsedSitemap {
  if (/<(?:[a-z0-9]+:)?sitemapindex[\s>]/i.test(xml)) {
    const sitemaps = [...xml.matchAll(/<(?:[a-z0-9]+:)?sitemap[\s>][\s\S]*?<\/(?:[a-z0-9]+:)?sitemap>/gi)]
      .map((match) => tag(match[0], "loc"))
      .filter((loc): loc is string => Boolean(loc));
    return { kind: "index", sitemaps };
  }
  if (!/<(?:[a-z0-9]+:)?urlset[\s>]/i.test(xml)) throw new SitemapError("The sitemap is not a valid sitemap.xml file.");
  const urls = [...xml.matchAll(/<(?:[a-z0-9]+:)?url[\s>][\s\S]*?<\/(?:[a-z0-9]+:)?url>/gi)]
    .map((match) => {
      const loc = tag(match[0], "loc");
      const lastmodText = tag(match[0], "lastmod");
      const lastmod = lastmodText ? new Date(lastmodText) : null;
      return loc ? { loc, lastmod: lastmod && !Number.isNaN(lastmod.getTime()) ? lastmod : null } : null;
    })
    .filter((entry): entry is SitemapEntry => entry !== null);
  return { kind: "urlset", urls };
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return title === "" ? null : title;
}

// "/" stays "/"; "/blog/post/" becomes "/blog/post".
export function pagePath(url: string): string {
  const { pathname } = new URL(url);
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

export async function readSitemap(siteUrl: string, options: SitemapOptions = {}): Promise<SitemapReadResult> {
  const settings = { ...SITEMAP_DEFAULTS, ...options };
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const deadline = now() + settings.budgetMs;
  const remaining = () => deadline - now();

  const site = new URL(siteUrl);
  if (site.protocol !== "https:" && site.protocol !== "http:") throw new SitemapError("The website address must start with https://.");
  const sitemapUrl = new URL("/sitemap.xml", site).toString();
  // Only the project's own site is read, with or without "www.", so the import cannot be pointed elsewhere.
  const sameSite = (url: string) => {
    try {
      const parsed = new URL(url);
      return (parsed.protocol === "https:" || parsed.protocol === "http:") && bareHost(parsed.host) === bareHost(site.host);
    } catch {
      return false;
    }
  };

  async function get(url: string, timeoutMs: number): Promise<Response> {
    return fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml,text/html;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
  }

  async function getSitemap(url: string): Promise<ParsedSitemap> {
    let response: Response;
    try {
      response = await get(url, Math.min(15_000, remaining()));
    } catch {
      throw new SitemapError(`Could not reach ${url}. Check the website address in Settings.`);
    }
    if (response.status === 404) throw new SitemapError(`The site has no sitemap at ${url}.`);
    if (!response.ok) throw new SitemapError(`${url} answered with status ${response.status}.`);
    return parseSitemap(await response.text());
  }

  const root = await getSitemap(sitemapUrl);
  let entries: SitemapEntry[];
  if (root.kind === "index") {
    const children = root.sitemaps.filter(sameSite).slice(0, settings.maxChildSitemaps);
    entries = [];
    for (const child of children) {
      const parsed = await getSitemap(child);
      if (parsed.kind === "urlset") entries.push(...parsed.urls);
    }
  } else {
    entries = root.urls;
  }

  const seen = new Set<string>();
  const unique = entries.filter((entry) => {
    if (!sameSite(entry.loc) || seen.has(entry.loc)) return false;
    seen.add(entry.loc);
    return true;
  });
  if (unique.length === 0) throw new SitemapError("The sitemap lists no pages on this site.");
  if (unique.length > settings.maxUrls) {
    throw new SitemapError(`The sitemap lists ${unique.length} pages, more than the ${settings.maxUrls} this import reads.`);
  }

  const pages: ImportedPage[] = unique.map((entry) => ({
    url: entry.loc,
    path: pagePath(entry.loc),
    title: pagePath(entry.loc),
    lastmod: entry.lastmod,
    titleFromPage: false,
  }));

  let budgetRanOut = false;
  let next = 0;
  async function worker() {
    while (next < pages.length) {
      const page = pages[next++];
      const left = remaining();
      if (left < MIN_TITLE_FETCH_MS) {
        budgetRanOut = true;
        continue;
      }
      try {
        const response = await get(page.url, Math.min(settings.pageTimeoutMs, left));
        if (!response.ok) continue;
        const title = extractTitle(await response.text());
        if (title) {
          page.title = title;
          page.titleFromPage = true;
        }
      } catch {
        // A slow or failing page keeps its path as the title.
        if (remaining() < MIN_TITLE_FETCH_MS) budgetRanOut = true;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(settings.concurrency, pages.length) }, worker));

  const titlesFetched = pages.filter((page) => page.titleFromPage).length;
  return { sitemapUrl, pages, titlesFetched, titlesFromPath: pages.length - titlesFetched, budgetRanOut };
}

export type SitePage = typeof sitePages.$inferSelect;

// Replaces the project's page list in one transaction and records the import time.
export async function importSitemap(
  project: { id: string; siteUrl: string },
  options: SitemapOptions = {},
  db: Database = getDb(),
): Promise<SitemapReadResult> {
  const result = await readSitemap(project.siteUrl, options);
  await db.transaction(async (tx) => {
    await tx.delete(sitePages).where(eq(sitePages.projectId, project.id));
    await tx.insert(sitePages).values(
      result.pages.map((page) => ({ projectId: project.id, url: page.url, path: page.path, title: page.title, lastmod: page.lastmod })),
    );
    await tx.update(projects).set({ sitemapImportedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(projects.id, project.id));
  });
  return result;
}

export async function listSitePages(projectId: string, db: Database = getDb()): Promise<SitePage[]> {
  return db.select().from(sitePages).where(eq(sitePages.projectId, projectId)).orderBy(asc(sitePages.path));
}
