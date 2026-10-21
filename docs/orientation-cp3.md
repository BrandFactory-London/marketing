# Orientation: Phase 1, checkpoint γ3 (calendar slots, statuses and the Posts page)

21 Oct 2026. Written from the template in `docs/templates/orientation-report.md`. No code has been written.

Read in full:
- `docs/handoff-cp3.md` (see section 1: it is on branch `docs/handoff-cp3`, not on main);
- `CLAUDE.md`;
- `docs/design-decisions.md` (decisions 14, 15 and 16 closely);
- `docs/scope.md`, `docs/backlog.md`, `docs/gate-cp2.md`;
- `src/config/packages.ts`, `src/lib/projects.ts`;
- the `<main>` markup and script of `Calendar.dc.html`, `Posts.dc.html`, `Main.dc.html` (Home two-week calendar), `Project.dc.html` (Run plan tab) and `Projects.dc.html` (card badges).

Re-read from γ2: `design/system/README.md`, its "Content fundamentals" and "Colour" sections for the fixed status words and status colours. Not read: the γ4 to γ6 prototype screens (BatchSpec, SpecConfirm, Generating, Review, Post, Publish, Links).

## 0. Environment check

| Check | Result |
|---|---|
| Main | Pulled. `41dbc40` (γ2 merge) is the head; nothing after it. |
| `docs/handoff-cp3.md` | **Not on main.** It is on `origin/docs/handoff-cp3`, which is main plus one commit (`353fb52 Add γ3 handoff`) adding only that file. I read it from there with `git show` and did not merge anything. See section 6. |
| `DATABASE_URL` host | `ep-square-mode-zatw6e39-pooler...` (Neon **dev**), as the handoff says. |
| Neon dev, read only | `--check-only` over WebSocket: the nine γ2 tables and `Applied migrations: 2` (`bc9dce5f5136`, `58801d2dc19d`). One project: Migss Interiors / "Migss Interiors Website", `premium`, `active`. Database time zone `GMT`. |
| Local test database | Postgres 16 on `localhost:5433/bfm_test`, both migrations applied. |
| `pnpm install --frozen-lockfile` | Done, lockfile unchanged. |

The database time zone matters: "today" and "future" are London dates, so the app works them out in `Europe/London` rather than trusting the database clock (BST and GMT differ by an hour around midnight).

## 1. Branch state

```
$ git branch --show-current
claude/loving-cannon-ksyp3b
$ git log --oneline -3
41dbc40 Merge pull request #2 from BrandFactory-London/claude/loving-cannon-ksyp3b
4a6f512 Backlog: γ5 cover picker must browse Drive subfolders
d3a775f Gate: record the 0001 migration on Neon dev
$ git status
On branch claude/loving-cannon-ksyp3b
nothing to commit, working tree clean
```

PR #2 is merged, so I restarted this session's branch from `origin/main` (it held no unmerged commits). γ3 develops here and the PR will be "γ3 calendar slots, statuses and the Posts page". As in γ1 and γ2, this session can only push to this branch name.

## 2. Files in scope

**Status vocabulary (γ3.1)**
- `src/config/post-status.ts` (new): the one list of post statuses: key, display word, badge tone, calendar style (fill or dashed), and which statuses the Posts page lists. Every surface reads from it (D.3.1). Mapping in Q3.

**Schema (γ3.1)**
- `src/db/schema.ts`: new `posts` table (Q6).
- `drizzle/0002_<name>.sql` plus meta: generated, never edited by hand.

**Domain modules (γ3.1)**
- `src/config/packages.ts`: unchanged. `weekdays` already holds decision 15's days (JavaScript numbering, which Postgres `extract(dow)` shares).
- `src/lib/dates.ts` (new): London "today", date-only arithmetic, month grids. Pure, with tests across the BST change on 25 Oct 2026.
- `src/lib/slots.ts` (new):
  - `ensureSlots` tops up every active project's slots eight weeks ahead (Q1);
  - `reconcileSlots` runs on pause, resume and package change;
  - `setTopic` and `moveSlot`.
- `src/lib/posts.ts` (new): reads for the calendar month, Home's two weeks, a project's run plan, the Posts list with filters, and each project's next slot.
- `src/lib/projects.ts`: `createProject` and `updateProjectSettings` call `reconcileSlots` in the same transaction when status or package changes.

