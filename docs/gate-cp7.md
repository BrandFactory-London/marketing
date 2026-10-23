# Verification gate: Phase 1, checkpoint γ7 (the learning loop, and Facebook and Pinterest copy)

Status: **complete.** Every check passes and the real runs are recorded below. Per CLAUDE.md the PR is opened and merged, and the production smoke list is at the end.

## Git state

```
Branch: claude/hopeful-carson-fzy00j (pushed). Started from main 44ca0c4 (γ6 merged).
Commits since main, before this gate:
8d1912f γ7.5: decided suggestions wrap at phone width; e2e text match
61bdb93 γ7.3, γ7.4: Facebook and Pinterest, required regenerate note, Copy learns from edits, Generate all, Settings scope and origin, GBP labels
eaa68ef γ7.2: learn-1, candidates from every note and edit, scoped to a channel
64a4c15 γ7.1: channel sections outside the cached pack, migration 0006
b928b69 Record γ7 orientation approval
4521603 Add γ7 orientation report
8a9f90e γ7 handoff: learning loop, Facebook and Pinterest copy
Status: clean working tree before this gate was written.
```

`64a4c15` does not build on its own (its consumers change in `eaa68ef`); the branch is merged as a whole.

## LOC delta

Code and tests, excluding `docs/`, `pnpm-lock.yaml` and `drizzle/meta`: `54 files changed, 1782 insertions(+), 820 deletions(-)`. The orientation estimated about 2,350 lines. The net is lower because `rules-1`, `facts-1`, their two libraries, two tasks and two test files were replaced by one prompt, one library, one task and one test file.

## Test count

Vitest, on `8d1912f`:
```
 Test Files  40 passed (40)
      Tests  363 passed (363)
```
Playwright, on `8d1912f`:
```
  80 passed (2.5m)
```
Delta from γ6 (41 files, 345 tests; 78 Playwright):
- **Vitest:** +18 tests (345 to 363). Files 41 to 40: `rules.test.ts` and `facts.test.ts` were folded into the new `learn.test.ts`, which carries their cases (appendRule, targets, normalising, duplicates across clients, accept, move, dismiss) plus the new ones.
- **Playwright:** +2 tests (78 to 80): "Regenerate asks what was wrong; the note becomes a LinkedIn rule in Settings, scoped to LinkedIn" and "Facebook and Pinterest: Generate all, a pin's two fields with their own Copy, and the cover suggested". The GBP copy test gained the Copy-learns-from-edits assertions; the reject and regenerate tests now assert the candidate run; the phone-width test covers two more screens.

One Playwright run in this session failed on a test of mine (`getByText("By channel")` matched the new intro sentence as well); fixed with an exact match before the run above.

## Typecheck and lint

`pnpm typecheck` and `pnpm lint` exit 0, with no warnings. Playwright builds the app with `pnpm build` before every run, so the production build passed as well.

## Migrations

`drizzle/0006_learning.sql` (9 statements). It is safe for the live version:
- `derivatives_channel_check` is dropped and recreated with `facebook` and `pinterest`, in the same transaction;
- `derivatives.title`, nullable;
- `rule_candidates.scope`, NOT NULL with the default `'all'`, and its check;
- `rule_candidates.derivative_id`, nullable, referencing `derivatives`;
- `rule_candidates.review_event_id` loses NOT NULL (the live γ6 version always sets it);
- `rule_candidates_source_check`: exactly one of the two sources.

**Local:** applied to `bfm_test`, 7 migrations applied.

**Neon dev** (host checked first: `ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech`). Rehearsal, verbatim:
```
Driver: neon-serverless (WebSocket, port 443, one transaction)
Rehearsal: 9 statements from drizzle/0006_learning.sql, inside BEGIN ... ROLLBACK
Inside the transaction: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, derivatives, google_tokens, knowledge_versions, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, sessions, site_pages, users
Rolled back.
Public tables: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, derivatives, google_tokens, knowledge_versions, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, sessions, site_pages, users
Applied migrations: 6
```
Migration, verbatim:
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Migrator finished.
Public tables: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, derivatives, google_tokens, knowledge_versions, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, sessions, site_pages, users
Applied migrations: 7
  1 bc9dce5f5136 1792531354466
  2 58801d2dc19d 1792542524859
  3 9b771848e2a2 1792547861813
  4 019250fdfb17 1792588397103
  5 a8bd56f19ad4 1792607618124
  6 f20cc06f07cd 1792761166850
  7 5172477ca12c 1792765592866
