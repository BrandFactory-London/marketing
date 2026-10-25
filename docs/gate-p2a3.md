# Verification gate: Phase 2 session A, checkpoint A3 (the planner and the client link)

Status: **complete.** Typecheck, lint, Vitest and Playwright pass on the A3 code. Neon dev is migrated and independently checked. A real plan, a real item regeneration and a real whole-plan regeneration ran on Neon dev with their costs below. A3 and A4 ship in one PR (Amir, 25 Oct); this gate covers A3, `gate-p2a4.md` covers A4 and the merge.

## Git state

```
Branch: claude/hopeful-carson-fzy00j (pushed). Restarted from main 9206f31 (A2 merged), same name.
A3 commits:
c5c242f A3: e2e seeds no longer insert the dropped package column
baffc00 A3: real-run commands for Run 2, the plan, item regeneration and the plan report
551d3fd A3: planner, item and plan regeneration, approval and activation, client link with comments and approval, per-project categories, plan feedback into suggestions, migration 0009
Status: clean working tree before this gate was written. A4's schema was held in a git stash while the A3 real runs used Neon dev, so the dev worker ran A3's code only.
```

## LOC delta

A3 code and tests, excluding `docs/`, `pnpm-lock.yaml`, `drizzle/` and screenshots: `47 files changed, 2709 insertions(+), 77 deletions(-)`. The orientation estimated 2,000; the client link's limits and the two new suggestion sources (plan notes and client feedback) took more code and tests than planned.

## Test count

Vitest, on `baffc00` (the code `c5c242f` leaves unchanged):
```
 Test Files  49 passed (49)
      Tests  434 passed (434)
```
Playwright, on `c5c242f`:
```
  96 passed (2.9m)
```
Delta from A2 (45 files, 411 tests; 90 Playwright):
- **Vitest:** +23 tests, +4 files:
  - `planner.test.ts` (12): the overlap check, the prompt's lists and redo messages, the excerpt cut, categories with Other last, the planner's context, drafting a plan (one item per slot, pillar and category matched, a retry paying nothing, the call recorded as `plan`), one item again with its note and the learning run from it, a whole-plan note with no post, approval into topics and planned excerpts, activation needing approval, a failed draft and an imported run;
  - `plan-share.test.ts` (6): only the token's hash stored, what the client sees (no reasons), unknown, revoked, expired and replaced links, comments, suggestions and approval with the client lines, the learning run from a client suggestion, the honeypot, the hourly limit, no feedback after activation;
  - `migration-0009.test.ts` (4): below;
  - `run-status.test.ts` (1): the run, plan, client and generation words are spelled only in `run-status.ts`;
  - `nav.test.ts`, `learn.test.ts`, `projects.test.ts`: the tab badge, `learn-2`, the package column gone.
- **Playwright:** +6 tests (90 to 96), all in `planner.spec.ts`: Plan the run, Regenerate post with a note, Share with the client and the client's page (headers, no internal words, suggest, approve, remembered name, print), Amir's view with the tab badge then Approve plan and Activate run, the link after activation and turned off, phone width for both pages.
- The first full Playwright run on the A3 code had 8 failures: the specs' seed SQL still inserted the dropped `package` column. Fixed in `c5c242f`; the app code was not involved.

## Typecheck + lint

```
Typecheck: clean (tsc --noEmit after Next's route types)
Lint: clean, 0 problems
Build: pnpm build succeeds (Playwright's web server builds it)
```

## Migrations

