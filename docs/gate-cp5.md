# Verification gate: Phase 1, checkpoint γ5 (review, approval and covers)

Status: **complete.** Every check passes and the real runs are recorded below. Per CLAUDE.md the PR is opened and merged, and the production smoke list is at the end.

## Git state

```
Branch: claude/gamma4-cost-cache-validation-jpq1pb (pushed). Started from main 33874e1 (γ4 and its gate updates).
Commits since main:
<this gate commit>
cf463ef Critic hears Amir's regenerate note (critic-3)
808ce4e Real-run commands for γ5, and the drift test covers Needs your input
059ad59 γ5.5: Drive cover picker
b43806f γ5.4: rule candidates from Amir's edits
3c9c583 γ5.3: regenerate with a note
737e050 γ5.2: review editor, approve, reject, reopen and publishing details
bc80a98 γ5.1: smoke fixes (placeholders, Examples, length, title) and migration 0004
a39b33b Record γ5 orientation approval
348b531 Add γ5 orientation report
ecfcb23 Add γ5 handoff
Status: clean before this gate commit.
```

## LOC delta

Excluding `pnpm-lock.yaml` and `drizzle/meta`, before this gate: `54 files changed, 4382 insertions(+), 171 deletions(-)`. The orientation estimated about 3,950 lines. Most of the difference is tests (the review, rules and covers suites, and the Google stand-in), plus the critic-3 change that came out of the real run.

## Test count

Vitest:
```
 Test Files  35 passed (35)
      Tests  266 passed (266)
```
Playwright:
```
  75 passed (2.0m)
```
Delta from γ4: Vitest +3 files, +40 tests (226 to 266). Playwright +9 tests (66 to 75).

## Typecheck, lint and build

`pnpm typecheck` and `pnpm lint` exit 0. Playwright builds the app with `pnpm build` before every run, so the production build passed as well.

## Migrations

`drizzle/0004_review.sql` (28 statements). It is safe for the live version:
- it adds three tables (`post_versions`, `review_events`, `rule_candidates`);
- it adds nullable columns to `posts`, `post_generations` and `critic_verdicts`;
- it adds a partial unique index and a slug check on the new column;
- it replaces `ai_calls_purpose_check` with a wider list that adds `rules`, in the same transaction.

**Local:** applied to `bfm_test`, 5 migrations applied.

**Neon dev** (host check `ep-square-mode-zatw6e39`). Rehearsal, verbatim:
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Rehearsal: 28 statements from drizzle/0004_review.sql, inside BEGIN ... ROLLBACK
Inside the transaction: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, google_tokens, knowledge_versions, post_drafts, post_generations, post_specs, post_versions, posts, project_pillars, projects, review_events, rule_candidates, sessions, site_pages, users
Rolled back.
Public tables: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, google_tokens, knowledge_versions, post_drafts, post_generations, post_specs, posts, project_pillars, projects, sessions, site_pages, users
Applied migrations: 4
  1 bc9dce5f5136 1792531354466
  2 58801d2dc19d 1792542524859
  3 9b771848e2a2 1792547861813
  4 019250fdfb17 1792588397103
```
Migration, verbatim:
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Migrator finished.
Public tables: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, google_tokens, knowledge_versions, post_drafts, post_generations, post_specs, post_versions, posts, project_pillars, projects, review_events, rule_candidates, sessions, site_pages, users
Applied migrations: 5
  1 bc9dce5f5136 1792531354466
  2 58801d2dc19d 1792542524859
  3 9b771848e2a2 1792547861813
  4 019250fdfb17 1792588397103
  5 a8bd56f19ad4 1792607618124
```
Independent check (separate queries), verbatim:
```
host: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech
new columns: critic_verdicts.placeholders nullable=YES, post_generations.base_version_id nullable=YES, post_generations.note nullable=YES, posts.approved_at nullable=YES, posts.cover_chosen_at nullable=YES, posts.cover_drive_file_id nullable=YES, posts.cover_name nullable=YES, posts.cover_path nullable=YES, posts.slug nullable=YES
check: ai_calls_purpose_check CHECK ((purpose = ANY (ARRAY['spec'::text, 'writer'::text, 'critic'::text, 'check'::text, 'rules'::text])))
check: post_versions_version_check CHECK ((version >= 1))
check: posts_slug_check CHECK (((slug IS NULL) OR ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 80))))
check: review_events_action_check CHECK ((action = ANY (ARRAY['approve'::text, 'reject'::text, 'regenerate'::text, 'reopen'::text])))
check: rule_candidates_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'accepted'::text, 'dismissed'::text])))
check: rule_candidates_tier_check CHECK ((tier = ANY (ARRAY['agency'::text, 'client'::text, 'project'::text])))
index: CREATE UNIQUE INDEX posts_project_slug_unique ON public.posts USING btree (project_id, slug) WHERE (slug IS NOT NULL)
0004 hash in database matches file sha256: true a8bd56f19ad4
row counts: {"posts":"24","versions":"0","events":"0","candidates":"0"}
```

