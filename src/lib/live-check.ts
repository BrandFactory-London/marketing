import { and, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { postPublications, posts, projectPillars, publishEvents } from "@/db/schema";
import { currentText } from "./review";

// The live check (design decision 19, γ6 orientation Q5): fetch the post's page on the client's site and confirm its
// title is there before the post is marked Published. The Migss blog refreshes from Wix every 60 seconds, so the
// check looks every 20 seconds for up to 5 minutes. Redirects (www and non-www) are followed (orientation approval).

export const CHECK_INTERVAL_MS = 20_000;
export const CHECK_BUDGET_MS = 5 * 60_000;
export const MAX_REDIRECTS = 5;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', pound: "£", ndash: "-", mdash: "-", hellip: "..." };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

// Lower case, entities decoded, curly quotes made straight, dashes and spaces evened out.
export function normaliseText(text: string): string {
  return decodeEntities(text.replace(/<[^>]+>/g, " "))
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type PageExpectations = { title: string; excerpt: string; wixFileId: string | null; tagLabel: string | null };

// What the page showed. Only the title decides Published; the rest is recorded for the smoke and the gate.
export type PageReading = { titleFound: boolean; seen: { h1: boolean; titleTag: boolean; metaDescription: boolean; cover: boolean; tag: boolean } };

export function readPage(html: string, expected: PageExpectations): PageReading {
  const title = normaliseText(expected.title);
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => normaliseText(match[1]));
  const titleTag = normaliseText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const description = normaliseText(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? "");
  const ogImage = /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? "";
  const seen = {
    h1: title.length > 0 && h1s.some((h1) => h1.includes(title)),
    titleTag: title.length > 0 && titleTag.includes(title),
    metaDescription: expected.excerpt.trim().length > 0 && description === normaliseText(expected.excerpt),
    cover: Boolean(expected.wixFileId) && ogImage.includes(expected.wixFileId!),
    tag: Boolean(expected.tagLabel) && normaliseText(html).includes(normaliseText(expected.tagLabel!)),
  };
  return { titleFound: seen.h1 || seen.titleTag, seen };
}

export type FetchedPage = { status: number; finalUrl: string; html: string | null };

// Follows up to five redirects by hand, so the URL the page finally came from is known.
export async function fetchPage(url: string, fetchImpl: typeof fetch = fetch): Promise<FetchedPage> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(current, { redirect: "manual", cache: "no-store", headers: { "user-agent": "BrandFactory Marketing live check", accept: "text/html" } });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return { status: response.status, finalUrl: current, html: response.ok ? await response.text() : null };
  }
  return { status: 0, finalUrl: current, html: null };
}

export type LiveCheckDeps = {
  db?: Database;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  budgetMs?: number;
};

export type LiveCheckResult = { confirmed: boolean; attempts: number; lastStatus: number | null; finalUrl: string | null; reason: string | null };

// Runs in the confirm-live task. Confirms the post (Published, with its live URL) or leaves it Approved with
// the not-confirmed line (PUBLISH_LINES) and the last thing the page said.
export async function runLiveCheck(publicationId: string, deps: LiveCheckDeps = {}): Promise<LiveCheckResult> {
  const db = deps.db ?? getDb();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  const interval = deps.intervalMs ?? CHECK_INTERVAL_MS;
  const budget = deps.budgetMs ?? CHECK_BUDGET_MS;

  const [row] = await db
    .select({ publication: postPublications, post: posts, tagLabel: projectPillars.label })
    .from(postPublications)
    .innerJoin(posts, eq(posts.id, postPublications.postId))
    .leftJoin(projectPillars, eq(projectPillars.id, posts.pillarId))
    .where(eq(postPublications.id, publicationId));
  if (!row || row.publication.state !== "checking" || !row.publication.liveUrl) {
    return { confirmed: row?.publication.state === "live", attempts: 0, lastStatus: null, finalUrl: null, reason: "Nothing to check." };
  }
  const { publication, post } = row;
  const text = await currentText(post.id, db);
  const expected: PageExpectations = { title: text?.text.title ?? "", excerpt: text?.text.excerpt ?? "", wixFileId: publication.wixFileId, tagLabel: row.tagLabel };

  const started = now();
  let attempts = 0;
  let last: FetchedPage | null = null;
  let reading: PageReading | null = null;
  let reason: string | null = null;
  while (true) {
    attempts++;
    try {
      last = await fetchPage(publication.liveUrl!, fetchImpl);
      reading = last.html ? readPage(last.html, expected) : null;
      reason = !last.html ? `the page answered with status ${last.status}` : reading?.titleFound ? null : "the page loaded, but the post's title was not on it";
    } catch (error) {
      last = null;
      reason = `the page could not be reached (${error instanceof Error ? error.message : String(error)})`;
    }
    if (reading?.titleFound) break;
    if (now() - started + interval >= budget) break;
    await sleep(interval);
  }

  const details = { attempts, lastStatus: last?.status ?? null, finalUrl: last?.finalUrl ?? null, seen: reading?.seen ?? null };
  if (reading?.titleFound) {
    await db.transaction(async (tx) => {
      const finalUrl = last?.finalUrl ?? publication.liveUrl!;
      await tx
        .update(postPublications)
        .set({ state: "live", confirmedAt: sql`now()`, liveUrl: finalUrl, error: null, heartbeatAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(postPublications.id, publicationId));
      await tx
        .update(posts)
        .set({ status: "published", publishedAt: sql`now()`, liveUrl: finalUrl, statusChangedAt: sql`now()`, updatedAt: sql`now()` })
        .where(and(eq(posts.id, post.id), eq(posts.status, "approved")));
      await tx.insert(publishEvents).values({ publicationId, step: "live", result: "ok", httpStatus: last?.status ?? null, message: `The live page shows the title (after ${attempts} ${attempts === 1 ? "look" : "looks"}).`, details });
    });
    return { confirmed: true, attempts, lastStatus: last?.status ?? null, finalUrl: last?.finalUrl ?? null, reason: null };
  }
  const minutes = Math.round(budget / 60_000);
  const message = `Wix accepted this post, but the live page did not show it within ${minutes} ${minutes === 1 ? "minute" : "minutes"}: ${reason}.`;
  await db
    .update(postPublications)
    .set({ state: "not_confirmed", error: message, heartbeatAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(postPublications.id, publicationId));
  await db.insert(publishEvents).values({ publicationId, step: "live", result: "failed", httpStatus: last?.status ?? null, message, details });
  return { confirmed: false, attempts, lastStatus: last?.status ?? null, finalUrl: last?.finalUrl ?? null, reason };
}