```
Independent check, a separate script reading `information_schema` and `pg_constraint` on Neon dev, verbatim:
```
column: derivatives.title text nullable=YES default=null
column: rule_candidates.derivative_id uuid nullable=YES default=null
column: rule_candidates.review_event_id uuid nullable=YES default=null
column: rule_candidates.scope text nullable=NO default='all'::text
constraint: derivatives_channel_check CHECK ((channel = ANY (ARRAY['gmb'::text, 'linkedin'::text, 'facebook'::text, 'pinterest'::text])))
constraint: rule_candidates_derivative_id_derivatives_id_fk FOREIGN KEY (derivative_id) REFERENCES derivatives(id) ON DELETE RESTRICT
constraint: rule_candidates_scope_check CHECK ((scope = ANY (ARRAY['all'::text, 'blog'::text, 'gmb'::text, 'linkedin'::text, 'facebook'::text, 'pinterest'::text])))
constraint: rule_candidates_source_check CHECK (((review_event_id IS NULL) <> (derivative_id IS NULL)))
row counts: {"candidates":"1","scope_all":"1","from_review_events":"1","derivatives":"2"}
```
The one γ5 candidate already on Neon dev took `scope = 'all'` and keeps its review event.

**Production:** not run from this session. It runs in the Vercel production build of the merge, after a Neon backup branch, as in γ4 to γ6.

## Real runs on Neon dev

`trigger.dev dev` from this session (`Local worker ready on branch: default [node-24] -> 20261023.2`) with the dev-only WebSocket alias. Driven by `scripts/real-run.ts`, which calls the same functions as the server actions (`queueDerivative`, `startDerivative`, `startCandidates`, `acceptCandidate`). The post is the approved "Finance Bathroom Installs" (`9d47679d…`).

**As approved, Neon dev's derivative model was set to Opus 5.5** (`real-run.ts derivative-model claude-opus-5-5`, which calls `updateModelSettings`). It was Haiku 5.5. It is left on Opus 5.5 after the run.

Trigger.dev runs, verbatim:
```
○ Oct 23, 14:52:34.139 ->  20261023.2 | propose-candidates | run_06gmiftcah65u3kqp9vefahea2.1 | Success (9.4s)
○ Oct 23, 14:52:39.503 ->  20261023.2 | write-derivative | run_06gmiftben31ht64fsefffbqa2.1 | Success (15.3s)
○ Oct 23, 14:53:07.053 ->  20261023.2 | propose-candidates | run_06gmig216ij3p0d87aep465aa2.1 | Success (4.8s)
○ Oct 23, 14:53:15.591 ->  20261023.2 | write-derivative | run_06gmig20d6jvg47gn5dqd09da2.1 | Success (13.4s)
○ Oct 23, 14:53:57.046 ->  20261023.2 | propose-candidates | run_06gmig7ubat2er4qv11a10e9a2.1 | Success (6.4s)
○ Oct 23, 14:54:00.694 ->  20261023.2 | propose-candidates | run_06gmig8hqfsilfojvqpqm28ua2.1 | Success (4.7s)
○ Oct 23, 14:54:05.773 ->  20261023.2 | write-derivative | run_06gmig8gtkisk94mnoc025fha2.1 | Success (10.4s)
○ Oct 23, 14:54:06.739 ->  20261023.2 | write-derivative | run_06gmig7tfehbm4d5q5016o77a2.1 | Success (16.3s)
○ Oct 23, 14:54:35.709 ->  20261023.2 | write-derivative | run_06gmigcbf7br6bv4ikrl9aita2.1 | Success (8.7s)
○ Oct 23, 14:54:40.371 ->  20261023.2 | write-derivative | run_06gmigd0m48hbq9baj4rl34ja2.1 | Success (8.2s)
```
Calls from `ai_calls`, verbatim:
```
14:52:33 | rules | claude-opus-5-5 | medium | learn-1 | 1418 | 259 | 3245 | 0 | 0.027077 | 7103 | end_turn |
14:52:39 | derivative | claude-opus-5-5 | medium | derivative-2 | 3308 | 1364 | 2277 | 0 | 0.051897 | 13034 | end_turn |
14:53:06 | rules | claude-opus-5-5 | medium | learn-1 | 1522 | 11 | 0 | 3245 | 0.006957 | 2933 | end_turn |
14:53:15 | derivative | claude-opus-5-5 | medium | derivative-2 | 3277 | 1255 | 0 | 2277 | 0.038663 | 11367 | end_turn |
14:53:56 | rules | claude-opus-5-5 | medium | learn-1 | 1674 | 156 | 0 | 3245 | 0.010465 | 4444 | end_turn |
14:54:00 | rules | claude-opus-5-5 | medium | learn-1 | 1430 | 11 | 0 | 3245 | 0.006589 | 2868 | end_turn |
14:54:05 | derivative | claude-opus-5-5 | medium | derivative-2 | 3283 | 910 | 0 | 2277 | 0.031787 | 8689 | end_turn |
14:54:06 | derivative | claude-opus-5-5 | medium | derivative-2 | 3367 | 1511 | 0 | 2277 | 0.044143 | 14347 | end_turn |
14:54:35 | derivative | claude-opus-5-5 | medium | derivative-2 | 3272 | 669 | 0 | 2277 | 0.026923 | 6950 | end_turn |
14:54:39 | derivative | claude-opus-5-5 | medium | derivative-2 | 3284 | 557 | 0 | 2277 | 0.024731 | 6393 | end_turn |
```
(time, purpose, served model, effort, prompt version, input, output, cache write, cache read, cost USD, ms, stop reason)

### 1. The learning loop (handoff item 6)

1. **A standing note on LinkedIn.** LinkedIn regenerated (version 2) with the note "On LinkedIn, keep it to three short paragraphs at most, and always end with a direct question to the reader just before the link, to invite comments." The candidate run proposed two rules, both scoped to LinkedIn and shown "From your note on the LinkedIn post for "Finance Bathroom Installs"":
   - "Keep LinkedIn posts to three short paragraphs at most." (left proposed on Neon dev);
   - "End every LinkedIn post with a direct question to the reader, placed just before the link, to invite comments." Reason given: "Amir said always, and inviting comments suits LinkedIn posts on any topic."
2. **A one-off note proposes nothing.** LinkedIn regenerated (version 3) with "Lead with the FCA register point for this one." The candidate call returned 11 output tokens and no candidate. Version 3 leads with the FCA register, as asked.
3. **Accepted** the question rule through `acceptCandidate` with scope LinkedIn: "Accepted into agency, version 3". It went to `writing_rules_linkedin`; Writing rules for every channel is unchanged.
4. **What each call is sent.** `real-run.ts instructions` builds the instructions block with the same functions the task uses. LinkedIn's ends with:
   ```
   ## Rules for LinkedIn posts only (apply on top of the knowledge pack, never broken)

   ### BrandFactory rules: LinkedIn post rules

   - End every LinkedIn post with a direct question to the reader, placed just before the link, to invite comments.
   ```
   GBP's ends with the shared instructions' last line ("Reply with the post's text only, …"), with no channel block.
5. **The next generation follows it, the other channel does not get it.** LinkedIn (version 4) and GBP (version 2) were regenerated with the same note, which says nothing about questions: "Mention the itemised quote in the first two sentences."
   - LinkedIn version 4 ends: "Our full guide covers each option in detail. Which funding route are you weighing up for your bathroom?" then the link. Version 3, written before the rule was accepted, has no question.
   - GBP version 2 ends: "Read our full guide to financing a bathroom renovation in London and Essex." No question.
   - Both open with the itemised quote, as the note asked.
6. **What the run also showed:**
   - LinkedIn version 2 did not keep to "three short paragraphs at most" from its own note (it has four body paragraphs). A note is used for that version, but the model followed it in part. The rule stays proposed for Amir to accept or dismiss.
   - The neutral note's LinkedIn candidate call returned 156 output tokens but stored no candidate. Either the model proposed something the duplicate check or the place check dropped, or it was the approve-era CTA rule again. The reply text is not stored, so which one cannot be told (backlog 24).
   - All six derivative calls after the first read the same 2,277-token cache, across LinkedIn, GBP, Facebook and Pinterest. Channel rules outside the pack keep one shared prefix (orientation Q1).

### 2. One Facebook and one Pinterest generation (handoff item 7)

- **Facebook** (`derivative-2`, $0.026923): 702 characters, checks passed with no fix round. Opens "Before you borrow for a bathroom, get a firm, itemised figure.", ends "Read our full guide to financing a bathroom renovation:" then the link on its own line. No hashtags.
- **Pinterest** (`derivative-2`, $0.024731): the reply split into both fields at the first attempt, checks passed with no fix round.
  - Title (57 characters): "How to finance a bathroom renovation in London and Essex"
  - Description (420 characters): "A guide for London and Essex homeowners weighing up savings, remortgaging, personal loans, 0% credit cards and showroom finance to pay for a new bathroom. …"
  - No link, no hashtags.

**γ7 real spend:** $0.269232 ($0.051088 for four `learn-1` calls, $0.218144 for six derivatives). With γ4 to γ6's $1.926034, that is $2.195266 recorded against the $25 key.

## Consumer audit (D.3.3)

- **Channel vocabulary (`CHANNELS` in `src/config/knowledge.ts`, `DERIVATIVE_CHANNELS` and `CHANNELS` in `derivative-checks.ts`):** one list now names every channel. Consumers: `DerivativePanel`, `DerivativesCard`, `derivativeViews`, `queueMissingDerivatives`, the cost table (`drafts.ts`), the candidate origin line and the Applies to choice (`rules.ts`, Settings), `learn-1`, `real-run.ts`. A grep for "GMB" across `src/` and `e2e/` finds only the code key `gmb`, the type names and the history in comments; every label the UI shows reads "GBP post". The CRM package line and the AI models help text were updated by hand.
- **Knowledge sections (10 new channel sections):** `normaliseSections` stores a channel section only once it holds text, so existing versions keep their shape (Vitest). `buildPack` reads only the shared sections; the pack for today's knowledge is byte-identical to main's, checked against `pack.golden.txt` built by main's own code (Vitest). The editor groups them under "By channel"; the read-only old-version view lists them like any section. The banned-phrase check still reads `banned_phrases` only.
- **`rule_candidates.review_event_id` now nullable, `derivative_id` and `scope` added:** `listCandidates` (origin and channel from either source), `candidatesForPost` (the post page's count, unchanged), `candidate-keys.ts` (joins on the post, unchanged), the Settings page, both test resets (candidates now deleted before derivatives).
- **`rejectPost` returns the event id; `saveDerivativeEdit` returns `{ checks, derivativeId, saved }`:** consumers are the post page actions and the tests; nothing else called them.
- **Tasks:** `propose-rules` and `propose-facts` are removed, `propose-candidates` replaces both. Consumers: `jobs.ts`, the post page actions, `real-run.ts`, `e2e/review.spec.ts`. Runs already started stay on the deployment that started them.
- **Prompt versions:** `spec-2`, `writer-3`, `critic-4`, `derivative-2`, `learn-1`. The first three change only when a blog channel section holds text.
- **Bug found and fixed on the way:** the knowledge editor kept its first text after a version was saved elsewhere on the page (an accepted rule did not show in the open editor until reload). It now takes the new version unless Amir is editing.

## What was verified vs code-inspection only

**Verified (how):**
- The loop end to end with real Opus calls on Neon dev: note, scoped candidate, accept, followed on LinkedIn, absent on GBP, and a one-off note proposing nothing (real runs above, rows read back from Neon dev).
- Real Facebook and Pinterest copy, checks and cost (real runs above).
- The pack unchanged byte for byte, channel blocks per role, every candidate source, the small-edit filter, scope on accept, duplicates across sources, required note, Generate all, Copy saving first, pin parsing (Vitest).
- The screens, by looking at the Playwright screenshots at desktop and 390px: the note question (`g7-derivative-note`), the scoped candidate card with its LinkedIn badge and Applies to (`g7-scoped-candidate`), the By channel sections (`g7-channel-rules`), Facebook and Pinterest panels with the cover and Generate all (`g7-facebook-pinterest`), and both phone screens (`g7-mobile-derivatives`, `g7-mobile-candidates`). Looking at the 390px Settings screen found the "Added to …" badge clipped; it now wraps, re-checked in the screenshot. Nothing scrolls sideways at 390px (Playwright).

**Code-inspection only (needs smoke):**
- **`propose-candidates` in Trigger.dev Production:** it deploys with the merge and needs only `DATABASE_URL` and the Anthropic key, like the γ6 tasks. Production workers use node-postgres, not the dev alias.
- **The copy-then-learn path in a real browser on your phone:** Playwright ran it in Chromium with clipboard permission. The text goes on the clipboard before the save, so Safari's user-gesture rule should hold; the smoke checks it.
- **The Pinterest cover thumbnail with a real Google token:** this session has none; the stand-in served it.
- **Facebook's limits:** from third-party counts only (orientation Q5); the 2,000 cap is our own.

## Deliberately unchanged / out of scope

- Posting to any platform, scheduling, Instagram, Copy as HTML and Download Markdown (backlog 22).
- The code key `gmb` (only the label changed, as approved).
- The proposed rule "Keep LinkedIn posts to three short paragraphs at most." and the γ5 CTA rule are left proposed on Neon dev.

## Backlog

- **Closed 23:** the heading is now "Suggestions from your notes and edits".
- **Added 24:** store the candidate call's reply (or the candidates it dropped and why), so a run that returns text but stores nothing can be explained. Seen once in the real run.
- **Added 25:** check Facebook's post limit and "See more" fold against a Meta source or a live Page post; the app uses its own 2,000 cap.

## Smoke instructions for Amir

After the merge deploys (the migration runs in the Vercel build, after a Neon backup branch):

1. **Settings, AI models:** check the Derivatives model is the one you want (help text now names all four channels).
2. **Settings, BrandFactory rules:** the editor lists Writing rules, Banned phrases, then "By channel" with Blog post, GBP post, LinkedIn post, Facebook post and Pinterest pin rules, all Empty. The candidates heading reads "Suggestions from your notes and edits". Report back if any existing rule text has moved.
3. **On "Wet room maintenance week by week", LinkedIn post:** press Regenerate. The note box asks "What was wrong with this version?" and Regenerate LinkedIn post stays disabled until you type. Enter a standing point, for example "Always end with a question to the reader before the link."
4. **Within a minute, Settings:** a suggestion with a "LinkedIn post" badge, "From your note on the LinkedIn post for "Wet room maintenance week by week"", and Applies to set to LinkedIn posts. Accept it. It shows "Added to BrandFactory rules: LinkedIn post rules", and LinkedIn post rules in the editor holds it.
5. **Back on the post:** regenerate LinkedIn again with a note that says nothing about questions. The new version follows the rule. Report back if it does not.
6. **GBP post:** regenerate it with a note too. The rule must not appear in it (no closing question).
7. **A blog post in review:** reject or regenerate it with a note. Within a minute a suggestion appears in Settings, "From your reject note on …" or "From your regenerate note on …". Report back if nothing appears after two minutes and the note held a reusable point.
8. **Facebook and Pinterest for the wet room post:** press "Generate remaining channels" (or Generate Facebook post and Generate Pinterest pin). Facebook ends with the post's link. Pinterest shows a pin title and a description with their own Copy buttons, the destination link, and the cover as the suggested image. Copy each and paste into a note to check.
9. **Optional:** edit a derivative by a sentence and press Copy. A suggestion from your edit may appear in Settings; a one-word fix should not create one.

## What the next checkpoint picks up

Phase 2 (knowledge base and planner) per the scope, plus backlog 24 and 25.

---

**PR opened and merged per CLAUDE.md; production smoke list above.**