**Production:** not from this session. It runs in the Vercel production build of the merge, after a Neon backup branch, as in γ4.

## Real runs on Neon dev

`trigger.dev dev` from this session (`Local worker ready on branch: default [node-24] -> 20261021.4`, rebuilt as `.5` after critic-3), with the dev-only WebSocket alias from γ4. The flows were driven by `scripts/real-run.ts`, which calls the same functions as the server actions: `queueRegeneration` and `startGeneration`, then `approvePost` and `startRuleCandidates`.

The post is the γ4 real run's "Finance Bathroom Installs" (`9d47679d…`), which was in Needs review with five placeholders.

**1. Regenerate with a note (critic-2).** The note: "Shorten the opening to two sentences, and end the finance section by telling readers to ask about payment options at the free consultation."
```
○ Oct 21, 19:17:03.182 ->  20261021.4 | generate-post | run_06glvoqo7pmdl7s5u4esr06r01.1 | Success (2m, 3.7s)
19:15:31 | writer | claude-opus-5-5 | high | writer-2 | 4676 | 3878 | 2277 | 0 | 0.107649 | 29958 | end_turn |
19:16:00 | critic | claude-opus-5-5 | high | critic-2 | 4859 | 2914 | 3341 | 0 | 0.094421 | 28051 | end_turn |
19:16:30 | writer | claude-opus-5-5 | high | writer-2 | 5182 | 3787 | 0 | 2277 | 0.096923 | 29563 | end_turn |
19:17:02 | critic | claude-opus-5-5 | high | critic-2 | 4920 | 3292 | 0 | 3341 | 0.086188 | 30395 | end_turn |
```
(time, purpose, served model, effort, prompt version, input, output, cache write, cache read, cost USD, ms, stop reason)

- **Cost:** $0.385181 for 4 calls; the round-2 writer and critic read the cache.
- **What the writer did:**
  - Round 1 started from Amir's saved version and added "ask us about payment options at your free design consultation", as the note asked.
  - The critic failed round 1 on that sentence: "'Payment options' implies Migss offers some payment or finance arrangement, which the pack does not confirm".
  - Round 2 removed the sentence and passed.
- **Finding:** the critic did not see Amir's note, so it undid what he asked for.
- **Fix, critic-3:** the critic now receives the note as approved by Amir and judges the rest as usual. It has a Vitest test, and the regenerate test asserts the note reaches the critic.
- **The critic-2 asks worked.** It listed all five placeholders with plain asks, for example "Give Migss's deposit amount and payment schedule, meaning when payments fall due during the job."
- **Examples copying:** it also caught a close paraphrase of a client Example, "Mark the shower area on the floor with tape...", as blocking under "voice". The 8-word scripted check did not catch that one, as expected for a paraphrase.

**2. The same note again, with critic-3:**
```
○ Oct 21, 19:19:31.713 ->  20261021.5 | generate-post | run_06glvpjpjdnt8epld5f4fl7201.1 | Success (1m, 8.3s)
writer | writer-2 | 4718 | 4325 | 0 | 2277 | 0.105827
critic | critic-3 | 5013 | 3568 | 0 | 3341 | 0.092080
```
(purpose, prompt version, input, output, cache write, cache read, cost USD)