**Screens**
- γ3.2: `calendar/page.tsx`. Month grid, project filter, previous and next month, legend, side panel for the selected slot. The month, project and slot all live in the URL. `(app)/page.tsx`: Home's two-week calendar replaces the γ2 empty state.
- γ3.3:
  - `projects/[projectId]/plan/page.tsx`: the Run plan list;
  - `posts/page.tsx`: the Posts list with status and client filters;
  - `components/ProjectCards.tsx`: the "Next in run plan" line;
  - a shared `components/SlotEditor.tsx` for setting a topic and moving a date, used by the calendar panel and the run plan.
- Server actions next to the calendar and the run plan, each re-checking the session.

**Docs (γ3.4)**
- `design/system/README.md`: the status-words line, if Amir approves Q3. This is the first edit to `design/system/`. CSS and tokens stay untouched.
- `docs/backlog.md`, `docs/gate-cp3.md`.

**Tests**
- Vitest: `post-status.test.ts`, `dates.test.ts`, `slots.test.ts` (against the local Postgres), `posts.test.ts`, plus a consumer test that fails if any `src/` file other than the status module hardcodes a status word.
- Playwright: `calendar.spec.ts`, `run-plan.spec.ts`, `posts.spec.ts`, phone-width additions to `mobile.spec.ts`.

## 3. Open questions

- **Q1, keeping slots eight weeks ahead.** Confirm the lean: no cron.
  - `ensureSlots` is one `INSERT ... SELECT` over `generate_series`. For every active project, it inserts a planned slot for each cadence date from London today to today plus 55 days, with `ON CONFLICT (project_id, cadence_date) DO NOTHING`.
  - It runs when a project is created active, when a project is resumed or its package changes, and at the top of the Calendar, Home and Run plan reads. Posts and the card badges read only.
  - It is idempotent and safe if two pages run it at once, and costs one statement per page load.
  - The one drawback of a read-time top-up: if nobody opens the app for weeks, the slots are not there in the meantime. Nothing reads them while the app is unopened, and γ4's generation starts from a page Amir opens. So I see no reason for Vercel Cron yet.
  - Needs confirmation.

- **Q2, moved slots and regeneration.**
  - Each slot stores two dates: `cadence_date`, the package weekday it was generated for and never changed, and `slot_date`, where it sits now, which Amir can move.
  - A unique constraint on `(project_id, cadence_date)` makes the generator skip that cadence date for good. Moving Tuesday's slot to Wednesday leaves its `cadence_date` on Tuesday, so no new Tuesday slot appears. A test proves it.
  - Rules for moving:
    - only to today or later;
    - any day of the week;
    - two slots may share a day (both show).
  - Needs confirmation.

- **Q3, status mapping.** One key per decision 16 state; the display word and tone follow the design system's words and colours wherever they fit.

  | Status key (decision 16) | Display word | Badge tone | Calendar | Comes in |
  |---|---|---|---|---|
  | `planned` | **Planned** (new word) | neutral | dashed outline | γ3 |
  | `topic_set` | Draft | neutral | solid, neutral | γ3 |
  | `spec_confirmed` | Spec ready | brand | solid, brand | γ4 |
  | `generating` | Writing, then Checking | brand | solid, brand | γ4 |
  | `in_review` | Needs review | warning | solid, warning | γ4/γ5 |
  | `approved` | Approved | brand | solid, brand | γ5 |
  | `published` | Published | success | solid, success | γ6 |
  | `flagged` | Failed | danger | solid, danger | γ4 |
  | `rejected` | **Rejected** (new word) | neutral | solid, neutral, struck through | γ5 |

  - **Writing and Checking** are the two display words for `generating`. γ4 adds a `generation_step` column (writer or critic). The status stays `generating`, so the pipeline step never multiplies the status list.
  - **Flagged becomes Failed.** It is exactly the README's case: the critic failed it twice and it comes to Amir.
  - **Rejected gets its own word**, because it is Amir's decision rather than a failure. Folding it into Failed would make the Failed filter mix "the model failed" with "I said no".
  - **Planned is new**, because an empty slot is not a draft. The prototype already shows it ("Planned, not written yet").
  - **Draft for a topic-set slot** matches the prototype's Run plan, which shows "Draft" for a slot with a working topic.
  - **README change**, if approved: the status-words line becomes "Planned, Draft, Spec ready, Writing, Checking, Needs review, Approved, Published, Failed, Rejected", with a one-line note that Writing and Checking are the two steps of generating.
  - Needs confirmation of each word and tone, and of the README edit.

