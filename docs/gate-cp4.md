# Verification gate: Phase 1, checkpoint γ4 (batch spec and generation)

Status: **complete.** The real end-to-end run is recorded below. Every check passes, so per the process change the PR is opened and merged, and the production smoke list is at the end.

## Git state

```
Branch: claude/gamma4-cost-cache-validation-jpq1pb (pushed). It continues claude/loving-cannon-ksyp3b from 26953ac.
Commits since main (267a6c3):
78cfb5b γ4 gate: real run on Neon dev, Vercel and Trigger.dev deploy notes, smoke list
6f0e7cf Real run driver: dev-only Neon WebSocket client for trigger.dev dev workers
26953ac γ4 gate draft and backlog items 15 to 17
fa5317c Run production migrations in the Vercel build, after a Neon backup branch
d548ebf γ4.4: Generating screen, review queue, draft view and Connections rows
16fe358 γ4.3: batch form, spec confirmation, pillar tags and entry points
e26dcb8 γ4.2: Trigger.dev tasks and the resumable generation run
dfb96a1 Write dash characters in tests as escapes
186db42 γ4.1: generation schema, prices and cost, AI client, knowledge pack, prompts and scripted checks
9903eab Record γ4 orientation approval
f8e6ff5 γ4 orientation: Trigger.dev Development and Production only, no Preview
e7d78c2 Process change from γ4: dev migrations by the build session, production migrations in the Vercel build, merge after tests
ec74a7e Add γ4 orientation report
b04e6e3 Add γ4 handoff
```

## LOC delta

Excluding `pnpm-lock.yaml` and `drizzle/meta`, before this gate's own edits: `86 files changed, 6577 insertions(+), 80 deletions(-)`. The orientation estimated about 5,000 lines across the stages. The overshoot is mostly tests (the generation, batch, deploy-migrate and Playwright specs) and the production migration step, which was added to γ4 by the process change.

## Test count

Vitest:
```
 Test Files  32 passed (32)
      Tests  226 passed (226)
```
Playwright:
```
  66 passed (2.0m)
```
Re-run on `6f0e7cf` in this session, against a fresh local Postgres 16 (`localhost:5433/bfm_test`, 4 migrations applied). Delta from γ3: Vitest +8 files, +78 tests (148 to 226). Playwright +9 tests (57 to 66).

## Typecheck, lint and build