- **Cost:** $0.197907 for 2 calls, both reading the cache. It passed in round 1 and kept "Whichever route you are leaning towards, ask us about payment options at your free design consultation."
- **The critic's notes** were minor only. The first was "Keeping to Amir's two sentences has produced one sentence of about 60 words", so the opening note was followed and the critic weighed it against the short-sentence rule.

**3. Approve with edits, then rule candidates (rules-1).** The script took out every sentence holding a placeholder, standing in for Amir where Migss has no such fact, then approved:
```
Approved: review event 4c6dfe9c-87af-4dd3-ba11-fa6758ee2961, edits true
Rule candidates: run run_06glvpv5ob8hpio9s0opqi4901
○ Oct 21, 19:20:07.371 ->  20261021.5 | propose-rules | run_06glvpv5ob8hpio9s0opqi4901.1 | Success (10.7s)
event {"hunks":5,"warnings":[]}
CANDIDATE project:cta | Where a post mentions finance, payment schedules or deposit terms, do not state Migss terms; tell readers to ask about payment options at the free design consultation.
   before: Our payment schedule and deposit terms are [Migss payment terms].
   after: null
   reason: Amir removed every unfilled payment and finance placeholder and asked twice for readers to be sent to the consultation instead, which any cost or budgeting post will need.
rules | claude-opus-5-5 | medium | rules-1 | 803 | 493 | 3013 | 0 | 0.028137 | 9160 | end_turn
{"status":"approved","slug":"how-to-finance-a-bathroom-renovation-a-guide-for-london-and-essex-homeowners","approved":true}
```
- **Cost:** $0.028137.
- **The candidate:** one, sensible, and drawn from both the diff and Amir's two regenerate notes. It is left proposed on Neon dev, for the smoke-style check in Settings.

**γ5 real spend:** $0.611225 (0.385181 + 0.197907 + 0.028137). With γ4's $1.280466, that is $1.891691 recorded against the $25 key.

## Consumer audit (D.3.3)

- **`src/lib/checks.ts`:**
  - It gains the `examples` check, a 5% length tolerance (`info.lengthNote`) and `findPlaceholders`. The placeholder pattern no longer spans line breaks.
  - Consumers: `generation.ts` (drafts), `review.ts` and `review-rules.ts` (saves and approve), `ReviewEditor` (live), `prompts/critic.ts` (length note), `drafts.ts` (queue counts).
  - All are covered by the check, review and prompt tests.
- **`LoadedPack` gains `client`:** one consumer, `checkDraft`, which feeds the Examples check.
- **Critic reply gains `placeholders`:** stored in `critic_verdicts.placeholders`, which is null on γ4 rows. It is read by `placeholderAsks` and shown in the editor.
- **`getDraftView`:**
  - It now shows the newest run that has drafts, so a running regenerate does not hide the post.
  - Costs carry a `run`.
  - Consumers: the post page and the review queue. The Generating screen uses `batch-progress`, which is unchanged.
- **Failure paths:** `failGeneration`, `markNotStarted` and `closeStalledGeneration` send a regenerate back to Needs review and a batch run back to Spec ready (`statusAfterFailedRun`). Covered by Vitest.
- **Status module:**
  - It gains `REVIEW_LINES.needsInput` ("Needs your input"). The drift test now covers it.
  - No new statuses. Approve, reject, reopen and regenerate use `approved`, `rejected`, `in_review` and `generating`.
- **Domain resets:** `src/test/db.ts` and `e2e/resetDomain()` clear `rule_candidates`, `review_events` and `post_versions` first, unlinking `post_generations.base_version_id`.
- **The γ4 draft view test** now opens the editor (`e2e/batches.spec.ts`).

## What was verified vs code-inspection only (MANDATORY)

**Verified (how):**
- **The smoke post's failures** (Vitest on the exact text Amir gave):
  - its three placeholders are found, and Approve is refused with "Fill in 3 placeholders to approve.";
  - its three copied Examples, including the close paraphrase, fail the Examples check;
  - the 1,756-word first draft would still go back, while 5% over passes with a note;
  - the critic prompt carries title honesty.