- **Q4, past slots.** Confirm the lean:
  - kept, never moved automatically, and shown as **missed** when the date has passed and the status is still `planned` or `topic_set`;
  - "Missed" is derived from the date, not stored, and not a status. It is a warning badge shown beside the status word ("Missed · Draft"), and a warning outline on the calendar;
  - you can give a missed slot a topic or move it to today or later. A moved slot stops being missed.
  - Needs confirmation.

- **Q5, topic entry.** Confirm the lean: topic only, up to 200 characters. Decision 14's keyword arrives with the spec in γ4. The calendar panel leaves the prototype's Keyword row out until then. Saving an empty topic clears it and puts the slot back to Planned (only while the slot is Planned or Draft). Needs confirmation.

- **Q6, migration.**
  - One new table, `posts`, one row per slot. It is the record γ4 to γ6 build on:
    - `id` uuid, `project_id` (FK, restrict);
    - `status` (text, check against the nine keys), `status_changed_at`;
    - `cadence_date` date, nullable for any future hand-added slot; `slot_date` date;
    - `topic` text, `topic_set_at`;
    - `created_at`, `updated_at`.
  - Constraints and indexes:
    - unique `(project_id, cadence_date)`;
    - indexes on `slot_date` and `(project_id, slot_date)`;
    - a check that `planned` means no topic, and any other status means a topic.
  - Later checkpoints add without reshaping. γ4: `generation_step`, a `batch_id` FK, and a `post_specs` table (one per post). The draft fields go on `posts` or a `post_versions` child table, decided in γ4's orientation, with columns for the knowledge version ids used (decision 7). γ5: `review_events` and `rule_candidates`. γ6: `publish_events`, `derivatives`.
  - The name follows the scope's data model ("Post"). A slot is a post that has not started.
  - **Sequence, confirmed as in γ2:**
    1. local `--rehearse` and apply;
    2. Neon dev `--check-only`;
    3. dev `--rehearse 0002_...` (your go-ahead);
    4. the real dev migration (separate go-ahead);
    5. your SQL check, then the smoke;
    6. production from a separate session in `marketing-production-migrations`: `--check-only`, `--rehearse`, real run, each on your go-ahead, then your SQL check, then the merge.
  - Needs confirmation.

Further questions this orientation raised:

- **Q7, what "opens" a slot that has a topic.** No post page exists until γ4 has a spec and a draft to show. Lean: selecting any slot on the calendar opens the prototype's side panel. It shows the status, date, project, topic, "Change topic" and "Move date", and "Missed" where it applies. The panel is the opened view in γ3, and γ4 adds "Open post" there when the post page exists. The panel never shows "Generate post" (γ4). Needs confirmation.

- **Q8, slot changes when a project changes.** Here "future" means London today or later.
  - **Pause:** delete future slots that are `planned` with no topic. Keep every slot with a topic, and every past slot.
  - **Resume:** `ensureSlots` fills the cadence again.
  - **Package change:** delete future empty `planned` slots whose cadence weekday is not in the new package (moved empty slots included, matched by their cadence weekday), then `ensureSlots` adds the new weekdays.
  - Slots with a topic always stay, even on a weekday the new package does not use. They then sit alongside the new cadence.
  - Premium to Mid and back therefore ends with the same empty Mon, Wed and Fri slots and every topic intact. That is your smoke step "switch to Mid and back".
  - Needs confirmation.

- **Q9, Run plan tab.**
  - Lists the project's slots from the earliest missed one through eight weeks ahead: date, topic (or "No topic yet"), status, and Missed where it applies. Each row has "Set topic" (or "Change topic") and "Move date", inline.
  - Left out: the prototype's batch checkboxes and "Create batch from ticked" (γ4), "Add to plan" and "Remove". The handoff does not list adding or removing slots, and removing is hard to reverse. A paused project shows "Paused: no planned slots. Resume it in Settings to plan again." plus any topic slots it kept.
  - Needs confirmation, or ask for add and remove.

