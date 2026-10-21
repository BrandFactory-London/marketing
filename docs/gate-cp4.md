# Verification gate: Phase 1, checkpoint γ4 (batch spec and generation)

Status: **draft. The real end-to-end run (section "Real run on Neon dev") is still to do**, because the low-limit Anthropic key is not in this session's container. The PR is not opened and nothing is merged until that section is filled in.

## Git state

```
Branch: claude/loving-cannon-ksyp3b (pushed)
Commits since main (267a6c3):
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

Excluding `pnpm-lock.yaml` and `drizzle/meta`: `81 files changed, 6268 insertions(+), 80 deletions(-)`. The orientation estimated about 5,000 lines across the stages. The overshoot is mostly tests (the generation, batch, deploy-migrate and Playwright specs) and the production migration step, which was added to γ4 by the process change.

## Test count

Vitest:
```
 Test Files  32 passed (32)
      Tests  226 passed (226)
```
Playwright:
```
  66 passed (1.7m)
```
Delta from γ3: Vitest +8 files, +78 tests (148 to 226). Playwright +9 tests (57 to 66).

## Typecheck, lint and build

`pnpm typecheck` and `pnpm lint` exit 0. `pnpm run vercel-build` with `VERCEL_ENV=preview` prints `Not a production build (VERCEL_ENV=preview): no migration.` and then completes `next build`. With `VERCEL_ENV=production` and no `MIGRATION_DATABASE_URL`, it prints `Production migration failed: Missing environment variable MIGRATION_DATABASE_URL.` and exits 1 before `next build`.

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

**To do.** Needs `BFM_ANTHROPIC_API_KEY` in the session container. It will be `trigger.dev dev` from this session against Neon dev, on two Migss posts, with spec, writer, checks and critic all real. This section will paste: run ids, the ai_calls rows (models, tokens including cache reads, cost), the drafts' scripted check results and verdicts, and the total spend against the $25 limit.

What is already proven without it: the Trigger.dev Development worker builds and registers (`Local worker ready on branch: default [node-24] -> 20261021.1`), so the config, the `server-only` alias and the task bundles work.

## What was verified vs code-inspection only (MANDATORY)

**Verified (how):**
- Scripted checks match `check.py` word counts on all six model-test drafts and catch decision 12's two patterns in them: Vitest.
- Cost from usage, the AI client's call records, refusal handling with no fallback, max-tokens and wrong-shape replies: Vitest with a fake transport against local Postgres.
- The generation run: pass first time, check failure goes back without the critic, critic fix round, flagged after two fix rounds, resume after each step without repeating a saved call, a refusal puts the post back to Spec ready: Vitest.
- Batch form, pillar tags, spec drafting, editing, redrafting, confirming, Generate, the Generating screen polling through to finished, Retry, the review queue and the read-only draft view (raw HTML not rendered, links go to the client's site): Playwright against the Trigger.dev stand-in, with the tasks' database writes played by the test. Desktop and 390px phone width, screenshots taken and looked at.
- Production migration step: Vitest against a scratch database; the real `vercel-build` script's preview skip and missing-variable failure, run here.
- Neon dev migration: outputs above.

**Code-inspection only (needs the real run or the smoke):**
- The real Anthropic calls: structured output parsing on real replies, prompt caching (`cache_read_input_tokens` above zero on the second call of a batch), effort settings accepted by each model. Pending the real run.
- Trigger.dev retries and `onFailure` on a real failure, and the 20-minute run limit.
- The Connections check reading a real run result (the stand-in does not serve results).
- The production migration step against real Neon: the first real run is this merge's own production build.

## Deliberately unchanged / out of scope

- Approve, reject, regenerate with a note, editing the draft, cover image and publishing details: γ5 and γ6. The draft view is read only.
- Draft from site: backlog 15.
- Preview deployments do not start runs: the batch form says generation runs in production only.

## Backlog housekeeping

Added 15 (Draft from site), 16 (README status words for the new display lines), 17 (Connections check not covered in Playwright).

## Before merge: Vercel Production variables (Amir)

Production only, sensitive:
- `MIGRATION_DATABASE_URL`: the direct (non-pooler) connection string for the Neon main branch.
- `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PRODUCTION_BRANCH_ID`.
- `TRIGGER_SECRET_KEY`: the Trigger.dev Production secret key (`tr_prod_...`), so the app starts runs in Production.

In Trigger.dev Production: `ANTHROPIC_API_KEY` (production key) and `DATABASE_URL` (Neon main).

Without these, the production build fails at the migration step and the current version stays live.

## Production smoke list

To be finalised after the real run. Draft:
1. In the Vercel build log of the merge, read the migration lines: backup branch created and ready, migrator finished, check passed.
2. In the Neon console, see the `backup/pre-0003_generation-...` branch.
3. Settings, Connections: Check connection on Anthropic API shows Connected. Trigger.dev shows Production.
4. Migss project Settings: add pillars Bathroom Renovation (`bathroom-renovation`) and Kitchen Renovation (`kitchen-renovation`).
5. Create content on Migss with one slot that has a topic. Confirm its spec when it appears, then Generate 1 post.
6. Watch the Generating screen to Needs review or Failed, then open the draft from the review queue. Report the cost shown.
