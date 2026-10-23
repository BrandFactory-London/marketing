# Verification gate: Phase 2 session A, checkpoint A1 (runs and slots)

Status: **complete.** Typecheck, lint, build, Vitest and Playwright pass. Neon dev is migrated and independently checked. Per CLAUDE.md the PR is opened and merged, and the production smoke list is at the end.

## Git state

```
Branch: claude/hopeful-carson-fzy00j (pushed). Restarted from main c98d6bd (γ8 merged), same name.
Commits since main, before this gate:
e10bc93 A1: run form fits phone width (run table and form grid reset under 600px)
12c86d0 A1: e2e expects fewer slots when a month has fewer days on the new weekdays
efd135c A1: exact Date label in e2e, so the derived slot's date field is not matched
8c508da A1: run preview dates with the weekday, CRM copy and spec for run presets
0c999ff A1: runs, presets, cadence engine, typed SEO and derived slots, Run 1 migration, derived calendar events
1b9ad28 Record Phase 2 session A orientation approval
e7fe94b Add Phase 2 session A orientation report (A1 to A4)
9bb0b45 Phase 2 session A handoff: the run workflow
Status: clean working tree before this gate was written.
```

## LOC delta

Code and tests, excluding `docs/`, `pnpm-lock.yaml`, `drizzle/` and screenshots: `54 files changed, 2362 insertions(+), 471 deletions(-)`. The orientation estimated 1,900. The overshoot is the test rewrite: the Phase 1 slot, calendar, posts and Run plan tests were built on the package generator and had to be reworked around runs, on top of the new tests.

## Test count

Vitest, on `e10bc93`:
```
 Test Files  45 passed (45)
      Tests  412 passed (412)
```
Playwright, on the same code:
```
  89 passed (2.6m)
```
Delta from γ8 (42 files, 393 tests; 86 Playwright):
- **Vitest:** +19 net (393 to 412), +3 files:
  - `cadence.test.ts` (6): run end dates, weekday matching, SEO dates skipping kept slots, "days after" and "on set days" placement, prefilled amounts;
  - `runs.test.ts` (13): form parsing and its errors, a started run keeping its start, typed placeholders on the cadence, overlap refused in the app and in the database, regeneration keeping topics and moves, a started run's past left alone, derived slots following a moved SEO post, derived move rules, a derived slot with copy surviving its channel being switched off, delete rules with event deletions, imported runs refused, the backstop;
  - `migration-0008.test.ts` (5): 0008 on a scratch database seeded in production's shape (below);
  - `calendar.test.ts`: +1 for derived events; the pause case became a run-change case;
  - removed: the package generator's own tests in `slots.test.ts` (eight weeks, paused, concurrent top-up, pause deletion, package switch, project create) and `posts.test.ts`'s Run plan read (the function went with the old tab).
- **Playwright:** +3 net (86 to 89). `run-plan-posts.spec.ts` is rewritten for runs: set up a run (preset, Custom on edit, preview line), typed SEO and GBP rows, topic and moves with the GBP slot following, derived move refused before its SEO post, editing the cadence keeping the topic and the move, the next run's suggested start and the overlap message, a post outside every run shown, pausing keeping slots, and phone width with the form open. `calendar.spec.ts`, `google-calendar.spec.ts`, `project.spec.ts` and `crm.spec.ts` now seed runs instead of relying on the package generator.

Runs during the checkpoint that failed, all fixed before this gate: one Playwright run was void because Vitest reset the shared test database while it ran; then a preview date without its weekday, a spec expecting the old packages card, an inexact Date label, a wrong expected count, and a real bug: the run form scrolled sideways at 390px (fixed in `e10bc93`).

## Typecheck + lint

```
Typecheck: clean (tsc --noEmit after Next's route types)
Lint: clean, 0 problems
Build: pnpm build succeeds
```

## Migrations

`drizzle/0008_runs.sql`: generated tables `runs`, `run_channels`, `derived_slots`, `posts.run_id`, `projects.package` loses NOT NULL; hand-written: `btree_gist`, the `runs_no_overlap` exclusion constraint, Run 1 per project, the deletion of Run 1's empty future placeholders after its end with their calendar events queued (approved at orientation, Q3), `posts.run_id` set, and Run 1's SEO channel row.