- **Q10, Posts page.**
  - Lists every post at Draft or later, so `planned` slots stay on the calendar, as the prototype's subtitle says.
  - Columns: Post (topic), Client and project, Date, Status (with Missed). Words, Internal links and Views (GA4) are left out until they are real (γ4, γ5, Phase 2).
  - Filters: All, plus one chip per status that has at least one post, and a client select. Both are kept in the URL.
  - The search box is left out (not in the handoff). It is a small add if wanted.
  - Rows link to the calendar with the slot selected (Q7) until γ4's post page.
  - Needs confirmation.

- **Q11, card badges.**
  - Projects cards gain a "Next in run plan" row: "27 Oct · Wet room or shower tray", or "27 Oct · No topic yet". The next slot is the first at today or later.
  - Home tiles gain a brand badge "Next post 27 Oct".
  - Paused projects show "Paused, no slots planned".
  - The prototype's "To review" badge waits for γ5.
  - Needs confirmation.

Smaller decisions I will take unless you object:
- Calendar weeks start on Monday (prototype). The month grid is six rows of the month's weeks. Today is marked as in the prototype. The project filter lists active and paused projects.
- Home's two weeks start today and run 14 days, as in the prototype. Each slot links to the calendar with that slot selected.
- Within a day, slots order by project name, then creation.
- The prototype's legend shows four styles. The app's legend lists every status style that appears in the month shown, plus Missed, built from the status module.
- No change to Settings, knowledge or the sitemap.

## 4. Checkpoint structure

γ3 is one checkpoint with one gate, built in four internal stages.

| Stage | Focus | Files | Risk |
|---|---|---|---|
| γ3.1 | Status module, `posts` table and migration `0002` (local only), dates, slot generation and reconciliation, reads; project create and settings call reconciliation | `config/post-status.ts`, `db/schema.ts`, `drizzle/0002_*`, `lib/dates.ts`, `lib/slots.ts`, `lib/posts.ts`, `lib/projects.ts` | Medium. London dates across the BST change; generator idempotence and concurrency; the cadence uniqueness. |
| γ3.2 | Calendar page with side panel; Home two weeks | `calendar/*`, `(app)/page.tsx`, `components/SlotEditor.tsx` | Medium. First render of the calendar (D.2.3); a dense grid at phone width. |
| γ3.3 | Run plan tab, Posts page, card badges | `projects/[projectId]/plan/*`, `posts/*`, `components/ProjectCards.tsx` | Low. |
| γ3.4 | README words, backlog, Playwright and phone screenshots, gate | `design/system/README.md`, `docs/*`, `e2e/*` | Low. |

Then, each on your go-ahead: dev rehearsal, dev migration, your SQL check, your smoke on the branch preview. The production migration follows from a separate session, before merge.

**Optional check-in:** after γ3.2, with screenshots of the calendar (desktop and phone) and Home, since the calendar is the novel screen. Recommended.

## 5. Estimated LOC and test deltas

Hand-written code and tests, excluding the lockfile and generated migration files.

| Stage | LOC (est.) | New tests (est.) |
|---|---|---|
| γ3.1 | 1,000 | 40 Vitest (status mapping and consumer check, London dates across BST, generation, idempotence, concurrency, move without duplicate, pause, resume, package change both ways, topic set and clear, past slots, reads) |
| γ3.2 | 750 | 8 Playwright |
| γ3.3 | 600 | 7 Playwright |
| γ3.4 | 300 | phone-width additions; README and docs |
| **Total** | **about 2,650** | **about 40 Vitest, about 15 Playwright** |

Estimates only. The gate cites the runner's own summary lines (D.1.2).

## 6. Ambiguities to resolve before starting

1. **The handoff is not on main.** `docs/handoff-cp3.md` lives on `origin/docs/handoff-cp3`, which adds only that file on top of `41dbc40`. Options:
   - **A (recommended):** I commit the same file onto this γ3 branch as its first commit, so the γ3 PR carries its own handoff, as `docs/handoff-cp2.md` reached main in γ2.
   - **B:** you merge `docs/handoff-cp3` into main first and I pull it.

   Either way the content is identical (I read it with `git show`).
2. Answers or amendments for Q1 to Q11, especially:
   - **Q3:** the words, including the two new ones, and the README edit;
   - **Q7:** what opening a slot does in γ3;
   - **Q8:** the pause and package rules;
   - **Q9:** whether you want add and remove on the Run plan.
3. Whether you want the check-in after γ3.2.

Nothing will run against Neon beyond the read-only check in section 0 until you say so.

---

**Stopping here. No code until you approve.**