`drizzle/0009_plans.sql` (numbered 0009, not the orientation's 0010, because A2 had no migration):
- adds `project_categories`, `plan_drafts`, `plan_items`, `plan_shares`, `plan_feedback`; `posts.planned_excerpt`; `runs.client_approved_by`; `rule_candidates.plan_feedback_id`;
- `rule_candidates.post_id` loses NOT NULL (a note on a whole plan is about no single post), and the source check becomes "exactly one of three";
- `ai_calls` purposes gain `plan`;
- drops `projects.package` and its check (orientation amendment, 25 Oct);
- hand-written: Migss's projects get Finance, Guarantee, Cost and Technical. Other is every project's last category in code, never stored.

Safe for the live A2 version during the build: A2 no longer names `package`; every other change adds tables or columns, or widens a check; `post_id` can only be empty on candidates A3 itself writes.

**Local, production-shaped** (`src/db/migration-0009.test.ts`): a scratch database at 0008 seeded with Migss (package mid), another client's project, a post, a review event and a rule candidate; after 0009 the package column and check are gone, only Migss has the four categories, the old candidate is unchanged, a candidate with a plan feedback source is accepted while two sources or none are refused, a client comment without a link is refused, and `plan` is a purpose.

**Neon dev.** Host confirmed first: `ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech`.

Snapshot taken before migrating:
```
[{"id":"e82463ed-89c7-402b-bc14-2e1b44c82fa6","name":"Migss Interiors Website","package":"premium","client":"Migss Interiors"}]
{"posts":2,"candidates":3,"ai_calls":32,"runs":1}
```

Rehearsal, full output (`pnpm db:migrate --remote --rehearse 0009_plans`):
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Rehearsal: 36 statements from drizzle/0009_plans.sql, inside BEGIN ... ROLLBACK
Inside the transaction: accounts, ai_calls, app_settings, batches, calendar_deletions, clients, critic_verdicts, derivatives, derived_slots, google_tokens, knowledge_versions, plan_drafts, plan_feedback, plan_items, plan_shares, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_categories, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, run_channels, runs, sessions, site_pages, users
Rolled back.
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

Migration, full output (`pnpm db:migrate --remote`):
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Migrator finished.
Public tables: accounts, ai_calls, app_settings, batches, calendar_deletions, clients, critic_verdicts, derivatives, derived_slots, google_tokens, knowledge_versions, plan_drafts, plan_feedback, plan_items, plan_shares, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_categories, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, run_channels, runs, sessions, site_pages, users
Applied migrations: 10
  1 bc9dce5f5136 1792531354466
  2 58801d2dc19d 1792542524859
  3 9b771848e2a2 1792547861813
  4 019250fdfb17 1792588397103
  5 a8bd56f19ad4 1792607618124
  6 f20cc06f07cd 1792761166850
  7 5172477ca12c 1792765592866
  8 752b99cf6900 1792768806191
  9 5c44ea618d45 1792772598700
  10 c51ae7a8326a 1792962804615
```

Independent check, full output (a separate script against the snapshot):
```
projects.package: []
categories: [{"project":"Migss Interiors Website","label":"Finance","position":0},{"project":"Migss Interiors Website","label":"Guarantee","position":1},{"project":"Migss Interiors Website","label":"Cost","position":2},{"project":"Migss Interiors Website","label":"Technical","position":3}]
new tables: ["plan_drafts","plan_feedback","plan_items","plan_shares"]
posts.planned_excerpt: [{"column_name":"planned_excerpt"}]
checks: [{"conname":"ai_calls_purpose_check","def":"CHECK ((purpose = ANY (ARRAY['spec'::text, 'writer'::text, 'critic'::text, 'check'::text, 'rules'::text, 'derivative'::text, 'facts'::text, 'plan'::text])))"},{"conname":"rule_candidates_source_check","def":"CHECK ((((\nCASE\n    WHEN (review_event_id IS NULL) THEN 0\n    ELSE 1\nEND +\nCASE\n    WHEN (derivative_id IS NULL) THEN 0\n    ELSE 1\nEND) +\nCASE\n    WHEN (plan_feedback_id IS NULL) THEN 0\n    ELSE 1\nEND) = 1))"}]
candidates unchanged: true (3)
counts after: {"posts":2,"candidates":3,"ai_calls":32,"runs":1} before: {"posts":2,"candidates":3,"ai_calls":32,"runs":1}
```

## Real runs on Neon dev

`trigger.dev dev` from this session (`Local worker ready on branch: default [node-24] -> 20261025.1`, rebuilt to `.3` as files changed) with the dev-only WebSocket alias, driven by `scripts/real-run.ts`, which calls the same functions as the server actions (`createRun`, `requestPlan`, `requestItem`, `startPlanDraft`, `startCandidates`). Run 2 for Migss on Neon dev: Mid, 2 Nov to 1 Dec 2026, 9 SEO posts, priority notes "A push on bathroom renovation costs and what the guarantee covers."

1. **Plan the run** (`draft-plan` Success in 50.8s): nine items, one per slot, split Cost 3, Guarantee 3, Technical 1, Finance 1, Other 1, none close to a covered topic. Each reason names what it draws on, for example "builds on the /labour-guarantee page, with guarantee terms as placeholders because the pack does not state them".
2. **Regenerate post** on 26 Nov with the note "Make this one about choosing bathroom tiles that are easy to keep clean. Migss always seals grout lines with a stain-resistant sealer.": version 2, "Which bathroom tiles are easiest to keep clean?". The planner left the sealer out ("the grout sealer claim is left out because it is not in the knowledge pack"). The learning run on the note proposed it as a fact: client, business facts, "Migss always seals grout lines with a stain-resistant sealer.", from "From your note on … in the plan for Run 2".
3. **Regenerate the whole plan** with the note "Fewer guarantee posts: two at most. Add one about paying for a bathroom in stages, and always write the titles as the question a homeowner would type.": every title became a question, guarantee posts fell to two, and "Can I pay for a bathroom renovation in stages?" was added. The tiles item kept its theme (version 3). The learning run proposed a client voice rule: "Write every blog post title as the question a homeowner would type into a search engine."

The final plan, one line per slot (title only):
```
2026-11-03  v2  Cost       What should an itemised bathroom renovation quote include?
2026-11-05  v2  Guarantee  Who pays if a tap or shower tray fails after my bathroom is fitted?
2026-11-10  v2  Cost       Is fit only cheaper than full design and build for a bathroom?
2026-11-12  v2  Technical  Does moving the toilet or shower make a bathroom renovation take longer?
2026-11-17  v2  Finance    Can I pay for a bathroom renovation in stages?
2026-11-19  v2  Cost       Does an ensuite cost less to renovate than a family bathroom?
2026-11-24  v2  Finance    How much contingency should I set aside for a bathroom renovation?
2026-11-26  v3  Technical  Which bathroom tiles are easiest to keep clean?
2026-12-01  v2  Guarantee  What is snagging, and who fixes problems after my bathroom is finished?
```

Every call, from `ai_calls` (an independent query):
```
{"purpose":"plan","prompt_version":"planner-1","served_model":"claude-opus-5-5","effort":"high","input_tokens":6026,"output_tokens":4763,"cache_write_tokens":2943,"cache_read_tokens":0,"cost_usd":"0.134079","duration_ms":45192,"at":"21:32:58"}
{"purpose":"rules","prompt_version":"learn-2","served_model":"claude-opus-5-5","effort":"medium","input_tokens":1254,"output_tokens":192,"cache_write_tokens":3245,"cache_read_tokens":0,"cost_usd":"0.025081","duration_ms":4964,"at":"21:34:17"}
{"purpose":"plan","prompt_version":"planner-1","served_model":"claude-opus-5-5","effort":"high","input_tokens":6703,"output_tokens":694,"cache_write_tokens":0,"cache_read_tokens":2943,"cost_usd":"0.041281","duration_ms":8289,"at":"21:34:20"}
{"purpose":"rules","prompt_version":"learn-2","served_model":"claude-opus-5-5","effort":"medium","input_tokens":1201,"output_tokens":333,"cache_write_tokens":0,"cache_read_tokens":3245,"cost_usd":"0.012113","duration_ms":4770,"at":"21:35:15"}
{"purpose":"plan","prompt_version":"planner-1","served_model":"claude-opus-5-5","effort":"high","input_tokens":6818,"output_tokens":3886,"cache_write_tokens":0,"cache_read_tokens":2943,"cost_usd":"0.105581","duration_ms":35440,"at":"21:35:46"}
total 0.318135
candidates [{"kind":"fact","tier":"client","section":"business_facts","text":"Migss always seals grout lines with a stain-resistant sealer.","from_plan":true},{"kind":"rule","tier":"client","section":"voice","text":"Write every blog post title as the question a homeowner would type into a search engine.","from_plan":true}]
```
**Cost:** a 9-item plan $0.134079; one item again $0.041281 (the pack read from the cache); the whole plan again $0.105581; the two learning runs $0.025081 and $0.012113. **Total $0.318135.** The orientation estimated $0.15 to $0.25 for a 12-item plan and $0.03 to $0.05 for one item; both are within range.

## Consumer audit (D.3.3)

- **`rule_candidates.post_id` now nullable:** readers are `rules.ts` (`listCandidates`, `acceptCandidate`'s owner), `candidate-keys.ts` (pending keys), `learn.ts`. Each now finds the project through the post or, for plan feedback, the plan's run. `candidatesForPost` filters by post and is unaffected. Verified by `planner.test.ts` (a whole-plan candidate lists with its project and origin).
- **`CandidateSource`:** `jobs.ts` (`startCandidates` key and tag), `learn.ts`, `propose-candidates.ts` (payload type only), the post actions. Each handles the third source.
- **`learn-1` to `learn-2`:** the instructions are unchanged; the user message gains two plan sources and the client's words heading. `learn.test.ts` checks the version.
- **`ai_calls` purpose `plan`:** the cost table groups by purpose with no fixed list (verified clean by grep).
- **`projects.package` dropped:** no reader left in `src` (A2) or `e2e` (`c5c242f`).
- **`LinkTabs` gains an optional badge; `projectTabs(projectId, unseen)`:** one caller, the project layout.
- **The proxy matcher** now leaves `/plan/` to the page, which checks its own token; `/projects/*/plan` stays guarded (Playwright opens the client page signed out, and every app page still redirects).

## What was verified vs code-inspection only

**Verified (how):**
- The planner, regeneration, approval, activation, the client link and its limits, both new suggestion sources (Vitest on Postgres).
- The whole flow in the real app against the Trigger.dev stand-in, at desktop and 390px, including the client page signed out, its headers and print (Playwright).
- A real plan, item regeneration and whole-plan regeneration with real suggestions from both notes, and their costs (Neon dev, above).
- Screens looked at: `a3-plan` at desktop, `a3-client-plan-mobile` at 390px.

**Code-inspection only (needs smoke):**
- Production's 0009 (with A4's 0010): checked in the production build log after the merge (`gate-p2a4.md`).
- A real client opening the link from an email on their own device: only Playwright's browser opened it.
- The learning run from a real client comment: run here from a test suggestion through the same code, not from a real client.

## Deliberately unchanged / out of scope

- Generation from the approved plan, the schedule and Generate now (A4).
- Positioning, the gap grid and search insights (session B); `plannerContext().insights` is always empty.

## Smoke instructions for Amir

Combined with A4's in `gate-p2a4.md`, after the merge.

## What the next checkpoint picks up

A4: fortnightly generation through the Message Batches API, built straight after this gate (one PR for both).
