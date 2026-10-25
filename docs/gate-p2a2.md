# Verification gate: Phase 2 session A, checkpoint A2 (the four-tab project page)

Status: **complete.** Typecheck, lint, build, Vitest and Playwright pass. A2 has no migration (orientation amendment, 25 Oct): the app stops naming `projects.package`, and A3's migration drops the column. Per CLAUDE.md the PR is opened and merged, and the production smoke list is at the end. Session A stops after this smoke; A3 starts only on Amir's word.

## Git state

```
Branch: claude/hopeful-carson-fzy00j (pushed). Restarted from main 49b0178 (A1 merged), same name.
Commits since main, before this gate:
5459c47 A2: four project tabs (Details, Run plan, Content and performance, Knowledge), app stops naming projects.package
Status: clean working tree before this gate was written.
```

## LOC delta

Code and tests, excluding `docs/`, `pnpm-lock.yaml`, `drizzle/` and screenshots: `38 files changed, 323 insertions(+), 248 deletions(-)`. The orientation estimated 700; most of A2 is moving existing screens, and git counts the moved Settings files as renames.

## Test count

Vitest, on `5459c47`:
```
 Test Files  45 passed (45)
      Tests  411 passed (411)
```
Playwright, on the same commit:
```
  90 passed (2.6m)
```
Delta from A1 (45 files, 412 tests; 89 Playwright):
- **Vitest:** -1 net (412 to 411).
  - `nav.test.ts`: the tab test now checks the four tabs and the Run plan default; +1 for the redirects (each points at a real tab, and the old page folders are gone).
  - `posts.test.ts`: +1 for the published-posts read (published only, newest first, one project).
  - `projects.test.ts`: the package check test now checks that no query names the column and that a new project leaves it empty.
  - `config/projects.test.ts` (renamed from `packages.test.ts`): the three package tests went with the package helpers, leaving the client status test.
- **Playwright:** +1 net (89 to 90).
  - `project.spec.ts`: opens on Run plan with the four tabs; the Profile on Details (voice read-only, project knowledge versions); the Sitemap on Knowledge; Content and performance listing only a published post with its live link; +1 for the old Settings and Sitemap addresses opening Details and Knowledge.
  - `mobile.spec.ts`: the four tabs at 390px.
  - `batches.spec.ts`, `publish.spec.ts`, `run-plan-posts.spec.ts`: Details instead of Settings; the knowledge version link now points to Details.

## Typecheck + lint

```
Typecheck: clean (tsc --noEmit after Next's route types)
Lint: clean, 0 problems
Build: pnpm build succeeds (Playwright's web server builds it)
```

## Migrations

**None in A2.** The orientation planned `0009_drop_package` here. Before building, it turned out that Drizzle names every column it reads, so the live A1 version selects `"package"` on every projects query:
```
select "id", "client_id", "name", "site_url", "package", "status", ... from "projects"
```
Dropping the column during A2's build would have broken A1 until A2 was serving, and left it broken if the build failed. Amir chose to stop naming it in A2 and drop it in A3's migration (`0010`); recorded in `docs/orientation-p2a.md`.

Independent check on Neon dev (host `ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech`), full output:
```
journal: 9 (0008_runs), applied on dev: 9
projects.package: [{"column_name":"package","is_nullable":"YES"}]
check: [{"conname":"projects_package_check"}]
projects by package: [{"package":"premium","n":1}]
```
So there is nothing to rehearse or migrate on dev, and production's build should log "Nothing pending" with no backup branch.

## Consumer audit (D.3.3)

- **The Settings tab (`/projects/[id]/settings`):** moved to `details/`. Links: the Connections page's Wix link (now `/details#wix-heading`), copy in the project form and Connections ("Details tab"), every e2e spec. The old address redirects (`next.config.ts`, from `PROJECT_TAB_REDIRECTS`). Grep for project `/settings` links in `src`: none left (verified clean).
- **The Sitemap tab (`/projects/[id]/sitemap`):** folded into Knowledge (`ImportSitemap.tsx`, `sitemap-actions.ts`). Links: the Knowledge page's own link (removed), the allowed-links help text, the Content empty state (replaced). The old address redirects. Grep: none left (verified clean).
- **Project knowledge (`KnowledgeTier` for the project):** moved from Knowledge to Details. Its version links (`drafts.ts`, the draft view's "version N" links) now point to `/details?version=N`.
- **`DEFAULT_PROJECT_TAB`:** read by `next.config.ts` only; now `plan`.
- **`projects.package`:** removed from the Drizzle schema; `PACKAGES`, `getPackage`, `packageSummary`, `packageOption`, `isPackageKey`, `PackageKey` deleted. Grep: no reader or writer left in `src`. `src/config/packages.ts` renamed to `src/config/projects.ts`, 9 importers updated.
- **Copy:** the two "No projects yet" empty states no longer promise a package.

## What was verified vs code-inspection only

**Verified (how):**
- The four tabs, their order and the Run plan default; the redirects; the Profile, the Sitemap on Knowledge and the published-posts list (Playwright, desktop).
- Every tab at 390px with no sideways scroll (Playwright `mobile.spec.ts`).
- Screens looked at: `project-details`, `project-content` at desktop, `mobile-project-knowledge` at 390px.
- No query names `projects.package`; Neon dev has nothing pending and still has the column (Vitest, the dev check above).

**Code-inspection only (needs smoke):**
- Production's build log showing nothing pending (checked after merge, below).
- Production data on the moved screens: Migss's real profile sections, client voice, Wix row and sitemap appear on their new tabs.

## Deliberately unchanged / out of scope

- The `projects.package` column and its check stay in the database until A3.
- Positioning (session B), Search Console and GA4 figures (session B), the Knowledge tab's replacement (session B).
- The planner and client link (A3), fortnightly generation (A4).

## Smoke instructions for Amir

1. Open Migss from Projects. It should open on **Run plan**, with the tabs **Details, Run plan, Content and performance, Knowledge**.
2. Open **Details**. The Profile shows Migss's brand voice (read only, with "Edit it on the client page") and the project knowledge with the same versions as before. Below it: project settings, pillar tags, the Drive folder and Wix Blog publishing, each as it was. Report back if any value is missing.
3. On a post's draft, follow a "version N" link for the project knowledge: it opens Details at that version.
4. Open **Content and performance**: the published wet room post with its live link, and nothing else. Follow the link to the live page.
5. Open **Knowledge**: the note about where the knowledge comes from, and the Sitemap with its pages. Select **Import again** only if you want to refresh it.
6. Type an old address, `/projects/<id>/settings` or `/projects/<id>/sitemap`: it opens Details or Knowledge.
7. On a phone, open each of the four tabs: nothing scrolls sideways.

## What the next checkpoint picks up

A3 (planner, client link, `0010` with the package drop), only when Amir says to start it.