Safe for the live γ8 version during the build: tables and a nullable column are added; the only change to an existing column drops a NOT NULL. γ8's `ensureSlots` can still add slots with no run while the build runs; the new version's backstop adopts or removes them (tested).

**Local, production-shaped** (`src/db/migration-0008.test.ts`): a scratch database migrated to 0007 and seeded with a published post with a derivative, topic posts (two on one day, one without a cadence date), a missed empty slot, empty slots inside and after the last topic, a project with empty slots only and one with none. After 0008: Run 1 for the two projects with posts, the right ends, only the two empty slots after the end deleted with their events queued, every other post unchanged including its calendar hash, the derivative kept, Run 1's SEO row, and the overlap constraint refusing an overlap and allowing the next day.

**Neon dev.** Host confirmed first: `ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech`.

Snapshot taken before migrating (independent script over the WebSocket driver):
```
{"drafts": 9, "versions": 3, "reviews": 3, "publications": 0, "derivatives": 8, "deletions": 0, "today": "2026-10-23"}
posts: 24
Migss Interiors Website: 24 posts, 2026-10-21 to 2026-12-14, last topic 2026-10-23, statuses {"approved":1,"flagged":1,"planned":22}
```

Rehearsal, full output (`pnpm db:migrate --remote --rehearse 0008_runs`):
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Rehearsal: 22 statements from drizzle/0008_runs.sql, inside BEGIN ... ROLLBACK
Inside the transaction: accounts, ai_calls, app_settings, batches, calendar_deletions, clients, critic_verdicts, derivatives, derived_slots, google_tokens, knowledge_versions, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, run_channels, runs, sessions, site_pages, users
Rolled back.
Public tables: accounts, ai_calls, app_settings, batches, calendar_deletions, clients, critic_verdicts, derivatives, google_tokens, knowledge_versions, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, sessions, site_pages, users
Applied migrations: 8
  1 bc9dce5f5136 1792531354466
  2 58801d2dc19d 1792542524859
  3 9b771848e2a2 1792547861813
  4 019250fdfb17 1792588397103
  5 a8bd56f19ad4 1792607618124
  6 f20cc06f07cd 1792761166850
  7 5172477ca12c 1792765592866
  8 752b99cf6900 1792768806191
```

Migration, full output (`pnpm db:migrate --remote`):
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Migrator finished.
Public tables: accounts, ai_calls, app_settings, batches, calendar_deletions, clients, critic_verdicts, derivatives, derived_slots, google_tokens, knowledge_versions, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, run_channels, runs, sessions, site_pages, users
Applied migrations: 9
  1 bc9dce5f5136 1792531354466
  2 58801d2dc19d 1792542524859
  3 9b771848e2a2 1792547861813
  4 019250fdfb17 1792588397103
  5 a8bd56f19ad4 1792607618124
  6 f20cc06f07cd 1792761166850
  7 5172477ca12c 1792765592866
  8 752b99cf6900 1792768806191
  9 5c44ea618d45 1792772598700
```

Independent check, full output (a separate script comparing every post with the snapshot):
```
runs: [{"name":"Run 1","project":"Migss Interiors Website","preset":"premium","starts_on":"2026-10-21","ends_on":"2026-10-23","status":"active","imported":true,"writer_model":"claude-opus-5-5","critic_model":"claude-opus-5-5","activated":true}]
run_channels: [{"content_type":"seo","amount":2,"cadence":{"weekdays":[1,3,5]}}]
constraint: [{"conname":"runs_no_overlap","def":"EXCLUDE USING gist (project_id WITH =, daterange(starts_on, ends_on, '[]'::text) WITH &&)"}]
projects.package nullable: [{"is_nullable":"YES"}]
posts before 24, after 2, deleted 22
deleted were all planned, no topic, no batch, after Run 1's end: true
kept posts changed in status, topic, date, calendar hash or batch: 0
kept posts without a run: 0
calendar deletions queued: 22 match the deleted posts: true event ids right: true
counts after: {"drafts":9,"versions":3,"reviews":3,"publications":0,"derivatives":8,"derived_slots":0} before: {"drafts":9,"versions":3,"reviews":3,"publications":0,"derivatives":8,"deletions":0,"today":"2026-10-23"}
```
On dev, Run 1 ends on 23 Oct because dev's last post with a topic is 23 Oct (production's is 17 Nov). The 22 deleted posts were all empty placeholders after that date. The preset reads Premium because dev's project had Premium; production's Migss is Mid.