`pnpm typecheck` and `pnpm lint` exit 0 (re-run on `6f0e7cf`; ESLint now ignores `.trigger/`, the dev worker's build output, which it had started linting). `pnpm run vercel-build` with `VERCEL_ENV=preview` prints `Not a production build (VERCEL_ENV=preview): no migration.` and then completes `next build`. With `VERCEL_ENV=production` and no `MIGRATION_DATABASE_URL`, it prints `Production migration failed: Missing environment variable MIGRATION_DATABASE_URL.` and exits 1 before `next build`.

## Migrations

`drizzle/0003_generation.sql` (41 statements). It only adds tables and nullable columns, so the version still live keeps working while the new one builds (CLAUDE.md).

**Local:** rehearsed and applied to `bfm_test`, 4 migrations applied.

**Neon dev** (this session, no go-ahead needed from γ4). Host check: `ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech`.

Rehearsal, verbatim:
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Rehearsal: 41 statements from drizzle/0003_generation.sql, inside BEGIN ... ROLLBACK
Inside the transaction: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, google_tokens, knowledge_versions, post_drafts, post_generations, post_specs, posts, project_pillars, projects, sessions, site_pages, users
Rolled back.
Public tables: accounts, app_settings, clients, google_tokens, knowledge_versions, posts, projects, sessions, site_pages, users
Applied migrations: 3
  1 bc9dce5f5136 1792531354466
  2 58801d2dc19d 1792542524859
  3 9b771848e2a2 1792547861813
```
Migration, verbatim:
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Migrator finished.
Public tables: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, google_tokens, knowledge_versions, post_drafts, post_generations, post_specs, posts, project_pillars, projects, sessions, site_pages, users
Applied migrations: 4
  1 bc9dce5f5136 1792531354466
  2 58801d2dc19d 1792542524859
  3 9b771848e2a2 1792547861813
  4 019250fdfb17 1792588397103
```
Independent check (separate queries, verbatim):
```
host: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech
posts new columns: batch_id nullable=YES, generation_step nullable=YES, pillar_id nullable=YES
checks: ai_calls_purpose_check, critic_verdicts_verdict_check, post_generations_round_check, posts_generation_step_check, project_pillars_slug_check
0003 hash in database matches file sha256: true 019250fdfb17
row counts: {"batches":"0","specs":"0","posts":"24"}
```

**Production:** not from this session. It runs in the Vercel production build of the merge (next section).

## Production migrations in the Vercel build

`vercel.json` now builds with `pnpm run vercel-build`, which runs `scripts/deploy-migrate.ts` and then `next build`. Steps, as approved:
1. Production builds only (`VERCEL_ENV=production`).
2. `MIGRATION_DATABASE_URL` must be a direct Neon connection: the dev branch, the pooler and non-Neon hosts are refused.
3. If nothing is pending (journal compared with `drizzle.__drizzle_migrations`), it stops: no backup, no migration.
4. It creates a Neon branch of production, `backup/pre-<tag>-<commit>-<UTC time>`, with no compute, and waits until Neon reports it ready. Failure or a 2-minute timeout fails the build before anything is migrated.
5. It deletes `backup/` branches beyond the newest three. Nothing else is ever deleted. A failed prune is logged and does not block the deploy.
6. Under a Postgres advisory lock, it applies every pending migration in one transaction.
7. The applied hashes are read back and must equal the journal's, in order, or the build fails.

Tested in Vitest (`scripts/deploy-migrate.test.ts`, 13 tests) against a scratch local database and a stand-in Neon API: preview skip, target guard, nothing pending, backup failure, backup timeout, missing Neon settings, rollback of every pending migration when one fails, hash mismatch, pruning only `backup/` branches, and the order backup, prune, migrate, check.

**Restore runbook** (if a production migration ever needs undoing): in the Neon console, open the project, Branches, the newest `backup/pre-...` branch. Use "Restore" on the production branch from that backup branch (Neon keeps the pre-restore state as its own branch), then redeploy the previous Vercel production deployment with "Promote".

## Consumer audit (D.3.3)

- **`posts` gained `batch_id`, `pillar_id`, `generation_step`:** consumers are `lib/posts.ts` (`SlotView` now carries `batchId`), the calendar panel, the Run plan tab and `lib/slots.ts`. A post in a batch can no longer change its topic, in `setTopic` and in both editors. Verified by Playwright (calendar shows Open batch and no Topic field) and the existing slot tests.
- **Status module:** gained `GENERATION_LINES` (Queued, Needs another pass, Could not finish, Stopped reporting), `SPEC_LINES` and `DRAFTED_STATUSES`. The drift test now also covers "Needs another pass" and "Could not finish". Verified clean: no other file spells a status word.
- **Domain resets:** `src/test/db.ts` and the new `e2e/resetDomain()` delete the γ4 tables first. All five e2e specs that reset now use it.
- **Connections page:** the Anthropic row became a live check and a Trigger.dev row was added. `e2e/settings.spec.ts` was updated to match.

## Real run on Neon dev

21 Oct 2026, 14:12 to 14:17 UTC. `BFM_ANTHROPIC_API_KEY` present in the session (checked by name only). `DATABASE_URL` host `ep-square-mode-zatw6e39-pooler...` (Neon dev).

**How it ran.**
- `trigger.dev dev` from this session: `Local worker ready on branch: default [node-24] -> 20261021.2`. The tasks, spec, writer, scripted checks and critic are the real code, with real Anthropic calls.
- Port 5432 to Neon is blocked from this container. So with `DEV_DB_DRIVER=neon-serverless`, dev builds alias `@/db/client` to `scripts/dev-db-client.ts`, which is the same Drizzle schema over Neon's WebSocket driver (443), as the migrator already does. `trigger.config.ts` applies it only when the build target is `dev`. Deploys use node-postgres as before.
- `scripts/real-run.ts` stands in for the signed-in batch form. It calls the same functions as the server actions: `setTopic`, `createBatch`, `startSpec`, `confirmAllSpecs`, `queueGenerations` and `startGeneration`. It refuses any database but Neon dev.
- Batch `ae3c1d38-0999-47c7-8c1c-1094e874bea8`, "γ4 real run". It used the form's defaults: 1,200 to 1,600 words, CTA from Migss knowledge, FAQ only where useful, writer and critic `claude-opus-5-5` from Settings. Two Migss posts:
  - "Finance Bathroom Installs" (already on the 21 Oct slot);
  - "How much does a bathroom renovation cost in Essex?" (the model test's cost topic, set on the 23 Oct slot).

**Trigger.dev runs, from the worker log, verbatim:**
```
○ Oct 21, 14:13:03.175 ->  20261021.2 | draft-spec | run_06gltjl9g134no3aeqmpcho601.1 | Success (16.5s)
○ Oct 21, 14:13:08.237 ->  20261021.2 | draft-spec | run_06gltjl944mgb499bd7qfkn201.1 | Success (21.8s)
○ Oct 21, 14:17:03.964 ->  20261021.2 | generate-post | run_06gltjqldu6h19nb1f4jiqku01.1 | Success (3m, 34.3s)
○ Oct 21, 14:17:09.517 ->  20261021.2 | generate-post | run_06gltjqm9l9p7tp687nrhacg01.1 | Success (3m, 39.4s)
```

**`ai_calls` rows** (UTC time, post, purpose, served model, effort, input, output, cache write, cache read, cost USD, ms, stop reason), verbatim from Neon dev:
```
14:13:02 | cost | spec | claude-opus-5-5 | medium | 5673 | 1400 | 3108 | 0 | 0.066232 | 14707 | end_turn
14:13:07 | finance | spec | claude-opus-5-5 | medium | 5666 | 1656 | 3108 | 0 | 0.071324 | 20082 | end_turn
14:14:35 | cost | writer | claude-opus-5-5 | high | 1481 | 6315 | 2277 | 0 | 0.143609 | 63400 | end_turn
14:14:57 | finance | writer | claude-opus-5-5 | high | 1676 | 9208 | 2277 | 0 | 0.202249 | 85924 | end_turn
14:15:24 | cost | writer | claude-opus-5-5 | high | 4650 | 6526 | 0 | 2277 | 0.149575 | 48072 | end_turn
14:15:51 | finance | writer | claude-opus-5-5 | high | 4890 | 6959 | 0 | 2277 | 0.159195 | 53822 | end_turn
14:15:55 | cost | critic | claude-opus-5-5 | high | 4420 | 2986 | 3092 | 0 | 0.092860 | 30475 | end_turn
14:16:33 | finance | writer | claude-opus-5-5 | high | 4657 | 5476 | 0 | 2277 | 0.128603 | 40686 | end_turn
14:16:42 | cost | writer | claude-opus-5-5 | high | 4790 | 5558 | 0 | 2277 | 0.130775 | 46248 | end_turn
14:17:02 | finance | critic | claude-opus-5-5 | high | 4649 | 2212 | 0 | 3092 | 0.063454 | 28544 | end_turn
14:17:08 | cost | critic | claude-opus-5-5 | high | 4453 | 2708 | 0 | 3092 | 0.072590 | 24864 | end_turn
```
Totals, verbatim: `{"calls":"11","total":"1.280466","cache_read":"15292","cache_write":"13862","input":"47005","output":"51004"}`.

Cost check by hand on the first row, at the prices in `src/config/models.ts`: 5,673 × $4 + 1,400 × $20 + 3,108 × $5, per million tokens, comes to $0.066232. That matches the recorded cost.

**Cache reads: proven.** Every repeat call of the same role within 5 minutes read the cache, 15,292 tokens in all:
- all four fix-round writer calls (2,277 each);
- both later critic calls (3,092 each). The finance critic read the cache the cost critic wrote, so the pack is byte-identical across posts, as designed.

Two findings, both in the backlog (18):
- **Each role has its own cache.** The spec (3,108) and critic (3,092) prefixes are larger than the writer's (2,277), although all three cache the same pack text. The likely cause is that structured output places its schema ahead of the cached block. So spec, writer and critic never share a cache, which corrects orientation Q5's assumption that writer and critic would.
- **Parallel calls both write.** The two specs started together, so both wrote the cache, and so did the two first writer calls. At this pack size, caching saved about $0.06 on this run.

**Outcomes per post** (drafts, scripted checks and verdicts from Neon dev):

| Post | Round 1 | Round 2 | Round 3 | Result |
|---|---|---|---|---|
| Finance Bathroom Installs | 1,749 words, checks failed (length) | 1,624 words, checks failed (length) | 1,512 words, checks passed, critic **pass** (3 minor issues) | `in_review` (Needs review). Cost $0.624825 |
| Bathroom renovation cost in Essex | 1,742 words, checks failed (length) | 1,499 words, checks passed, critic **fail** (1 blocking, 5 minor) | 1,534 words, checks passed, critic **fail** (1 blocking, 5 minor) | `flagged` (Failed) after two fix rounds. Cost $0.655641 |

- Every path the Vitest fakes covered also ran for real: the check failure going straight back to the writer without the critic, a critic fix round, the round limit leading to Failed, and a critic pass. Structured output parsed on all four spec and critic replies. Effort `medium` and `high` were accepted. No refusals, no retries, and the model that answered was always the one asked for.
- Both blocking critic issues are decision 12 working as intended: the draft defined what Migss's price range covers, which the pack does not state.
- Both first drafts overshot the 1,600-word maximum by about 150 words (backlog 19).
- Drafts carry square-bracket placeholders, such as `[Migss bathroom price range]` and `[whether Migss offers finance]`, where the knowledge has no fact. That is the writer prompt's rule. The critic notes say the Migss knowledge itself still holds the price range as a placeholder, so fill it in before production posts.

**Spend:** $1.280466 recorded on this run, against the $25 limit. These are the only rows in Neon dev's `ai_calls`. The Anthropic Console is the authority for the key's month-to-date spend, and this session cannot read it.

The batch and its two posts stay on Neon dev as test data, for the γ5 review screens.

## What was verified vs code-inspection only (MANDATORY)

**Verified (how):**
- Scripted checks match `check.py` word counts on all six model-test drafts and catch decision 12's two patterns in them: Vitest.
- Cost from usage, the AI client's call records, refusal handling with no fallback, max-tokens and wrong-shape replies: Vitest with a fake transport against local Postgres.
- The generation run: pass first time, check failure goes back without the critic, critic fix round, flagged after two fix rounds, resume after each step without repeating a saved call, a refusal puts the post back to Spec ready: Vitest.
- Batch form, pillar tags, spec drafting, editing, redrafting, confirming, Generate, the Generating screen polling through to finished, Retry, the review queue and the read-only draft view (raw HTML not rendered, links go to the client's site): Playwright against the Trigger.dev stand-in, with the tasks' database writes played by the test. Desktop and 390px phone width, screenshots taken and looked at.
- Production migration step: Vitest against a scratch database; the real `vercel-build` script's preview skip and missing-variable failure, run here.
- Neon dev migration: outputs above.
- The real Anthropic calls through `trigger.dev dev` on Neon dev: structured output on real replies, cache reads, effort settings, cost recorded per call and checked by hand, the check-failure, critic-pass and flagged paths (section above, rows read back from Neon dev).

**Code-inspection only (needs the smoke):**
- Trigger.dev retries and `onFailure` on a real failure, and the 20-minute run limit: no real call failed.
- The Connections check reading a real run result (the stand-in does not serve results, and the real run did not use the Connections page).
- The app's own database driver (node-postgres) in a Trigger.dev worker: the dev run used the WebSocket alias. Production workers reach Neon over TCP, which only the production smoke proves.
- The batch form and Generate button calling Trigger.dev Production from Vercel: the real run called the same functions from a script, not through the signed-in UI.
- The production migration step against real Neon: the first real run is this merge's own production build.
- Trigger.dev deploying the tasks from the Vercel production deploy: read from the Trigger.dev docs (next section), checked after merge.

## Deliberately unchanged / out of scope

- Approve, reject, regenerate with a note, editing the draft, cover image and publishing details: γ5 and γ6. The draft view is read only.
- Draft from site: backlog 15.
- Preview deployments do not start runs: the batch form says generation runs in production only.

## Backlog housekeeping

Added 15 (Draft from site), 16 (README status words for the new display lines), 17 (Connections check not covered in Playwright). From the real run: 18 (the cache is per role, and parallel first calls each write it), 19 (first drafts overshoot the length maximum).

## Vercel production deploys and Trigger.dev Production

Amir reports the Trigger.dev Vercel integration connected, with the variables in the Vercel project. This session's Vercel connector is refused the project's variable list (403), so the variables themselves were not checked here.

**From the repo:**
- `trigger.config.ts` names project `proj_ulcdgkjdrupttwnieygs` and the task folder `src/trigger`.
- It does not use the deprecated `syncVercelEnvVars` extension, which the docs say conflicts with the integration's own sync.
- The dev-only database alias returns early unless the build target is `dev`, so the integration's production builds bundle the app's node-postgres client.
- `vercel.json` builds with `pnpm run vercel-build` (migrate, then `next build`). Nothing in the repo deploys tasks itself, so the integration is the only route to Trigger.dev Production.

**From the Trigger.dev Vercel integration docs** (trigger.dev/docs/vercel-integration, read 21 Oct 2026):
- "Every Vercel deployment automatically triggers a Trigger.dev deployment."
  - Vercel Production maps to Trigger.dev Production.
  - Preview maps to Preview, which this plan does not have.
  - The integration needs the Trigger.dev GitHub integration connected.
- **Production is gated:** "Vercel holds the deployment until the task build for the same commit finishes." If the task build fails, "the Vercel deployment doesn't go live." So the merge's production deploy cannot go live with stale tasks.
- **Runs are pinned per commit:** "each Trigger.dev deployment is tagged with your commit SHA … every run is pinned to the deployment built from the same commit." The SDK reads `VERCEL_GIT_COMMIT_SHA` at runtime. The docs add that on older SDKs no id is sent and runs use the current version. They don't name the minimum SDK version, and the app uses 4.7.4, so this is not verified.
- **Order for this merge:** the Vercel build runs the migration first. If the migration fails, the Vercel deploy fails and the old version stays live. The docs do not say what then happens to the task deployment built for that commit. The live app still triggers runs pinned to its own commit.

**Variables the integration syncs:**
- **Trigger.dev to Vercel:**
  - each environment's API key, `TRIGGER_SECRET_KEY` (Production gets `tr_prod_...`). The draft's item for Amir to add it by hand is therefore done by the integration.
  - `TRIGGER_AUTOMATIC_SKEW_VERSION_PROTECTION=1`, written once on connect, only when absent.
- **Vercel to Trigger.dev:**
  - all of the Vercel project's variables for the matching environment, pulled before each build. "Pull env vars before build" and "discover new env vars" are on by default.
  - **Not synced:** `TRIGGER_SECRET_KEY`, `TRIGGER_API_URL`, `TRIGGER_VERSION`, `TRIGGER_PREVIEW_BRANCH` and `TRIGGER_AUTOMATIC_SKEW_VERSION_PROTECTION`, plus **every variable marked Sensitive in Vercel** (a Vercel API limit).
  - A variable deselected in Trigger.dev keeps its last value.

**What that means for the tasks**, which need `DATABASE_URL` (Neon main) and `ANTHROPIC_API_KEY` (production key) in Trigger.dev Production:
- If either is marked Sensitive in Vercel, it does **not** reach Trigger.dev and must be set in Trigger.dev Production by hand. The production key is meant to live in Trigger.dev only (orientation Q1), so set it there directly.
- Non-sensitive production variables, such as `AUTH_*` and `APP_ENCRYPTION_KEY` if they are not Sensitive, are also copied into Trigger.dev Production. The tasks do not use them.
- `MIGRATION_DATABASE_URL` and the `NEON_*` keys should stay Sensitive, so they are not copied.

## Production smoke list

1. **Trigger.dev, Production, Deployments:** a deployment tagged with the merge commit (checked from this session after merge, below). In Environment variables, `DATABASE_URL` and `ANTHROPIC_API_KEY` are present.
2. **Vercel build log of the merge:** read the migration lines. Expect `backup/pre-0003_generation-...` created and ready, `Migrator finished.`, and the hash check passing, then `next build`.
3. **Neon console, Branches:** the `backup/pre-0003_generation-...` branch exists.
4. **Settings, Connections:** Check connection on the Anthropic row shows Connected. The Trigger.dev row shows Production.
5. **Migss Knowledge:** replace the price range placeholder, and add finance and payment terms if Migss offers them (the real run's drafts carried both as placeholders).
6. **Migss Settings:** add pillars Bathroom Renovation (`bathroom-renovation`) and Kitchen Renovation (`kitchen-renovation`).
7. **Create content on Migss:** one slot with a topic. Confirm its spec when it appears, then Generate 1 post.
8. **Generating screen:** it moves through Writing and Checking to Needs review or Failed. Then open the draft from the Review queue and note the cost shown. Expect about $0.40 to $0.70 on Opus 5.5, from this run.
9. **Trigger.dev Production, Runs:** the generate-post run is on the merge commit's version.
