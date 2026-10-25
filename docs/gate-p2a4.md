# Verification gate: Phase 2 session A, checkpoint A4 (fortnightly generation)

Status: **complete.** Typecheck, lint, Vitest and Playwright pass on the A4 code. Neon dev is migrated and independently checked. A real batch generation of two posts and a real derived post ran on Neon dev with their costs below. Trigger.dev's free plan fits the schedule and the polling (checked before building, below). A3 and A4 shipped in one PR; the merge, the production build log and the combined smoke list are at the end.

## Git state

```
Branch: claude/hopeful-carson-fzy00j (pushed), on top of the A3 gate (a1eae4e).
A4 commits:
c26a343 A4: fortnightly generation through the Message Batches API, the shared step function, auto specs, Generate now, derived posts on approval, generation state, migration 0010
3ac27df A4: real-run commands for activation, a two-post batch, the batch report and derived posts
Status: clean working tree before this gate was written.
```

## LOC delta

A4 code and tests, excluding `docs/`, `pnpm-lock.yaml`, `drizzle/` and screenshots: `29 files changed, 1316 insertions(+), 114 deletions(-)`. The orientation estimated 1,800; the step function reuses the existing loop, so the refactor came out smaller than planned.

## Test count

Vitest, on `3ac27df`:
```
 Test Files  50 passed (50)
      Tests  444 passed (444)
```
Playwright, on the same commit:
```
  99 passed (3.0m)
```
Delta from A3 (49 files, 434 tests; 96 Playwright):
- **Vitest:** +10 tests, +1 file, `batch-generation.test.ts`:
  - the fortnight: the 27-day window, the 14-day step, the generation day for a post including a missed day, when a run is due; batch calls at half price; custom IDs in Anthropic's format;
  - on Postgres against a fake Message Batches API: activation turning generation on from today; a generation day taking four weeks of posts with specs from the plan, and a second look adding nothing; rounds of spec, writer and critic to Needs review with every call recorded as a batch call at half price; waiting while a batch processes and never submitting a round twice; a refused request failing its post at once, a server error and an expiry retried once and failing after a second; a stalled batch found for the morning run; Generate now's own batch and queued generation; approval queueing only the run's derived channels.
  - **Phase 1's real-time tests pass unchanged** on the refactored loop (`generation.test.ts`, `batches.test.ts`, `review.test.ts`, the AI client tests: 49 tests, untouched).
- **Playwright:** +3 tests (96 to 99), `generation.spec.ts`: Activate run sending the first four weeks to the batch-round run with specs drafted from the plan, the next generation line and "Generates on"; the spec card's "Spec drafted from the approved plan" and Generate now on a later post; Generate the next fortnight now with nothing new to send, and phone width.

## Typecheck + lint

```
Typecheck: clean (tsc --noEmit after Next's route types)
Lint: clean, 0 problems
Build: pnpm build succeeds (Playwright's web server builds it)
```

## Migrations