## Consumer audit (D.3.3)

- **`ensureSlots`, `reconcileSlots`, `packageWeekdays`:** deleted. Consumers were Home, Calendar, Run plan, `projects.ts` (create and settings) and their tests; Home and Calendar now call the backstop, the Run plan reads runs, project create makes no slots, pausing deletes none. Grep across `src`, `scripts`, `trigger`: no references left (verified clean).
- **`projects.package`:** no reader or writer left in `src` (the schema's own check aside). Removed from the project forms, settings, project cards, CRM, `clients.ts`. The column is dropped in A2.
- **`listProjectPlan`:** its only caller was the old Run plan; removed with its test.
- **`calendar_deletions.post_id`:** now also holds derived slot IDs; the sync deletes by `event_id`, so no reader changes.
- **Calendar events:** SEO events are built as before (the title word still reads "SEO", so no hash changes); derived slots get their own events (`bfmd` IDs). `chooseCalendar` also resets derived hashes.

## What was verified vs code-inspection only

**Verified (how):**
- The cadence engine, run parsing, creation, regeneration keeping touched and moved slots, a started run's past kept, overlap in the app and the database, derived placement and moves, the backstop (Vitest on Postgres).
- 0008 on a production-shaped scratch database and on Neon dev, with the outputs above.
- Derived events: title "Migss · GBP · Planned slot", then the SEO post's topic once set, graphite colour, deletion when the channel is switched off (Vitest against the fake Calendar).
- In the real app (Playwright, desktop and 390px): setting up, editing and deleting runs' slots, the preview line, typed rows, moves, the overlap message, the next run's start, Outside any run, pausing, CRM presets, project cards.
- Screens looked at: `run-form`, `run-plan` at desktop and `run-form-mobile`, `run-plan-mobile` at 390px. Nothing scrolls sideways at 390px.

**Code-inspection only (needs smoke):**
- **Production's migration:** runs in the Vercel production build after the backup branch. Production's real data was not read from this session. Expect Run 1 from Migss's first slot to 17 Nov 2026, Mid, with the empty placeholders after 17 Nov gone.
- **Real Google Calendar:** the queued deletions for those placeholders and the new derived events reach the real calendar on the next sync; only the stand-in and the fake were exercised here.
- **The deploy window:** the backstop was tested, but the real overlap of the live γ8 version and the new build can only be seen in production.

## Deliberately unchanged / out of scope

- The app's own calendar page still shows SEO slots only; derived slots show on the Run plan and in Google Calendar (the handoff's A1 item). A4 adds generation state to the calendar.
- `projects.package` column and `src/config/packages.ts` stay until A2 drops them.
- The four tabs (A2), the planner and client link (A3), fortnightly generation (A4).

## Smoke instructions for Amir

1. After the merge's production deploy finishes, open the Migss project's **Run plan** tab. Expect **Run 1**, Active, Mid, ending **Tue 17 Nov 2026**, with "Made from the Phase 1 slots". Every post with a topic is there with its status; the published wet room post is counted in "earlier slots". Report back if any post with a topic is missing or its status changed.
2. Open **Calendar**: no empty slots after 17 Nov. Open Google Calendar's **BrandFactory Content** a minute later: the empty events after 17 Nov have gone, and every event up to 17 Nov is unchanged.
3. On the Run plan, select **Set up the next run**. Expect it to start on **Wed 18 Nov 2026**. Choose your preset and length, check the preview line, then **Create run**. Expect Run 2, Setting up, with SEO posts and a GBP, LinkedIn, Facebook and Pinterest slot the day after each.
4. Within a minute, Google Calendar shows Run 2's events, for example "Migss · GBP · Planned slot". Report back if the derived events do not appear.
5. In Run 2, set a topic on the first SEO post, and move one GBP slot with **Move date**. Try a date before its SEO post: expect "Keep it on or after its SEO post, ..." .
6. Select **Edit run**, untick and tick a weekday, **Save run**: the topic and the moved GBP slot stay where they are.
7. On a phone, open the Run plan and **Edit run**: nothing scrolls sideways.
8. If Run 2 is not what you want, it can be deleted with **Delete run** while it is Setting up and no slot has a topic (clear the topic first).

## What the next checkpoint picks up

A2: the four-tab project page (Details, Run plan, Content and performance, Knowledge) and dropping `projects.package`, now that A1 is live.
