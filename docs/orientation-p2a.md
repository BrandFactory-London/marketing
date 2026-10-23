# Orientation: Phase 2, session A (the run workflow), checkpoints A1 to A4

23 Oct 2026. Written from the template in `docs/templates/orientation-report.md`. No code has been written.

Read in full:
- `docs/handoff-p2a.md` (this branch's first commit, `9bb0b45`, identical to `51f28c9` on `docs/handoff-p2a`);
- the Claude Doc "BrandFactory Marketing App: v1 Scope": its **Build phases** table and **Phase 2 in detail** list (rev 49, read through the Docs tools);
- `CLAUDE.md`, `docs/backlog.md`, `docs/gate-cp8.md`;
- `src/config/packages.ts`, `src/lib/slots.ts`, `src/config/post-status.ts`, `src/lib/calendar-events.ts`, `src/lib/calendar-sync.ts`, `src/lib/derivatives.ts`, `src/lib/learn.ts`, `src/prompts/spec.ts`, `src/lib/nav.ts`, the project layout, `trigger.config.ts`, the cron route.

Skimmed:
- `src/lib/batches.ts` (createBatch, specs, queueGenerations);
- `src/lib/generation.ts` (runGeneration's loop);
- `src/lib/projects.ts`;
- the `posts`, `batches`, `post_specs` and `projects` tables;
- every reader of `projects.package` (grep);
- the text of `Project.dc.html`, `Calendar.dc.html` and `BatchSpec.dc.html`.

Not opened: the other prototype screens, `methodology.md` and `design-decisions.md` beyond what earlier orientations quote.

**Anthropic facts** (Message Batches) are from the Claude API reference bundled with this session, cached 6 Oct 2026. No call was made to any API.

## 1. Branch state

```
$ git branch --show-current
claude/hopeful-carson-fzy00j
$ git log --oneline -3
9bb0b45 Phase 2 session A handoff: the run workflow
c98d6bd Merge pull request #10 from BrandFactory-London/claude/hopeful-carson-fzy00j
510dd3a γ8 gate: Neon dev migration, consumer audit, smoke list; backlog 7 and 24 closed
$ git status
nothing to commit, working tree clean
```

The designated branch's γ8 PR (#10) is merged, so the branch was restarted from main at `c98d6bd` under the same name. Its first commit is the handoff and this report is the second.

**One branch for four checkpoints.** CLAUDE.md asks for one branch per checkpoint, and this session has one designated branch. Each checkpoint ends with a PR from this branch, a merge and a smoke. The branch is then restarted from main for the next checkpoint (the merged history makes that a fast-forward). Say if you would rather each checkpoint had its own branch name.

## 2. Files in scope

**A1, runs and slots**
- `src/db/schema.ts`, `drizzle/0008_runs.sql` (Q1 to Q3, Q9).
- `src/config/run-presets.ts` (new): Entry, Mid and Premium as presets, from `packages.ts`. `packages.ts` keeps project statuses and publishing targets.
- `src/config/run-status.ts` (new): run, slot and plan words (Q8).
- `src/config/content-types.ts` (new): SEO plus the four derived channels, their calendar words ("SEO", "GBP", "LinkedIn"), and their order. `calendar-events.ts` and `CHANNELS` read it.
- `src/lib/runs.ts` (new): create, configure and end runs; the cadence engine; the slot generator; moves.
- `src/lib/slots.ts`: `ensureSlots` and `reconcileSlots` retired. `setTopic` and `moveSlot` stay, and moves of derived slots are added.
- `src/lib/calendar-events.ts`, `calendar-sync.ts`: derived slots get their own events.
- The callers of `ensureSlots` (Home, Calendar, Run plan, `projects.ts`), and every reader of `projects.package` (project cards, CRM, the project forms).
- **Screens:** the run configuration card and the slot list on the Run plan tab.

**A2, the four-tab project page**
- `src/lib/nav.ts` (`PROJECT_TABS`).
- `src/app/(app)/projects/[projectId]/`: `details/` (new; Settings, Wix, Drive folder and pillars move here, with the profile), `plan/`, `content/`, `knowledge/` (Knowledge with the Sitemap section).
- Redirects from the old `settings` and `sitemap` URLs.
- `drizzle/0009_drop_package.sql`.

**A3, the planner and the client link**
- `src/prompts/planner.ts` (new, `planner-1`), `src/lib/planner.ts` (new), `src/trigger/draft-plan.ts` (new).
- `src/lib/plan-share.ts` (new): tokens and client feedback.
- `src/app/plan/[token]/` (new public route, outside the app shell), the proxy matcher.
- `src/lib/learn.ts`, `src/prompts/learn.ts`: two new sources, Amir's plan notes and client comments.
- `drizzle/0010_plans.sql`.

**A4, fortnightly generation**
- `src/lib/ai/batch.ts` (new): submitting, polling and collecting Message Batches, and cost at batch prices.
- `src/lib/generation.ts`: the writer, critic and fix loop becomes a step function, so real-time and batch runs share it (Q7).
- `src/lib/fortnight.ts` (new), `src/trigger/fortnightly.ts` (new, a Trigger.dev schedule), `src/trigger/batch-round.ts` (new).
- `src/lib/batches.ts`: specs drafted from the plan, with no confirmation step.
- `src/lib/derivatives.ts`: derived slots are written once their parent is approved.
- Calendar, Run plan and post page: generation state.
- `drizzle/0011_batch_generation.sql`.

**Tests per checkpoint:** Vitest for every pure module and every database path; Playwright at desktop and 390px for every new screen; real model runs in A3 and A4 (section 4).

## 3. Open questions

- **Q1, the run model.** Proposal:
  - **`runs`:**
    - id, project, name ("Run 1"), preset (`entry`, `mid`, `premium` or `custom`), `starts_on`, `ends_on` (1 to 3 months), `priority_notes`, status (Q8);
    - the post defaults the batch form asks today: length range, CTA, FAQ mode, writer and critic models;
    - `plan_approved_at`, `client_approved_at`, `activated_at`, `created_at`.
  - **`run_channels`,** one row per content type in the run:
    - `content_type` (`seo`, `gmb`, `linkedin`, `facebook`, `pinterest`);
    - `amount` (how many in the whole run);
    - `cadence` (JSON, Q4).
  - **A slot records its run:**
    - SEO slots stay rows in `posts`, which gain `run_id`;
    - derived slots go in a new table (Q2).
  - **At a run's end:** nothing is deleted. A run whose end date has passed reads Finished, and its unwritten slots show as Missed, as today. Nothing tops slots up any more.
  - **Between runs:** a gap simply has no slots. Configuring the next run offers to start the day after the current one ends.
  - **Overlap: refused.** Two runs of one project cannot share a day, so "the current run" is always one run. A high-volume run followed by a low-volume one is two runs back to back. The app checks this, and a database exclusion constraint backs it up (`btree_gist`, available on Neon).
  - Needs confirmation, especially no overlap.

- **Q2, derived slots against derivatives.** Proposal: **a separate `derived_slots` table; the derivative versions stay as they are.**
  - **`derived_slots`:**
    - id, run, parent post (the SEO post, required), `content_type`, `slot_date`, `cadence_date` (the date the rule gave, so a move is visible), `created_at`;
    - unique on (parent, content type): **at most one derived slot per channel per SEO post.**
  - **Versions are joined, not reshaped:** a derived slot's text is the newest `derivatives` version for its parent and channel, exactly what the Derivatives card shows today. γ6 and γ7's versions, edit, copy and learning flow is unchanged.
  - **Why not rows in `posts`:**
    - every post consumer (statuses, specs, batches, the generator, review, publishing, the Posts page, the review queue) assumes a post is an SEO post;
    - a separate table keeps all of that untouched, and with it Migss's live posts.
  - **Its status is derived from its versions:**
    - "Planned" until a version exists;
    - then the existing derivative lines: "Writing", "Ready to copy", "Not written".
    - Posting is Phase 3.
  - **The consequence of the unique key:** a run's amount for a derived channel cannot exceed its SEO amount. "GBP every Wednesday and Sunday" alongside SEO on Monday, Tuesday and Friday is 2 per week against 3, so it fits.
  - **Instagram:** the handoff's example names Instagram. The app has no Instagram channel; Instagram copy and visuals are Phase 3. A1 offers SEO, GBP, LinkedIn, Facebook and Pinterest. Section 6 asks.
  - Needs confirmation of the one-per-channel rule.

- **Q3, migrating Migss to Run 1.** Proposal: **in the migration SQL, so production gets it at deploy, with a code backstop.**
  - **For each project that has posts,** `0008_runs` inserts:
    - "Run 1", preset = the project's package, status Active, activated at the migration;
    - `starts_on` = the earliest slot date, `ends_on` = the latest;
    - one SEO channel row: amount = the number of posts, cadence = the package's weekdays (Migss Mid: Tuesday and Thursday);
    - the run defaults from the app's current settings.
  - **Every one of the project's posts** gets that `run_id`: the published wet room post, the 14 seeded posts, the second per-day posts without a cadence date, and the empty future slots `ensureSlots` made.
    - Their status, drafts, reviews, publications, derivatives and calendar events are not touched.
    - The calendar event hash does not change, so no event is rewritten.
  - **Run 1 is not auto-generated:** `auto_generate` is false (A4), because its posts are in hand-made batches. You can switch it on. Section 6 asks.
  - **Retiring the package generator safely:**
    - The live γ8 version keeps calling `ensureSlots` until the new one is serving, and can insert a post with no run.
    - The new version stops calling it and runs a backstop on every run read: a post with no run whose date falls inside a run of its project joins that run. A post outside every run is shown on the Run plan as "Outside any run", never hidden.
    - `projects.package` loses NOT NULL in A1 and is no longer read or written. It is dropped in A2, once A1 is live (CLAUDE.md: a drop over two checkpoints).
  - **Neon dev** has its own Migss data (24 posts), so the gate shows the migration on that. Production is checked in the A1 smoke.
  - Needs confirmation.

- **Q4, cadence and arranging.** Proposal:
  - **Rules, one per content type, as JSON in `run_channels.cadence`:**
    - SEO: `{ "weekdays": [1, 2, 5] }`, for Monday, Tuesday and Friday;
    - a derived channel, either `{ "after": 1 }` (the day after its SEO post) or `{ "weekdays": [3, 0] }` (the next Wednesday or Sunday on or after its SEO post).
  - **On screen:** weekday chips per row, plus "Days after its SEO post" for derived rows.
  - **Generating:**
    - SEO slots fill the rule's weekdays from the start date until the amount is reached or the run ends.
    - Derived slots take the SEO posts in date order, one each, up to their amount.
    - A preview shows the counts and the last date before anything is saved ("12 SEO posts from 3 Nov to 26 Jan; 12 LinkedIn; 8 GBP").
  - **Changing a rule regenerates only empty, unmoved placeholders:** no topic, no plan item, still on the date its rule gave (`slot_date = cadence_date`), and nothing generated. Anything else stays put. If the new rule gives fewer slots, the surplus empty ones go, and their calendar events with them.
  - **Moves:**
    - any slot can be moved to any day inside its run, as SEO slots are today;
    - a moved slot keeps its cadence date, so it counts as moved and a rule change leaves it alone;
    - a derived slot can be moved, but not before its parent.
  - **Numbering** ("SEO post 3", "LinkedIn post 3") is the slot's place in its run by date, worked out when shown, so a move renumbers without a write.
  - Needs confirmation.

- **Q5, the planner.** Proposal (`planner-1`):
  - **Inputs** (one function, `plannerContext(projectId, runId)`, the seam for session B, Q10):
    - the cached knowledge pack;
    - the blog channel rules;
    - the run's priority notes, dates and slot list;
    - the project's pillars;
    - every topic already covered: the titles of published posts, and of posts with a topic in this and earlier runs;
    - the sitemap's page titles and paths.
  - **Output per SEO slot,** structured:
    - title;
    - excerpt (at most 160 characters, the same rule as the writer's);
    - pillar (one of the project's);
    - category (Finance, Guarantee, Cost, Technical, or Other: the gap grid's categories, so session B's grid can read them);
    - reason, one sentence on what it draws on ("A cost question; the sitemap has no cost page for wet rooms").
  - **Not repeating covered topics:**
    - the prompt lists every covered title and page;
    - a scripted check flags any planned title whose normalised words overlap a covered title or page by more than 60%: "Close to *Wet room maintenance week by week*". You can regenerate that item or keep it.
  - **Regenerating:**
    - one item gets one call, with your note and the rest of the plan as context, so it does not duplicate a sibling;
    - the whole plan gets one call, with your note.
    - Every note goes to the learning loop as a new source, "From your note on the plan for Run 2".
  - **Model and cost:** the writer model (Opus 5.5) at effort high, in Trigger.dev like every model call.
    - About $0.15 to $0.25 for a 12-item plan, and $0.40 to $0.60 for 36 items. One item is about $0.03 to $0.05.
    - Each call is recorded as purpose `plan`, which needs the purpose check widened.
  - **Storage:** `plan_items`:
    - run, post, version, title, excerpt, pillar, category, reason, status, note, AI call;
    - old versions are kept.
    - Approving the plan writes each title to its post's topic (status Topic set), and the excerpt to a new `posts.planned_excerpt` the spec reads in A4.
  - **What the plan covers:** SEO slots only. Derived slots take their parent's topic.
  - Needs confirmation of the category list and effort high.

- **Q6, the client link.** Proposal:
  - **Token:** 32 random bytes, base64url, shown once in a copy box. Only its SHA-256 is stored, in `plan_shares` (run, hash, created, expires, revoked, last viewed).
    - Expiry is 60 days by default.
    - Revoke takes effect at once. Making a new link revokes the old one.
  - **Route:** `/plan/<token>`, public, outside the sign-in guard, on its own plain layout using the design system.
    - It sends `noindex`, `no-referrer` and `no-store`.
    - An unknown, revoked or expired token gets the same "This link is not active" page, so nothing can be learnt by guessing.
  - **What the client sees:**
    - the client and project names, the run's dates, then each SEO item: date, title and excerpt;
    - derived channels as counts only ("plus 12 LinkedIn posts");
    - **no** costs, models, internal notes, priority notes, reasons or statuses.
    - Reasons can mention internal knowledge, so they stay hidden. Section 6 asks.
  - **What the client can do:**
    - comment on an item, or suggest a change to it (a text box each);
    - approve the whole plan, with a name;
    - every submission needs a name, kept for the next visit in the browser only.
  - **Stored** in `plan_feedback`: share, item (or none for the whole plan), kind (`comment`, `suggest`, `approve`), name, body (at most 2,000 characters), `created_at`, and a hash of the IP address.
  - **Shown to Amir:**
    - on the Run plan tab, beside each item and in a list;
    - a badge on the tab ("3 new from the client");
    - "Approved by <name> on <date>" on the run.
    - Approval is recorded, and Activate run stays yours.
  - **Into suggestions:** each comment or suggestion starts a candidate run (source "client"), shown "From the client's comment on <title>". An approval starts none.
  - **Abuse:**
    - at most 30 submissions per token per hour and 200 per token in all;
    - a hidden honeypot field;
    - bodies are stored as text and never rendered as HTML;
    - after the run is activated, the link still shows the plan but takes no more feedback.
  - **Print:** a print stylesheet with no buttons or text boxes, one item per block, never split across pages, and the date and link at the foot.
  - Needs confirmation, especially hiding reasons and the 60-day expiry.

- **Q7, fortnightly generation.** Proposal:
  - **Where it runs:** a Trigger.dev schedule, not Vercel Cron, because the Anthropic key lives in Trigger.dev. It runs daily at 06:00 Europe/London (Trigger.dev schedules take a time zone, so no UTC shift).
  - **How a fortnight is decided:** each active run with auto generation on has `next_generation_on`.
    - **On activation:** that day generates every SEO post dated up to 27 days ahead, and sets the next date 14 days later.
    - **On each generation day T:** generate every planned SEO post dated up to T + 27 that has not been generated, then set next = T + 14.
    - So 2 to 4 weeks of posts are always ready, and a missed day catches up the next morning.
  - **Specs from the plan:**
    - a batch per generation is created for the run ("Run 2, from 10 Nov"), with the run's defaults;
    - each post's spec is drafted from its approved title and excerpt, and marked `auto` and confirmed with no step from you;
    - the post page shows "Spec drafted from the approved plan".
  - **The Message Batches flow:**
    - The writer, critic and fix-round loop becomes a step function: given what is saved, return the next call (spec, writer round n, critic n) or "done". The real-time task runs it in a loop as today; the batch path runs each step for many posts at once. One logic, so the two paths cannot drift.
    - **A round:** collect the next call for every post in the generation, submit one batch (`client.messages.batches.create`, `custom_id` = generation and step), and store it in `generation_batches` (run, round, Anthropic batch ID, request count, status, submitted, ended).
    - **Polling:** a Trigger.dev task polls every 5 minutes with `wait.for`, which costs no compute while waiting. Most batches end within an hour; the limit is 24 hours.
    - **Collecting:** read the results by `custom_id` (they arrive in any order), save each draft or verdict as the real-time path does, then submit the next round.
    - A post needs at most seven rounds (spec, then up to three writer and critic pairs). A whole fortnight is ready the same day.
  - **Failures and partial results:**
    - each result is handled on its own;
    - an `errored` result with a server error, or an `expired` one, goes into the next round once more;
    - a second failure marks that post "Could not finish", which already exists;
    - `invalid_request` fails the post at once with its message;
    - the rest of the batch carries on.
  - **Cost:**
    - Batch prices are 50% of every token price. `ai_calls` gains `batch` (true or false), and `callCost` halves for batch calls.
    - Prompt caching works in batches but is best-effort, so the cost recorded is what Anthropic reports.
    - Expected: about half of Phase 1's per-post cost, so roughly $0.15 to $0.25 a post on Opus.
  - **Generate now:**
    - on a post, it runs today's real-time path (auto spec, then the writer loop) at full price, labelled "Full price, starts at once";
    - "Generate the next fortnight now" on the run runs the next generation day today, in batch.
  - **Derived posts:** generated when their parent is approved, through the existing `write-derivative` task, in real time. They cost about $0.03 each, so batching would save cents at the price of up to an hour's wait. Only channels with a derived slot are generated.
  - **On the calendar and Run plan:**
    - a generated post shows its status as today;
    - an ungenerated planned post shows "Generates on 10 Nov";
    - the run header shows "Next generation: Mon 10 Nov, 12 posts".
  - Needs confirmation, especially the Trigger.dev schedule and real-time derived posts.

- **Q8, statuses.** Proposal: post statuses do not change. A new sibling module, `src/config/run-status.ts`, holds the rest, with the drift test extended to it (D.3.1):
  - **Run statuses:**
    - Setting up (configured, slots generated, no plan);
    - Planning (a plan is drafted);
    - Plan approved;
    - Active;
    - Finished (past its end date, derived, never stored).
  - **Plan item lines:** Drafting, To approve, Approved, Replaced, Close to an existing topic.
  - **Client lines:** Not sent, Sent to client, Viewed by client, Client commented, Approved by client.
  - **Derived slot lines:** Planned, then the existing derivative lines.
  - **Generation lines:**
    - Generates on <date>;
    - In the half-price batch;
    - the existing writing lines once a round starts.
  - **Content type words** come from `content-types.ts` ("SEO post", "GBP post").
  - Needs confirmation of the words.

- **Q9, migrations.** Each one is safe for the version still live while it builds. The full rehearsal output is kept for every gate, with no `tail`, written to a file and pasted whole.

  | Checkpoint | Migration | What it does | Why the live version is safe |
  |---|---|---|---|
  | A1 | `0008_runs` | adds `runs`, `run_channels`, `derived_slots`; `posts.run_id` (nullable); drops NOT NULL on `projects.package`; inserts Run 1 per project and sets `posts.run_id`; adds the `btree_gist` extension and the no-overlap constraint | γ8 never reads the new tables; its `ensureSlots` inserts still work (run nullable, package still set); the backstop adopts them |
  | A2 | `0009_drop_package` | drops `projects.package` and its check | A1, live during A2's build, neither reads nor writes it |
  | A3 | `0010_plans` | adds `plan_items`, `plan_shares`, `plan_feedback`; `posts.planned_excerpt`; `rule_candidates.plan_feedback_id`; widens the candidate source check to exactly one of three; adds `plan` to the AI call purposes | additive; A2 always sets a review event or a derivative, so the wider check holds |
  | A4 | `0011_batch_generation` | adds `generation_batches`; `ai_calls.batch` (default false); `post_specs.auto` (default false); `batches.run_id`; `runs.auto_generate` and `next_generation_on` | additive, with defaults that match A3's behaviour |

  - Neon dev each time: host check `ep-square-mode-zatw6e39`, `--rehearse <tag>` with its whole output kept, migrate, then the independent query.
  - Needs confirmation of the order, especially dropping the package column in A2.

- **Q10, what session B needs from A.**
  - **Planner knowledge:** `plannerContext()` is the one place the planner reads knowledge, covered topics, the sitemap and insights. B swaps typed entries and recorded topics in there, and the prompt does not change shape.
  - **Performance:** the Content and performance tab is a list of published posts with live links, plus an empty `insights` slot. B fills that slot, and `plannerContext().insights`, with Search Console and GA4. In A, `insights` is always an empty list.
  - **The Knowledge tab:** one route, `projects/[id]/knowledge`, rendering today's tiers and the sitemap. B replaces that page component; the tab, its URL and the nav stay.
  - **The inbox:** client and plan feedback reach `rule_candidates` like every other source. B's inbox reads that same table.
  - **Gap grid categories:** each plan item's category uses B's four categories plus Other, so the grid can count planned and published topics.
  - Needs confirmation.

**Layouts proposed** (no prototype exists; all from the design system's existing components):
- **Run configuration** (Run plan tab):
  - a card with preset, start date, length (1, 2 or 3 months) and priority notes;
  - a table with one row per content type: amount and cadence chips;
  - the post defaults (length, CTA, FAQ, models), folded away by default;
  - a preview line, then "Create slots".
- **Run plan tab:**
  - a run header: status badge, dates, next generation, client approval, and the actions (Plan the run, Share with the client, Activate run);
  - below it the slots by week: each SEO slot a row, its derived slots indented beneath with their channel badge and date;
  - then "Past runs" folded.
- **Planner:** the same rows, each showing the planned title, excerpt, pillar, category badge, the reason in small type, any client comments, and Regenerate (with a note). A footer has "Approve plan" and "Regenerate the whole plan".
- **Client page:** a single centred column, the BrandFactory mark, the plan as cards, a comment box under each, and Approve plan at the end.

**Smaller decisions I will take unless you object:**
- **Presets prefill per week:**
  - Entry: SEO 1 a week on Tuesday.
  - Mid: SEO 2 a week on Tuesday and Thursday.
  - Premium: SEO 3 a week on Monday, Wednesday and Friday.
  - Every preset adds one LinkedIn, one GBP, one Facebook and one Pinterest post per SEO post, each the day after it.
  - Amounts are per week × the run's weeks, editable.
- **The Run plan's old wording** ("Entry package: one planned slot a week is added automatically") goes. The CRM's package counts become "Current run" per project.
- **`ensureSlots` is deleted** in A1, after the consumer audit; `reconcileSlots`'s deletion queue for calendar events moves into the run regeneration code.
- **Activation needs an approved plan.** You can activate before the client answers.
- **The batch form stays** for hand-made batches. It lists slots of any run that have a topic and no batch.

## 4. Checkpoint structure

One orientation, four checkpoints. Each ends with its own gate (`docs/gate-p2a1.md` to `gate-p2a4.md`), a PR, a merge and a short production smoke before the next starts.

| Cp | Focus | Main files | Risk |
|---|---|---|---|
| A1 | Runs, presets, run configuration, the cadence engine, SEO and derived slots, moves, Migss as Run 1, retiring `ensureSlots`, derived events on the calendar | schema, `0008`, `runs.ts`, `run-presets.ts`, `content-types.ts`, `run-status.ts`, `slots.ts`, calendar sync, Run plan tab, CRM, project cards | **High:** touches every slot and Migss's live posts. The migration is rehearsed on a copy of production's shape (below). |
| A2 | The four tabs: Details, Run plan, Content and performance, Knowledge; old URLs redirect; drop `projects.package` | `nav.ts`, project routes, `0009` | Low. Moves existing screens; a consumer audit of every link to the old tabs. |
| A3 | Planner, item and plan regeneration, approval, the client link, client feedback into suggestions, recorded approval, activation | `planner*`, `plan-share.ts`, `/plan/[token]`, `learn*`, `0010` | Medium: a public route. A real plan is run on Neon dev with its cost. |
| A4 | The schedule, Message Batches, the step function, auto specs, derived posts on approval, Generate now, generation state on the calendar | `ai/batch.ts`, `generation.ts`, `fortnight.ts`, two tasks, `0011` | **High:** refactors the generation loop. Phase 1's real-time tests must still pass unchanged. A real batch generation of two posts is run on Neon dev. |

**Protecting Migss in A1:**
- Before Neon dev, the migration is applied locally to a database seeded in production's shape:
  - a Mid project with posts on Tuesdays and Thursdays;
  - a second post on the same days with no cadence date;
  - a published post with derivatives and a publication;
  - posts in Needs review and Writing;
  - calendar hashes.
- A test then shows every row unchanged apart from `run_id`.

**Real runs:**
- **A3:** one real plan for a Neon dev run (about $0.15 to $0.25), one item regeneration and one whole-plan regeneration.
- **A4:** one real batch generation of two posts (about $0.30 to $0.60 at half price), and one real derived post after approval.

## 5. Estimated LOC and test deltas

Hand-written code and tests, excluding the lockfile and generated migration files.

| Cp | LOC (est.) | New tests (est.) |
|---|---|---|
| A1 | 1,900 | 35 Vitest (presets, cadence engine, derived placement, regeneration keeping moves, overlap, Run 1 migration, backstop, derived events), 5 Playwright |
| A2 | 700 | 4 Vitest (tabs, redirects), 6 Playwright (each tab, old URLs, phone width) |
| A3 | 2,000 | 30 Vitest (prompt, overlap check, item and plan regeneration, tokens, expiry and revoke, rate limit, feedback into suggestions, approval), 7 Playwright (planner, share, client page approve, suggest and comment, print, phone width) |
| A4 | 1,800 | 30 Vitest (step function against the existing real-time cases, batch rounds, partial and expired results, schedule dates, batch cost, auto specs, derived on approval), 4 Playwright |
| **Total** | **about 6,400** | **about 99 Vitest, about 22 Playwright** |

Estimates only. Each gate cites the runner's own summary lines (D.1.2).

## 6. Ambiguities to resolve before starting

1. **Answers or amendments for Q1 to Q10**, especially:
   - **Q1:** runs of a project never overlap;
   - **Q2:** derived slots in their own table, at most one per channel per SEO post;
   - **Q3:** Run 1 created by the migration, and not auto-generated;
   - **Q6:** reasons hidden from the client, and a 60-day link;
   - **Q7:** the schedule in Trigger.dev at 06:00 UK time, and derived posts written in real time on approval.
2. **Instagram:** keep it out of session A (Phase 3), as proposed, or add an Instagram copy channel now?
3. **The Details tab's profile:**
   - The project has ICPs, project facts and CTA; brand voice is client knowledge, on the client page; there is no "positioning" field anywhere.
   - Proposal for A2:
     - show the project's sections there, editable, moved from Knowledge;
     - show the client's voice read-only, with a link to edit it on the client page;
     - leave positioning to session B's knowledge entries.
   - A new Positioning section now would change the knowledge pack every writer reads. Say if you want it in A2 anyway.
4. **Branch per checkpoint:** keep the one designated branch, restarted after each merge (section 1), unless you prefer separate names.
5. **Nothing needed from you before the build.** A4's Trigger.dev schedule deploys with the merge. It needs no new variables: the Anthropic key and `DATABASE_URL` are already in Trigger.dev Production.

Nothing runs against Neon dev or the Anthropic API until this is approved.

---

**Stopping here. No code until you approve.**