`drizzle/0010_batch_generation.sql` (the orientation's 0011; one lower because A2 had none): adds `generation_batches`; `ai_calls.batch` (default false); `post_specs.auto` (default false); `batches.run_id`; `runs.auto_generate` (default false) and `runs.next_generation_on`. All additive, with defaults that match A3's behaviour, so the live version is safe while the new one builds.

**Neon dev.** Host confirmed first: `ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech`.

Snapshot taken before migrating:
```
{"ai_calls":37,"batches":1,"specs":2,"runs":2,"posts":11}
```

Rehearsal, full output (`pnpm db:migrate --remote --rehearse 0010_batch_generation`):
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Rehearsal: 10 statements from drizzle/0010_batch_generation.sql, inside BEGIN ... ROLLBACK
Inside the transaction: accounts, ai_calls, app_settings, batches, calendar_deletions, clients, critic_verdicts, derivatives, derived_slots, generation_batches, google_tokens, knowledge_versions, plan_drafts, plan_feedback, plan_items, plan_shares, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_categories, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, run_channels, runs, sessions, site_pages, users
Rolled back.
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

Migration, full output (`pnpm db:migrate --remote`):
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Migrator finished.
Public tables: accounts, ai_calls, app_settings, batches, calendar_deletions, clients, critic_verdicts, derivatives, derived_slots, generation_batches, google_tokens, knowledge_versions, plan_drafts, plan_feedback, plan_items, plan_shares, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_categories, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, run_channels, runs, sessions, site_pages, users
Applied migrations: 11
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
  11 c6fde69f9dc7 1792963977336
```

Independent check, full output:
```
generation_batches: ["id","run_id","batch_id","round","anthropic_batch_id","request_count","requests","status","error","submitted_at","ended_at","created_at"]
new columns: [{"table_name":"ai_calls","column_name":"batch","column_default":"false","is_nullable":"NO"},{"table_name":"batches","column_name":"run_id","column_default":null,"is_nullable":"YES"},{"table_name":"post_specs","column_name":"auto","column_default":"false","is_nullable":"NO"},{"table_name":"runs","column_name":"auto_generate","column_default":"false","is_nullable":"NO"},{"table_name":"runs","column_name":"next_generation_on","column_default":null,"is_nullable":"YES"}]
defaults held: {"batch_calls":0,"auto_specs":0,"auto_runs":0,"run_batches":0}
counts after: {"ai_calls":37,"batches":1,"specs":2,"runs":2,"posts":11} before: {"ai_calls":37,"batches":1,"specs":2,"runs":2,"posts":11}
```

## Real batch generation (Neon dev, real Anthropic API)

Run 2 (`49a5a485-e8ef-48bd-bb60-4d08fde6019f`, the A3 plan run: Mid preset, 2 Nov to 1 Dec, 9 planned SEO posts) was activated with `scripts/real-run.ts activate`: 9 posts approved, `auto_generate` true, next generation 25 Oct 2026. To keep the cost small, `batch-two` sent the first two planned posts as the generation batch, through the same `startRunBatch` and `batch-round` task the app uses, on the Trigger.dev dev worker against Neon dev:

- batch `53e5229f-c7db-46a3-a149-95f6c03a9e40`, Trigger.dev run `run_06gna4ms5gdsg0clq852dqlla2`;
- post `35693572…` (3 Nov), "What should an itemised bathroom renovation quote include?";
- post `b0952641…` (5 Nov), "Who pays if a tap or shower tray fails after my bathroom is fitted?".

Rounds, as `batch-report` printed them:
```
{"round":1,"anthropic":"msgbatch_01CMcwririSCb4xdzCwkTPME","status":"ended","requests":["spec a1 ok","spec a1 ok"],"submitted":"2026-10-25T21:58:57.140Z","ended":"2026-10-25T22:04:01.249Z"}
{"round":2,"anthropic":"msgbatch_01HVMPkYpaiQKgd4bZeBD98d","status":"ended","requests":["writer r1 a1 ok","writer r1 a1 ok"],"submitted":"2026-10-25T22:04:08.752Z","ended":"2026-10-25T22:09:13.012Z"}
{"round":3,"anthropic":"msgbatch_017ydgH5e5MvCA9Ej3BDtkmj","status":"ended","requests":["critic r1 a1 ok","writer r2 a1 ok"],"submitted":"2026-10-25T22:09:18.241Z","ended":"2026-10-25T22:14:22.979Z"}
{"round":4,"anthropic":"msgbatch_01FqACHGcj1oJsh56j8Mv8He","status":"ended","requests":["writer r3 a1 ok"],"submitted":"2026-10-25T22:14:27.791Z","ended":"2026-10-25T22:19:31.295Z"}
{"round":5,"anthropic":"msgbatch_01Ef3GtS6M63kVqNcwQsKiuF","status":"ended","requests":["critic r3 a1 ok"],"submitted":"2026-10-25T22:19:34.784Z","ended":"2026-10-25T22:24:38.353Z"}
{"post":"35693572-6a2d-4165-bfc0-83afaee67e0e","date":"2026-11-03","topic":"What should an itemised bathroom renovation quote include?","status":"approved"}
{"post":"b0952641-1b33-4c49-bb06-c4c4541fc199","date":"2026-11-05","topic":"Who pays if a tap or shower tray fails after my bathroom is fitted?","status":"in_review"}
```

What happened:
- **Post 1:** spec, first draft passed the automatic checks, the critic passed it: Needs review after round 3.
- **Post 2:** spec, drafts 1 and 2 failed the automatic checks and were rewritten in the next round, draft 3 passed the checks and the critic: Needs review after round 5. Both posts share each round's batch while both are still running; once post 1 finished, post 2 went on alone.
- Each round took about 5 minutes in Anthropic's queue; the whole generation took 26 minutes. The Trigger.dev run ended `Success (47s)`: 47 seconds of compute across 26 minutes, so the 5-minute waits were checkpointed and not billed, as the free plan check expected.

Then post 1 was approved (`scripts/real-run.ts approve`, which strips any placeholder sentences, so it counted as an edit and started a candidates run), and `derived` queued the run's four derived channels for it in real time, the same `queueDerivedSlots` the approve action calls. All four reached `ready`: GMB, LinkedIn, Facebook, Pinterest. The candidates run proposed one rule ("Where a client process or policy detail is not in the knowledge, leave it out and write around it..."), now waiting in Settings on Neon dev.

Every call, as `batch-report` printed it:
```
{"purpose":"spec","model":"claude-opus-5-5","batch":true,"input":5733,"output":1563,"cacheWrite":3108,"cacheRead":0,"costUsd":0.034866,"error":null}
{"purpose":"spec","model":"claude-opus-5-5","batch":true,"input":5740,"output":1764,"cacheWrite":3108,"cacheRead":0,"costUsd":0.03689,"error":null}
{"purpose":"writer","model":"claude-opus-5-5","batch":true,"input":1673,"output":8626,"cacheWrite":2277,"cacheRead":0,"costUsd":0.095299,"error":null}
{"purpose":"writer","model":"claude-opus-5-5","batch":true,"input":1757,"output":7314,"cacheWrite":0,"cacheRead":2277,"costUsd":0.076882,"error":null}
{"purpose":"critic","model":"claude-opus-5-5","batch":true,"input":5149,"output":3242,"cacheWrite":3341,"cacheRead":0,"costUsd":0.051071,"error":null}
{"purpose":"writer","model":"claude-opus-5-5","batch":true,"input":5131,"output":7094,"cacheWrite":0,"cacheRead":2277,"costUsd":0.08143,"error":null}
{"purpose":"rules","model":"claude-opus-5-5","batch":false,"input":1685,"output":800,"cacheWrite":3245,"cacheRead":0,"costUsd":0.038965,"error":null}
{"purpose":"derivative","model":"claude-opus-5-5","batch":false,"input":3446,"output":708,"cacheWrite":2277,"cacheRead":0,"costUsd":0.039329,"error":null}
{"purpose":"derivative","model":"claude-opus-5-5","batch":false,"input":3462,"output":666,"cacheWrite":2277,"cacheRead":0,"costUsd":0.038553,"error":null}
{"purpose":"derivative","model":"claude-opus-5-5","batch":false,"input":3474,"output":768,"cacheWrite":0,"cacheRead":2277,"costUsd":0.029711,"error":null}
{"purpose":"derivative","model":"claude-opus-5-5","batch":false,"input":3530,"output":1296,"cacheWrite":2277,"cacheRead":0,"costUsd":0.051425,"error":null}
{"purpose":"writer","model":"claude-opus-5-5","batch":true,"input":4933,"output":6586,"cacheWrite":0,"cacheRead":2277,"costUsd":0.075954,"error":null}
{"purpose":"critic","model":"claude-opus-5-5","batch":true,"input":5088,"output":3319,"cacheWrite":3341,"cacheRead":0,"costUsd":0.051719,"error":null}
total 0.702094
```

Costs:

| Part | Calls | Cost |
|---|---|---|
| Specs, batch | 2 | $0.071756 |
| Writer drafts, batch | 4 | $0.329565 |
| Critic reads, batch | 2 | $0.102790 |
| **Batch generation, two posts** | 8 | **$0.504111** |
| Derived posts, real time | 4 | $0.159018 |
| Candidates from the approval edit, real time | 1 | $0.038965 |
| **Total** | 13 | **$0.702094** |

The batch calls are recorded at half price (`batch: true`); the same eight calls in real time would have cost $1.008222. Per post, batch generation came to $0.25 here (post 1 with one draft $0.18, post 2 with three drafts $0.32). Trigger.dev compute for the batch-round run: 47 seconds on small-1x, about $0.0016.

## Trigger.dev free plan (orientation amendment, Q7)

Checked against Trigger.dev's pricing and limits pages on 25 Oct 2026, before any A4 code was written:
- **Free plan:** $5 of usage a month; 20 concurrent runs; **10 schedules** per project; 1-day log retention; runs have no maximum duration by default.
- **Waits:** "`wait.for` and `wait.until` waits longer than 5 seconds are checkpointed and don't count toward compute usage", and waiting runs do not count toward concurrency.
- **Prices:** small-1x (the default machine) $0.0000338 per second; $0.000025 per run.
- **A4's use:**
  - one schedule, `fortnightly` (the project had none), so 1 of 10;
  - the daily run is a few database reads: about 30 runs a month at a few seconds each, under $0.01 a month;
  - polling: each look at a batch is a second or two of compute, and the 5-minute waits between looks are not billed. A round usually ends within an hour (about 12 looks); at the 24-hour worst case, 288 looks. Seven rounds per generation day, two generation days a month: under $0.01 a month typically, about $0.30 a month at the worst case;
  - concurrency: one batch-round run per generation day per run, waiting most of the time.
- **Verdict:** fits the free plan with a wide margin. The existing real-time tasks (writer loops, derivatives, candidates) already ran within it; batches move most writing out of long real-time runs, so compute goes down. This session cannot see the Trigger.dev dashboard's actual usage; the smoke list asks for a look.

## Consumer audit (D.3.3)

- **`runGeneration` refactored into `generationContext`, `nextGenerationStep`, `beginStep`, `saveCriticStep`, `saveWriterStep`:** callers are `generate-post.ts`, `generate-now.ts` and `batch-generation.ts`. The real-time loop's order of status updates and saves is unchanged; the Phase 1 tests pass unchanged.
- **`draftSpec` split into `specStep` and `saveSpec`:** callers `draft-spec.ts`, `generate-now.ts`, `batch-generation.ts`.
- **`AiClient`:** `text` and `parsed` behave as before; the record step is shared with the new `textFromBatch`, `parsedFromBatch` and `failedInBatch`. `callCost` takes `{ batch }`; its other callers pass nothing and are unchanged.
- **`activateRun`** now sets `auto_generate` and `next_generation_on`: callers are the Run plan action (which then starts the first fortnight) and the real-run script.
- **`approveAction`** queues the run's derived channels after approval: posts outside a run's plan have no derived slots, so nothing changes for them.
- **`SlotView` gains `nextGenerationOn`** (a left join to runs): readers are the calendar, Home, the Posts page and the project cards; only the calendar panel shows it.
- **Calendar events** gain a "Generates on" line for planned posts in a generated run: the hash changes only for those posts, so only they are patched.
- **The reset helpers** delete batches before runs, now that batches refer to runs.

## What was verified vs code-inspection only

**Verified (how):**
- The schedule rules, the rounds against a fake Message Batches API, every failure path, Generate now, derived posts on approval (Vitest on Postgres).
- Activation, the generation lines, Generate now and the spec card in the real app against the Trigger.dev stand-in, at desktop and 390px (Playwright).
- A real batch generation and a real derived post on Neon dev with the real Anthropic API (above).
- Screens looked at: `a4-run-active` at desktop; `a4-run-active-mobile` at 390px.

**Code-inspection only (needs smoke):**
- **The `fortnightly` schedule firing at 06:00 UK time in Trigger.dev Production:** it deploys with the merge; this session cannot see Trigger.dev Production.
- **Production's 0009 and 0010:** in the production build log below.

## Deliberately unchanged / out of scope

- The hand-made batch form stays for posts outside a plan.
- Session B (knowledge entries, the inbox, the gap grid, Search Console and GA4).

## Ship

A3 and A4 go in one PR to main, opened and merged from this branch once this gate is pushed. Production's migrations 0009 and 0010 run in the Vercel production build after the backup branch; the build log is checked after the merge and reported to Amir with the smoke list below.

## Smoke instructions for Amir (A3 and A4 together)

Steps 4 to 9 spend real API money on production: about $0.14 for the plan and about $0.25 a post for the first four weeks' batch.

1. Open Migss, **Details**. Under the pillar tags, **Categories** lists Finance, Guarantee, Cost and Technical. Add one with **Add category**, then remove it.
2. Open **Run plan**. Run 1 looks as it did, with no plan controls and no "Generates on" lines (it was made from the Phase 1 slots).
3. Select **Create run** for a short second run (Starts on a Monday after Run 1 ends, Mid preset), then **Save run**.
4. Select **Plan the run**. "Drafting the plan." shows; within a minute or two each slot has a title, an excerpt and a category, and any title close to a published or planned post says "Close to an existing topic".
5. On one item, type a note in **What should change (optional)** and select **Regenerate post**: only that item changes.
6. Select **Share with the client**, then **Copy link**. Open the link in a private window: the plan shows without signing in, with no BrandFactory navigation. Type a name, send a comment with **Send comment**, then reload the app's Run plan: the tab shows a badge and the comment is listed. Do not approve as the client unless you want the client approval recorded.
7. Select **Approve the plan**, then **Activate run** and confirm. The run shows Active and "Next generation: ..., N posts"; posts in the first four weeks show "In the half-price batch"; later ones show "Generates on ..." with **Generate now**.
8. Wait about half an hour (each batch round is about 5 minutes; a post needs three to five rounds). The first posts arrive in **Needs review**, with "Spec drafted from the approved plan" on their spec.
9. Approve one of them. The message says it is writing the run's derived channels (GMB, LinkedIn, Facebook, Pinterest), and they appear on the post within a minute.
10. In Trigger.dev, Production: the `fortnightly` schedule is listed (06:00, Europe/London), and the `batch-round` run for step 7 shows a short compute time against a long duration. Check Usage stays well under the $5 free allowance.
11. Optional: on the run, **Turn off link**, then open the copied link again: it says "This link is not active".
12. On a phone, open Run plan and the client link: nothing scrolls sideways.

## What the next checkpoint picks up

Session B (knowledge entries, the inbox, the gap grid, Search Console and GA4), only when Amir says to start it.

