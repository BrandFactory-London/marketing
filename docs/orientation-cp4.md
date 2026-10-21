# Orientation: Phase 1, checkpoint γ4 (batch spec and generation)

21 Oct 2026. Written from the template in `docs/templates/orientation-report.md`. No code has been written.

Read in full:
- `docs/handoff-cp4.md` (this branch's first commit, `b04e6e3`, identical to `d64cdc9` on `docs/handoff-cp4`);
- `CLAUDE.md`, `docs/methodology.md`;
- `docs/design-decisions.md` (decisions 5, 7 to 14 and 16 closely);
- `docs/scope.md` (generation pipeline), `docs/backlog.md`, `docs/gate-cp3.md`;
- `docs/model-test/README.md`, `knowledge-pack.md`, `check.py`, `drafts/B-opus.md` (first half), `critics/opus.md` (D1 to D6);
- `src/config/post-status.ts`, `src/lib/knowledge.ts`, `src/lib/settings.ts`, `src/config/models.ts`;
- the `<main>` markup and script of `BatchSpec`, `SpecConfirm`, `Generating`, `Review`, `Post` and (from γ3) `Calendar` in `design/prototype/`.

Skimmed: the other two drafts' word counts, via `check.py`. Not read: `critics/haiku.md`, `critics/sonnet.md`, and the remaining drafts in full.

Facts about the Claude API (model IDs, prices, prompt caching, structured output, thinking and effort) come from the Claude API reference bundled with this session, with prices cached on 6 Oct 2026. Trigger.dev facts come from its current Vercel integration docs. Both are named where used.

## 0. Environment check

| Check | Result |
|---|---|
| Main | `267a6c3` (γ3 merge). The branch is restarted from it, with the handoff as its first commit. |
| `DATABASE_URL` | Neon **dev** (`ep-square-mode-zatw6e39`). Not touched in γ4 so far. |
| Keys in this session | `ANTHROPIC_API_KEY`, `TRIGGER_SECRET_KEY`, `TRIGGER_ACCESS_TOKEN`: **none set** (checked by name only). |
| Network | `api.anthropic.com` answers (404 on `/`, so reachable). `api.trigger.dev` and `cloud.trigger.dev` answer (302). |
| Packages (npm) | `@anthropic-ai/sdk` 0.137.0, released 20 Oct. `@trigger.dev/sdk` and `trigger.dev` CLI 4.7.6, released 20 Oct. `zod` 4.6.7, released 12 Oct. None installed yet. |
| `check.py` baseline | Run here on the six model-test drafts. Words: A-haiku 1,869, A-opus 2,465, A-sonnet 2,418, B-haiku 778, B-opus 873, B-sonnet 845. All in range, no dashes, no bad links, excerpts 115 to 141 characters, FAQ rule met. One banned-phrase hit (A-haiku, "not just"). The TypeScript port must reproduce these numbers. |

The baseline shows why decision 12 matters. `check.py` caught one banned phrase across all six drafts, while the Opus critic flagged "your X, your Y and your Z" in five of the six CTAs. The port adds those patterns by name, and a test proves it catches them in these very drafts.

## 1. Branch state

```
$ git branch --show-current
claude/loving-cannon-ksyp3b
$ git log --oneline -3
b04e6e3 Add γ4 handoff
267a6c3 Merge pull request #3 from BrandFactory-London/claude/loving-cannon-ksyp3b
766442d Keep the slot panel's Date field inside the panel on iPhone Safari
$ git status
nothing to commit, working tree clean
```

PR #3 is merged, so this session's branch was restarted from `origin/main` (it held no unmerged commits). The PR will be "γ4 batch spec and generation".

## 2. Files in scope

**Dependencies (γ4.1)**
- `@anthropic-ai/sdk`, `@trigger.dev/sdk` (and the `trigger.dev` CLI as a dev dependency), `zod` (structured output schemas), and `react-markdown` for the read-only draft view.
- `react-markdown` is built on the same mdast parser that decision 10's Wix converter will use in γ6.
- Versions are pinned exactly. The current SDK releases are one day old, so I propose the newest release at least a week old, confirmed to support every API feature used (see Q5). I'll report the exact versions at γ4.1.

**Schema and migration (γ4.1):** `src/db/schema.ts`, `drizzle/0003_generation.sql` (Q4).

**Domain modules (γ4.1, γ4.2)**
- `src/config/models.ts`: each model gains its list prices (input, output, cache write, cache read), dated, used for cost (Q7).
- `src/lib/ai/client.ts`: the one place the Anthropic SDK is called. It records every call in `ai_calls` (model, tokens, cost, duration, outcome).
- `src/lib/ai/pack.ts`: assembles the knowledge pack from the three tiers' current versions, deterministically, so the cache prefix stays stable.
- `src/prompts/`: system prompts for spec, writer and critic, versioned in code (Q5).
- `src/lib/checks.ts`: the TypeScript port of `check.py`, plus decision 12's patterns.
- `src/lib/batches.ts`, `src/lib/specs.ts`, `src/lib/generation.ts`: the batch, the specs, and the resumable generation steps.
- `src/lib/jobs.ts`: the one place that triggers Trigger.dev tasks.

**Trigger.dev (γ4.2)**
- `trigger.config.ts`, with project `proj_ulcdgkjdrupttwnieygs`.
- `src/trigger/draft-spec.ts`, `src/trigger/generate-post.ts`, `src/trigger/check-anthropic.ts`.
- Risk: `src/lib` modules import `server-only`, which throws outside Next's server build. `trigger.config.ts` maps it to an empty module, as `vitest.config.mts` already does.

**Screens (γ4.3, γ4.4)**
- Batch form `batches/new`, spec confirmation `batches/[batchId]`, Generating `batches/[batchId]/generating`.
- Review queue `review`, and the read-only draft view `posts/[postId]`.
- Entry points: "Generate from planned slots" on the calendar, "Create content" on the project page, and "Open post" in the calendar panel (promised in γ3, Q7).
- Settings, Connections: the Anthropic and Trigger.dev rows.
- A `Stepper` UI component (the prototype's `bfm-stepper`; γ1 deferred its wrapper).

**Tests**
- Vitest: checks (against the six model-test drafts), pack assembly, cost, prompts, and the generation state machine with a fake Anthropic client covering every path in Q6.
- Playwright: the screens, against a local stand-in for the Trigger.dev API (see section 4).
- The real end-to-end run is described in Q2.

## 3. Open questions

- **Q1, accounts, keys and environments.** Proposal:
  - **Where the model calls run.** Every Anthropic call runs inside a Trigger.dev task, including spec drafting, so no Vercel request waits on a model. Vercel only triggers tasks and reads the database. So:
    - the **Anthropic key lives in Trigger.dev's environments only**, not in Vercel;
    - Connections shows Anthropic as Connected from a "Check connection" button. It triggers a tiny task that calls the Models API (no tokens), and the row also shows the time of the last successful call.
  - **Environment mapping.** Trigger.dev's Vercel integration (it also needs the Trigger.dev GitHub integration, both set up by Amir in the Trigger.dev dashboard) deploys tasks on every Vercel deploy:

    | Trigger.dev environment | Runs | `DATABASE_URL` | Anthropic key |
    |---|---|---|---|
    | Development | `trigger.dev dev` in this cloud session (Q2) | Neon dev | low-limit key |
    | Preview | branch previews (Vercel Preview) | Neon dev | low-limit key |
    | Production | `main` (Vercel Production) | Neon **main** | production key |

    The integration syncs variables, so each Trigger.dev environment's `DATABASE_URL` comes from the matching Vercel one, and it writes `TRIGGER_SECRET_KEY` into Vercel. Amir sets `ANTHROPIC_API_KEY` in Trigger.dev Development, Preview and Production.
  - **One risk to check first:** whether the Trigger.dev plan includes the Preview environment (preview branches). If it doesn't, the fallback is a staging environment that I deploy to manually with the CLI for the smoke. Amir to check the plan before γ4.4.
  - **This cloud environment needs:**
    - `TRIGGER_ACCESS_TOKEN` (a personal access token, so the CLI can log in);
    - `TRIGGER_SECRET_KEY` for the Development environment;
    - the low-limit `ANTHROPIC_API_KEY`.

    No new hosts are needed: both APIs already answer from here. If `trigger.dev dev` needs another host, I'll report it rather than work around it.
  - Needs confirmation, and the plan check.

- **Q2, real API calls from this session.** Confirm the lean, with a second key.
  - Amir creates a separate Anthropic key with a low monthly spend limit, ideally in its own Console workspace. I propose **$25**.
  - It goes in this cloud environment and in Trigger.dev Development and Preview. The production key stays in Trigger.dev Production only.
  - The end-to-end proof: `trigger.dev dev` runs the real tasks from this session against Neon dev, on two Migss posts. It needs migration `0003` on Neon dev first, so that go-ahead comes before the proof (section 4).
  - **Estimated cost per post on Opus 5.5:**
    - Prices (list, from the cached Claude API reference): input $4 per million tokens, output $20, cache read $0.20, cache write $5 for 5 minutes.
    - Spec: about 6k tokens in, 3k out (thinking included): about **$0.08**.
    - Writer, one round: about 7k in (the pack is cached after the first call), about 8k out for a 2,000-word post with thinking: about **$0.19**.
    - Critic, one round: about 10k in, 4k out: about **$0.12**.
    - A post that passes first time: about **$0.40**. One needing both fix rounds: about **$1.00**.
    - The proof (two posts, plus one re-run while fixing): about **$2 to $4**. The whole build, including retries: well under the $25 limit.
    - These are estimates. The gate reports the real recorded cost.
  - Needs confirmation, and the key.

- **Q3, batch form fields.** Proposal: Amir types the topic (already set in γ3) and makes batch-wide choices. The writer proposes the rest in the spec, and Amir edits or confirms it there.

  | Field | Where | Who |
  |---|---|---|
  | Slots (topic set, upcoming, not in another batch) | form, ticked | Amir |
  | Length range | form, one per batch, adjustable per post in the spec | Amir |
  | CTA | form, prefilled from the project's Call to action knowledge | Amir |
  | FAQ: Only where useful, Always, Never | form | Amir |
  | Pillar tag | form default, overridable per post in the spec | Amir |
  | Notes for the writer | form, plus an optional note per post | Amir |
  | Writer and critic models | form, defaults from Settings (decision 13) | Amir |
  | Keyword, post type, location | spec | writer proposes, Amir edits |
  | Angle, outline headings, facts from the pack, internal links | spec | writer proposes, Amir edits |

  - The prototype's per-post Keyword, Post type and Location move from the batch form into the spec. That matches decision 14, where the writer proposes the keyword.
  - **Pillar tags.** Each project gets a short list of pillar tags (label and Wix slug) in its Settings. Migss: Bathroom Renovation `bathroom-renovation`, Kitchen Renovation `kitchen-renovation`. This is the γ2 deferred item. γ6 uses the slug.
  - **Derivative model.** Decision 13 lets a batch override all three models. The form shows writer and critic, as in the prototype. The derivative model is copied from Settings into the batch, and γ6 shows it where derivatives are made.
  - Needs confirmation.

- **Q4, tables.** One migration, `0003_generation`. It adds to `posts` without reshaping it:
  - **`project_pillars`**: id, project, label, slug, position.
  - **`batches`**: id, project; name; length min and max, CTA text, FAQ mode, default pillar, notes; writer, critic and derivative models; `created_at`.
  - **`posts` gains:**
    - `batch_id` (nullable);
    - `pillar_id` (nullable);
    - `generation_step` (`writer` or `critic`, nullable; shown as Writing or Checking, γ3 Q3).
  - **`post_specs`**: id, post, version, status (drafting, proposed, confirmed, superseded, failed). Plus:
    - the spec itself: keyword, post type, location, angle, outline headings, facts, internal links, length min and max, CTA, FAQ, redraft note;
    - the knowledge version ids used (three foreign keys);
    - the AI call, `confirmed_at`.

    A redraft makes a new version; old ones are kept.
  - **`post_generations`**: id, post, spec, Trigger.dev run id, status (queued, running, in review, flagged, failed), round, error, `started_at`, `finished_at`. Plus the **three knowledge version ids** the drafts were written with (decision 7). A retry is a new row.
  - **`post_drafts`**: id, generation, round. Plus:
    - the draft: title, excerpt, Markdown body, word count;
    - the scripted check results (JSON), the AI call.
  - **`critic_verdicts`**: id, draft, verdict (pass or fail), issues (quote, category, note, severity), scores, the AI call.
  - **`ai_calls`**: id, batch, post, purpose (spec, writer, critic, check), model asked for, model that answered; prompt version; tokens (input, output, cache write, cache read); cost in US dollars; duration, stop reason, request id, error; `created_at`.
  - **Statuses (γ3's module, unchanged):**
    - a confirmed spec moves the post to `spec_confirmed` (Spec ready);
    - a started run moves it to `generating`;
    - a critic pass moves it to `in_review` (Needs review);
    - two failed fix rounds move it to `flagged` (Failed).

    A run that dies on an API error is not a status. Its generation row says failed, and the post returns to `spec_confirmed` with a Retry (Q6).
  - **Migration sequence as in γ2 and γ3:**
    1. local rehearsal and apply;
    2. dev `--check-only`;
    3. dev `--rehearse 0003_generation` (your go-ahead);
    4. the real dev run (separate go-ahead), with my independent check and your SQL check;
    5. production from `marketing-production-migrations` after the smoke, before merge.
  - Needs confirmation.

- **Q5, prompts.** Proposal:
  - **Where they live.** In code, `src/prompts/{spec,writer,critic}.ts`, each with a `PROMPT_VERSION` recorded on every `ai_calls` row. A prompt change is a reviewed diff, not a setting.
  - **The pack** is built from each tier's current version, in the model test's shape:
    1. Tier 1: BrandFactory rules;
    2. Tier 2: client;
    3. Tier 3: project;
    4. the output format.

    It sits first in the system prompt with `cache_control`. The role instructions (spec, writer or critic) come after it. The spec, the page list from the sitemap and any critic notes go in the user message.

    The pack must be built byte for byte the same for a given set of versions, or the cache silently misses. A test checks this, and the gate shows `cache_read_input_tokens` from the real run.
  - **Caching.** The Migss pack is about 1,200 tokens plus instructions, above the 512-token minimum for the 5.5 models. Caching pays when a model is called more than once on the same pack within 5 minutes, which a batch does. Writer and critic share the prefix only if they use the same model, since caches are per model.
  - **Decision 12's three fixes:**
    - "your X, your Y and your Z" and "more X, more Y, more Z" named as banned, especially in the CTA;
    - never describe a client process, policy or customer pattern the knowledge does not state;
    - the critic treats the spec's opening, a headed CTA and the contact link as hard checks.

    They go in the writer and critic prompts, and the scripted checks catch the two patterns.
  - **Structured output.** The spec and the critic verdict use structured output with Zod schemas (`messages.parse` with `zodOutputFormat`), so a malformed reply is an error, not a guess. The writer returns Markdown with an `Excerpt:` line, as in the model test (decision 10). It streams, because a 2,500-word post with thinking is a long response.
  - **Thinking and effort.** Opus 5.5 always thinks; effort is the control, and its default is medium. Proposal:
    - `medium` for specs;
    - `high` for the writer and the critic.

    Recorded per call, so the cost of a change is visible.
  - **Refusals.** For Opus 5.5 and Sonnet 5.5, I'll enable the API's server-side fallback (`fallbacks: "default"`), so a safety decline is re-run on a fallback model rather than failing the post. Interior design copy is unlikely to trigger it. The model that actually answered is recorded. Say if you'd rather a decline simply fails the post.
  - Needs confirmation.

- **Q6, failure handling.** Proposal:
  - **One task run per post.** Posts in a batch never wait on each other, and one post's failure never stops the others.
  - **Every step writes its result before the next starts** (spec, draft round, checks, verdict). If a run dies halfway and Trigger.dev retries it, it resumes from the last saved step instead of paying for the writer again. A test kills the run after each step and checks the resume.
  - **API errors.**
    - The SDK retries 429, 5xx and connection errors twice.
    - The task then retries up to twice more with backoff.
    - A 400, an authentication error or a refusal with no fallback is not retried.
    - When retries run out: the generation row is failed with a plain message, the post returns to Spec ready, and the Generating screen shows "Retry post".
  - **Timeouts.** 10 minutes per API call (the SDK default) and 20 minutes per post run. A post with no progress for 20 minutes shows "This post stopped reporting progress" with Retry.
  - **Specs fail the same way.** The spec card shows the error and "Redraft spec".
  - **What you see.**
    - Each row's step: Queued, Writing, Checking, "Needs another pass" (round 2 or 3), then Needs review, Failed or "Could not finish".
    - The batch is done when every post has an outcome.
    - Retry is per post. Nothing re-runs automatically after the task's retries.
  - **Two words to settle.**
    - "Needs another pass" (prototype) is a display line for a fix round inside `generating`, not a status.
    - "Could not finish" is a display line for a failed run, not a status. It sits beside the post's real status, Spec ready.

    Both live in the status module so the drift test covers them.
  - **Scripted checks.** Proposal: a draft that fails a scripted check goes straight back to the writer without the critic (it costs nothing to find, so no need to pay the critic to restate it). That counts as one of the two fix rounds. Decision 11 reads as checks first, then critic. This keeps that order and only skips the critic when the checks already failed.
  - Needs confirmation, including the two words and the check rule.

- **Q7, cost visibility.** Confirm the lean.
  - Every call's cost comes from its recorded tokens and the prices in `src/config/models.ts`, in US dollars, before VAT, with the date the prices were last checked.
  - Shown per post (review queue row, draft view, Generating row) and per batch (Generating header, batch page).
  - Each post's breakdown splits spec, writer rounds and critic rounds.
  - Cache savings show as "cached input".
  - Needs confirmation.

- **Q8, Draft from site.** Lean: **not in γ4.**
  - γ4 is already the largest checkpoint, and Migss's knowledge is pasted and versioned, so nothing waits on the crawl.
  - It reuses γ4's AI client, call records and pack, so it is cheap to add later.
  - Proposal: its own short checkpoint before a second client is onboarded. Until then it goes in the backlog.
  - Needs confirmation.

Smaller decisions I will take unless you object:
- Batches belong to one project. "Generate from planned slots" on the calendar opens the batch form with a project choice. "Create content" opens it for that project.
- The Generating screen polls a session-checked JSON route every 3 seconds, as the handoff says (no Trigger.dev realtime subscription).
- The aurora, shimmer, skeleton and progress styles appear only on the Generating screen, while work runs, as the design system reserves them.
- The draft view renders Markdown without raw HTML. It shows:
  - title, excerpt and body;
  - critic notes per round, scripted check results, the confirmed spec;
  - the three knowledge versions used (linked to each version);
  - the cost breakdown.

  The calendar panel and Posts rows link to it once a post has a draft.
- The prototype's stepper shows five steps. Review and Publish show as upcoming (γ5, γ6).
- Banned phrases come from the BrandFactory rules' Banned phrases section: one Markdown list item per phrase, quotes removed, `X` and `Y` read as "any words". Its help text will say so. Built-in patterns cover decision 12 and the `check.py` list.

## 4. Checkpoint structure

γ4 is one checkpoint with one gate, in five internal stages.

| Stage | Focus | Files | Risk |
|---|---|---|---|
| γ4.1 | Dependencies, migration `0003` (local only), prices and cost, AI client and call records, pack assembly, prompts, scripted checks | `package.json`, `db/schema.ts`, `drizzle/0003_*`, `config/models.ts`, `lib/ai/*`, `prompts/*`, `lib/checks.ts` | Medium. The SDK API surface; the checks port must match `check.py`'s numbers. |
| γ4.2 | Trigger.dev config and tasks; resumable generation; the job trigger boundary | `trigger.config.ts`, `src/trigger/*`, `lib/generation.ts`, `lib/jobs.ts` | High. First background jobs; `server-only` in the task build; resume after a crash. |
| γ4.3 | Batch form and spec confirmation, with both entry points and project pillar tags | `batches/*`, `projects/[projectId]/settings`, calendar, project header | Medium. First multi-step flow. |
| γ4.4 | Generating screen, review queue, draft view, Connections rows, stepper | `batches/[batchId]/generating`, `review`, `posts/[postId]`, `settings/connections` | Medium. Polling; AI motion. |
| γ4.5 | Real end-to-end run, phone screenshots, backlog, gate | `e2e/*`, `docs/*` | Needs the keys (Q1, Q2) and `0003` on Neon dev. |

**Testing without real calls.** Playwright runs the app with `TRIGGER_API_URL` pointed at a small local stand-in for the Trigger.dev API, started by the test. It records each trigger request, and the test then writes the job's results into the database. The app code is unchanged, and nothing in `src/` knows about tests, as since γ1. The pipeline logic is tested in Vitest with a fake Anthropic client.

**Order with the database.** The real end-to-end run (γ4.5) needs `0003` on Neon dev, so the dev rehearsal and migration come between γ4.4 and γ4.5, each on your go-ahead, rather than after the gate.

**Check-ins.**
- **After γ4.3** (recommended): screenshots of the batch form and spec confirmation with seeded specs. This is the first new multi-step flow.
- **Before the real run:** I stop once the dev migration is done and the keys are in, and confirm the spend before running anything.

## 5. Estimated LOC and test deltas

Hand-written code and tests, excluding the lockfile and generated migration files.

| Stage | LOC (est.) | New tests (est.) |
|---|---|---|
| γ4.1 | 1,300 | 40 Vitest (checks against the six drafts and decision 12's patterns, pack determinism, cost from usage, prompt assembly, schema constraints) |
| γ4.2 | 1,000 | 20 Vitest (pass first time; check failure, fix, pass; critic fail twice to Failed; API error to Could not finish; refusal; resume after each step; spec redraft) |
| γ4.3 | 900 | 8 Playwright |
| γ4.4 | 900 | 8 Playwright |
| γ4.5 | 300 | phone-width additions; the real run is recorded in the gate, not a test |
| **Total** | **about 4,400** | **about 60 Vitest, about 16 Playwright** |

Estimates only. The gate cites the runner's own summary lines (D.1.2).

## 6. Ambiguities to resolve before starting

1. **Keys and accounts (Q1, Q2).** Before γ4.2 I need, in this cloud environment, `TRIGGER_ACCESS_TOKEN`, the Development `TRIGGER_SECRET_KEY`, and a separate low-limit `ANTHROPIC_API_KEY` (I propose $25). In Trigger.dev:
   - the Anthropic keys per environment;
   - the GitHub and Vercel integrations set up;
   - confirmation that your plan includes the Preview environment.

   γ4.1 needs none of these and can start on approval.
2. Answers or amendments for Q1 to Q8, especially:
   - **Q3:** the batch fields and pillar tags in project Settings;
   - **Q5:** effort levels and the refusal fallback;
   - **Q6:** "Needs another pass", "Could not finish", and checks skipping the critic;
   - **Q8:** deferring Draft from site.
3. Whether you want the check-in after γ4.3.

Nothing will run against Neon or the Anthropic API until you say so.

---

**Stopping here. No code until you approve.**

## Process change (Amir, 21 Oct 2026), applies from γ4

`CLAUDE.md` is updated to match. These replace the parts of this orientation that said otherwise.
- **Neon dev.** The build session migrates it without a go-ahead: host check, rehearsal, migration, independent check, all pasted in the gate. Q4's step list for dev becomes one step in γ4.4.
- **Production.** Migrations run automatically in the Vercel production build (proposal below). There is no production migration session.
- **No preview smoke and no check-ins.** The check-in after γ4.3 and the stop before the real run are dropped. I build, test, write the gate, open the PR and merge once every check passes, then give Amir a short production smoke list.
- **The real end-to-end run** (Q2) still happens before merge, from this session, against Neon dev, within the $25 key limit. It needs the keys in Q1 and Q2.
- **Orientation approval stays:** this report still waits for it.

### Proposal: production migrations in the Vercel build

A `vercel-build` script in `package.json` (Vercel runs it instead of `build` when present) calls `scripts/deploy-migrate.ts`, then `next build`. The steps:

1. **Only on production.** If `VERCEL_ENV` is not `production`, print "Not a production build: no migration" and go straight to `next build`. Preview builds never touch a database, since this session keeps Neon dev migrated.
2. **Guard the target.** Read `MIGRATION_DATABASE_URL`, a direct connection to Neon main, not the pooled one, because the lock in step 5 needs one session. Refuse, failing the build, if the host is the dev endpoint `ep-square-mode-zatw6e39` or is not a Neon host.
3. **Anything to do?** Compare `drizzle/meta/_journal.json` with `drizzle.__drizzle_migrations` on main. If nothing is pending, print that and build, with no backup and no migration. Most deploys stop here.
4. **Backup.** Create a Neon branch of production through the Neon API:
   - call: `POST /projects/{project_id}/branches`, parent = the production branch;
   - name: `backup/pre-0003_generation-<commit>-<UTC time>`;
   - no compute endpoint, so it costs storage only.

   Wait until Neon reports it ready. If creation fails or times out, fail the build: nothing is migrated and the live version stays.
5. **Migrate.** Take a Postgres advisory lock, so two production builds can never migrate at once. Then run the existing migrator, which applies every pending migration in one transaction. A failure rolls the whole run back and fails the build.
6. **Independent check.** Read the migrations table back and require the applied hashes to equal the journal's, then print the table list and the hashes. Any mismatch fails the build.
7. **Build.** Run `next build`.

**What Amir adds in Vercel, Production only, as sensitive variables:**
- `MIGRATION_DATABASE_URL`: the direct (non-pooler) connection string for the Neon main branch;
- `NEON_API_KEY`: a project-scoped key if Neon offers one for this project, otherwise an organisation key;
- `NEON_PROJECT_ID`;
- `NEON_PRODUCTION_BRANCH_ID`.

**Limits to know:**
- If step 7 fails after step 5 succeeded, the database is migrated but the old version stays live. That is exactly why `CLAUDE.md` now requires every migration to work with the version still live. γ4's `0003` only adds tables and nullable columns, so it qualifies.
- Backup branches pile up. Neon's branch expiry (`expires_at`) is early access, so I won't rely on it. Deleting backups is deleting data, so I propose to **keep them all** and list them in each gate. Amir prunes them, or approves a later step that deletes backups older than 30 days while always keeping the newest three.
- Restoring: Neon's branch restore can put production back to the backup's state. The γ4 gate will include the exact steps as a short runbook.

**How it is tested before it ever runs on production:**
- Vitest covers the decision logic:
  - skip on preview;
  - the dev-host guard;
  - nothing pending means no backup;
  - the backup fails, so nothing is migrated;
  - the migration fails, so it is rolled back and the exit code is non-zero;
  - the check mismatch fails the build.
- A local end-to-end run uses the real script, the local Postgres and a stand-in for the Neon API. It proves the order: backup, migrate, check, build.
- **The first real run is γ4's own merge** (`0003_generation`). The production smoke list will include reading those lines in the Vercel build log and seeing the backup branch in the Neon console.