- **Approval blocks** on placeholders, em and en dashes and banned phrases, and lets other check failures through as warnings recorded on the event: Vitest, and Playwright typing a dash into the editor.
- **The editor in the browser** (Playwright with screenshots, looked at, desktop and 390px):
  - placeholders tinted in the editor and the preview;
  - critic quotes underlined and selectable from the panel;
  - live checks, Save draft creating a version, the browser copy;
  - Reject with a note, Approve locking the text, Reopen for editing.
- **Regenerate:**
  - end to end with the real API on Neon dev (above);
  - in Vitest with a fake API: the note and Amir's text reach the writer, the note reaches the critic, failure goes back to Needs review;
  - in Playwright: the running state, auto-refresh to the new draft, and costs grouped by run.
- **Rule candidates:**
  - real run on Neon dev (above);
  - Vitest: valid places only, never paying twice, accept appends one line as a new version and leaves the rest alone, edit and move before accepting, dismiss;
  - Playwright: triage in Settings.
- **Cover picker:**
  - Vitest against a fake Drive: subfolders, pages of 60, the parent walk, refusal outside the folder, the thumbnail host allow-list;
  - Playwright against the Google stand-in: browse into Bathrooms, Show more photos, choose, the recorded path, a 404 outside the folder.
- **Slug:** unique per project and off existing site pages (Vitest). Prefilled from the title (Playwright).
- **Neon dev migration:** outputs above.

**Code-inspection only (needs the smoke):**
- **Real Google Drive:** this session has no Google token. Thumbnails from `lh3.googleusercontent.com`, the parent walk on Amir's real folder, and paging on a real large folder are only proven by the production smoke.
- **The editor on Amir's own devices**, especially iPhone Safari: CodeMirror's touch editing was only checked at 390px in headless Chromium.
- **Rule candidates and regenerate in Trigger.dev Production:** the task code is the same, but production runs use the app's node-postgres client, not the dev alias.
- **The production migration:** the first real run is this merge's own production build.

## Deliberately unchanged / out of scope

- Uploading the cover to Wix, publishing, and GMB and LinkedIn copy: γ6.
- The prototype's "Internal links, Optimise links" panel: Phase 2.
- Editing published posts. Reopen for editing refuses a published post.
- Backlog 20 (tasks built twice per push): Amir changes the Trigger.dev setting himself.

## Backlog housekeeping

- Closed 11 (the cover picker browses subfolders) and 19 (length: middle-of-range target and 5% tolerance).
- 18 was closed at orientation.
- Added 21 (duplicate rule candidates across posts).

## Production smoke list

1. **Vercel build log of the merge:** expect `backup/pre-0004_review-...` created and ready, `Migrator finished.`, `Applied migrations: 5` and `Check passed`.
2. **Review queue, Needs your input:** the smoke post ("Wet room maintenance week by week") shows its placeholders to fill.
3. **Open the smoke post:**
   - its `[CONFIRM ...]` placeholders are tinted in the editor and the preview;
   - "Needs your input" lists them, with what to supply where the post has critic-2 asks. The γ4 post has none, so it shows the placeholders only;
   - Approve post is disabled with "Fill in N placeholders to approve."
4. **Fill or remove each placeholder**, then edit one line. Approve post becomes available; Save draft says "Draft saved."
5. **Cover image:**
   - Choose cover, open a subfolder (Bathrooms), and check thumbnails load and Show more photos appears for a large folder;
   - pick a photo, and check the cover shows with its folder path.
   - Report back if thumbnails do not load.
6. **Check the slug and pillar tag** (Bathroom Renovation), save the details, then Approve post. The text locks and the banner links to Settings, BrandFactory rules.
7. **Within a minute or two, Settings, BrandFactory rules, "Rule candidates from your edits":** the candidates from your edits appear. Accept one (it is added to that section as a new version) and dismiss one.
8. **On iPhone Safari:** open a post in Needs review. Check the Edit and Preview tabs, typing in the editor, and that the buttons fit. Report back if typing or selecting text misbehaves.
9. **Optional, about $0.20 to $0.70:** Regenerate with a note on another post. Watch it move to Needs review, and check the cost table shows "Regenerate 1: <your note>".
