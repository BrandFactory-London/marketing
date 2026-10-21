# Orientation: Phase 1, checkpoint γ5 (review, approval and covers)

21 Oct 2026. Written from the template in `docs/templates/orientation-report.md`. No code has been written.

Read in full:
- `docs/handoff-cp5.md` (this branch's first commit, `ecfcb23`, identical to `f9e3257` on `docs/handoff-cp5`);
- `CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 11, 16, 17 and 18 closely), `docs/scope.md`, `docs/backlog.md`, `docs/gate-cp4.md`;
- `src/prompts/` (shared, writer, critic), `src/lib/checks.ts`, `src/config/post-status.ts`, `src/config/knowledge.ts`, `src/lib/ai/pack.ts`, `src/lib/drafts.ts`, `src/lib/drive.ts`, `src/lib/drive-folder.ts`;
- the γ4 tables in `src/db/schema.ts` (posts, post_drafts, critic_verdicts, ai_calls);
- the `<main>` markup of `Review.dc.html` and `Post.dc.html`, and the rule candidate section and its data in `Settings.dc.html`.

Skimmed: `src/lib/generation.ts` (the run loop), `src/lib/knowledge.ts` (function list only) and the existing routes under `src/app/(app)/posts`, `review` and `settings`.

**Not read: the production smoke post's record.** This session has no production database access, and should not have it. Fixes 1 to 3 below are designed from the handoff's description and the γ4 real run on Neon dev, which showed the same placeholder and length patterns. Question 1 in section 6 asks for the post's text.

Claude API facts (prices, caching) come from the Claude API reference bundled with this session, with prices cached on 6 Oct 2026.

## 1. Branch state

```
$ git branch --show-current
claude/gamma4-cost-cache-validation-jpq1pb
$ git log --oneline -3
ecfcb23 Add γ5 handoff
33874e1 Merge pull request #6 from BrandFactory-London/claude/gamma4-cost-cache-validation-jpq1pb
1f5d0c4 γ4 gate: smoke step 1 passed; backlog 20, tasks deployed twice per push
$ git status
nothing to commit, working tree clean
```

- **Base:** the branch was restarted from `origin/main` (`33874e1`, γ4 and its gate updates), with the handoff as its first commit.
- **Branch name:** it still carries the γ4 name. This session is set to push to that branch, so the γ5 PR will come from it. The PR will be titled "γ5 review, approval and covers".

## 2. Files in scope

**Dependencies (γ5.2, γ5.4).** Versions pinned exactly, each the newest release at least a week old.
- **CodeMirror 6** for the body editor: `@codemirror/state`, `view`, `commands` and `lang-markdown`, wrapped in our own small React component rather than a wrapper library (Q1).
- **`diff`** (jsdiff), for the saved edit diff.
- `react-markdown` is already installed, for the preview.

**Schema and migration (γ5.1):** `src/db/schema.ts` and `drizzle/0004_review.sql` (Q7).

**Prompts and checks (γ5.1)**
- `src/prompts/writer.ts` (`writer-2`): the target length, Examples as style only, the placeholder format, and a regenerate message.
- `src/prompts/critic.ts` (`critic-2`): placeholders listed for Amir, Examples copying, title honesty.
- `src/prompts/rules.ts` (new, `rules-1`): rule candidates (Q5).
- `src/lib/checks.ts`: an `examples` check (Q3), length tolerance (fix 3) and placeholder positions (Q2).

**Domain modules**
- `src/lib/review.ts` (new, γ5.2): versions, save, approve, reject, the approval gate and the publishing details.
- `src/lib/generation.ts` and `src/lib/batches.ts` (γ5.3): a regenerate generation that starts from a given text with a note.
- `src/lib/rules.ts` (new, γ5.4): the diff, candidates, and accept or dismiss.
- `src/lib/drive.ts` (γ5.5): listing a folder's children with paging, file metadata and parent checks, and thumbnails.
- `src/lib/drafts.ts`: the post's current version, and costs grouped by run.

**Trigger.dev (γ5.3, γ5.4)**
- `src/trigger/generate-post.ts` is unchanged in shape: a regenerate is just another generation.
- `src/trigger/propose-rules.ts` (new).
- `src/lib/jobs.ts` gains `startRuleCandidates`.

**Screens**
- **Post page** (`posts/[postId]`, γ5.2): becomes the review editor of the prototype's `Post.dc.html`. Title, excerpt, body editor and preview, critic notes, scripted checks, cover, publishing details, and the three actions.
- **Review queue** (`review`, γ5.2): placeholder count per row, and the prototype's filter chips.
- **Settings, BrandFactory rules** (γ5.4): "Rule candidates from your edits", as the prototype places it.
- **Cover picker** (γ5.5): on the post page, with an app route `api/drive/thumbnail/[fileId]`.
- A progress route for one post, `api/posts/[postId]/progress` (γ5.3), for regenerate runs.

**Tests**
- **Vitest:**
  - the new checks, against the model-test drafts and Examples fixtures;
  - prompt assembly;
  - versions, the approval gate and the slug rules;
  - the regenerate run with the fake Anthropic transport;
  - the diff and candidate accept, which writes a knowledge version;
  - Drive paging and the parent check, against a fake `fetch`.
- **Playwright:** the editor, the approval block, reject, regenerate, candidate triage and the cover picker. These run against the existing Trigger.dev stand-in and a new Google API stand-in (Q6), at desktop and 390px phone width.

## 3. Open questions

- **Q1, editor.** Proposal:
  - **Editor:** CodeMirror 6 for the body, with Markdown highlighting and line wrapping, inside the prototype's article card. Title and excerpt stay plain fields, as in `Post.dc.html`, and the excerpt shows its character count against 160. CodeMirror is chosen over a textarea because it can mark text inside the editor: placeholders get a warning tint and critic quotes an underline. A textarea cannot.
  - **Preview:** the same `react-markdown` rendering as γ4's draft view, with raw HTML off and placeholders highlighted.
    - Where the card is at least about 960px wide, editor and preview sit side by side, as decision 17 says.
    - Narrower, including phones, there are Edit and Preview tabs.
    - The prototype shows a single editable column; decision 17's preview is added inside the same card.
  - **Anchoring critic issues:** the critic quotes the draft exactly, so each issue is found by searching for its quote in the current text, not by a stored line number.
    - Found: the issue in the side panel scrolls to and selects that text.
    - Not found, because Amir has since changed it: the issue moves to a greyed group, "Changed since the critic read it".
    - Nothing is lost when lines move.
  - **Live checks:** `runChecks` is a pure module, so the page runs it in the browser as Amir types (debounced). Word count, dashes, banned phrases, links, the Examples check and the placeholder count update live. The server runs the same checks again on every save and on Approve.
  - **Saving:**
    - "Save draft" creates a new version. The writer's drafts are never changed.
    - There is no autosave of versions, so the history doesn't fill with half-edits.
    - Unsaved text is kept in the browser's local storage, and leaving the page with unsaved changes asks first.
    - Approve and Regenerate save first when there are changes.
  - Needs confirmation.

- **Q2, placeholder rule.** Proposal:
  - **What counts:** any text in square brackets that is not part of a Markdown link (`[text](url)`), in the title, excerpt or body. That includes `[CONFIRM: ...]` and `[Migss bathroom price range]`. It is the regex the γ4 checks already report under `info.placeholders`, extended to the title and excerpt and recording positions.
  - **Writer:** told to write any missing fact as `[CONFIRM: what is needed]`. Detection does not depend on that form, so older drafts and other bracket styles are still caught.
  - **Scripted checks:** placeholders are **not** a check failure. Sending them back to the writer would push it to invent the fact, which decision 12 forbids. They are reported with their positions.
  - **Critic:** the "placeholders are correct, not an issue" line goes. Its reply gains a `placeholders` list: each quote with what Amir needs to supply, for example "the price range Migss quotes for a family bathroom".
    - A placeholder does not fail the draft, since the writer cannot fix it.
    - The post then shows "Needs your input" rather than a plain pass.
  - **What Amir sees:**
    - In the queue, a "3 to fill" badge on the row.
    - On the post, each placeholder highlighted in the editor and the preview, and listed in the side panel with the critic's ask. Clicking one jumps to it.
    - Approve post is disabled, with "Fill in 3 placeholders to approve" under it.
    - The server's approve action refuses as well, so the block holds even if the page is stale.
  - **New display line:** "Needs your input" (warning) joins `src/config/post-status.ts`, so the drift test covers it. It is not a status.
  - Needs confirmation.

- **Q3, verbatim check.** Proposal:
  - **Source text:** the client's Examples and Counter-examples sections. Copying a counter-example is worse than copying an example.
  - **Splitting:** each is split into sentences on full stops, question marks, exclamation marks and line breaks.
  - **Normalising:** lower case, curly quotes and apostrophes made straight, punctuation removed, spaces collapsed.
  - **What fails:** a draft sentence fails the `examples` check when either:
    - it equals an Examples sentence of 6 words or more after normalising; or
    - it shares a run of **8 consecutive words** with any Examples sentence.
  - **Why 8 words:** common phrases such as "get in touch with us today" (6 words) never trip it, while a reused sentence or clause does. A test proves no false positives on all six model-test drafts against the model-test pack's examples.
  - **Close paraphrase** is left to the critic: the writer and critic prompts say Examples guide voice only and are never to be reused or closely paraphrased. The critic reports it under "voice" as blocking.
  - **Effect:** it is a scripted check, so a hit sends the draft back to the writer without paying for the critic. The same check runs live on Amir's edits.
  - Needs confirmation of the 8-word and 6-word thresholds.

- **Fix 3, length.** Proposal:
  - The writer is told to aim for the middle of the range ("about 1,400 words for 1,200 to 1,600").
  - The scripted check allows **5%** either side: 1,140 to 1,680 for that range.
    - A draft inside the tolerance passes, with a note ("1,650 words, 50 over the range") shown to the critic and to Amir.
    - Beyond it, the draft goes back to the writer as now.
  - With both, the γ4 run's 1,742 and 1,749-word first drafts would still have gone back. Aiming at the middle is the main fix; the tolerance stops paying a writer round (about $0.13 to $0.20) for 30 words.
  - Needs confirmation of the 5%.

- **Fix 4, title honesty.** Add it to the critic's blocking list, under "structure": the title promises a structure or content the body does not deliver, such as a number of steps or items, a week-by-week or step-by-step order, a comparison, or a price. It is cheap to state, and the smoke showed the critic already notices it but treats it as minor.

- **Q4, regenerate with a note.** Proposal:
  - **Starting text:** the post's current version, so Amir's saved edits are kept. Regenerate saves any unsaved edits first, so nothing typed is lost.
  - **Writer instructions:** the first writer call gets the spec, Amir's note and that text, with the instruction "apply the note, keep everything else, including Amir's edits, unless the note says otherwise".
  - **Rounds:** it is a new generation row (as a retry already is) with the note and the starting version, so it gets the same loop: checks, critic, up to two fix rounds, then Needs review or Failed.
  - **Cost:**
    - Like a fresh post: about $0.15 to $0.70 on Opus 5.5, depending on fix rounds.
    - The post's cost breakdown groups calls by run ("First draft", "Regenerate 1: tighten the FAQ"), with a total per run.
    - The note is required, so it is clear what each run was for.
  - **While it runs:**
    - The post shows Writing or Checking, polled every 3 seconds as the Generating screen does.
    - The editor is read-only until it finishes.
  - **Allowed from:** Needs review, Failed and Rejected (a rejected post can come back this way).
  - Needs confirmation.

- **Q5, rule candidates.** Proposal:
  - **When:** on Approve, the app diffs the writer's last version (the newest draft of the newest run) against the approved version.
    - It uses jsdiff at sentence level, so a changed sentence shows as "before" and "after".
    - The diff is saved on the approve event.
    - If nothing changed, there are no candidates and no call.
  - **Where the call runs:** in a Trigger.dev task (`propose-rules`), like every model call (γ4 Q1). It is started after the approval is saved, so a failure never blocks the approval.
  - **Prompt:**
    - The cached pack, so the model sees the current rules and does not repeat one.
    - Instructions: propose only rules that would improve other posts; never propose from typo or one-off fixes.
    - User message: the diff hunks, plus the post's regenerate and reject notes as context.
    - Facts Amir supplied by filling a placeholder become fact candidates (client business facts or project facts), which is likely the most useful output.
  - **Shape** (structured output), up to 5 per post and possibly none:
    - tier;
    - section, one of: BrandFactory writing rules or banned phrases; client business facts, voice or counter-examples; project facts or call to action;
    - the rule as one sentence (or, for banned phrases, the phrase);
    - the before and after text it came from;
    - a one-line reason.
  - **Model:** the writer model from Settings (Opus 5.5) at effort medium. About $0.03 to $0.10 per approved post at $4 and $20 per million tokens. Recorded in `ai_calls` with a new purpose, `rules`.
  - **Triage** in Settings, BrandFactory rules, "Rule candidates from your edits", as in the prototype:
    - Each candidate shows its text, "From your edit to <post title>", and the before and after.
    - Amir can edit the text, change tier and section with a select, then Accept rule or Dismiss.
  - **Accepting:**
    - It appends the rule as a new list item (`- rule`) at the end of that section of the tier's current version, and saves a new version through the existing `saveKnowledge`.
    - Every other section and every existing line is untouched. The list-item form is what `parseBannedPhrases` already reads.
    - The candidate records the version it created.
  - Needs confirmation, including the model.

- **Q6, Drive browsing.** Proposal:
  - **Browsing:**
    - One folder level at a time, starting at the project's Drive folder, with a breadcrumb ("Migss Interiors / Bathrooms").
    - Any depth; subfolders are listed first, then images (`image/*`). Other files are hidden.
    - Pages of 60, with "Show more photos" using Drive's `nextPageToken`.
    - The existing `drive.readonly` scope covers all of this.
  - **Thumbnails, proxied through the app:**
    - The files are private, and Drive's `thumbnailLink` is short-lived and not guaranteed to load in the browser without the account's credentials.
    - `api/drive/thumbnail/[fileId]` checks the session, then:
      - reads the file's metadata with the stored Google token;
      - confirms it sits under the project's folder, walking parents up to 6 levels;
      - fetches the thumbnail at 320px (1,200px for the chosen cover's preview);
      - streams it back with a private, one-hour cache header.
    - A file outside the folder gets a 404.
  - **Recorded on the post:** the Drive file ID, its name, its folder path, and when it was chosen. Downloading and uploading it to Wix is γ6.
  - **Playwright:** `src/lib/drive.ts` and the token refresh read a `GOOGLE_API_URL` override, set only by Playwright, pointing at a small local Google stand-in. This is the same pattern as `TRIGGER_API_URL` in γ4.
  - **Limit:** this session has no Google token, so real Drive browsing is first seen in the production smoke.
  - Needs confirmation.

- **Q7, tables.** One migration, `0004_review`. It only adds tables, nullable columns and an index, and replaces one check constraint with a wider one. So the live γ4 version keeps working while γ5 builds (CLAUDE.md).
  - **`posts` gains:**
    - `slug`, with a unique index on project and slug where it is set;
    - `cover_drive_file_id`, `cover_name`, `cover_path`, `cover_chosen_at`;
    - `approved_at`.
  - **`post_versions`** (Amir's saved edits):
    - id, post, the generation it edits;
    - version number per post;
    - title, excerpt, Markdown body, word count, check results;
    - `created_at`.

    The writer's drafts stay in `post_drafts`, untouched. The current version is the newest of "latest writer draft" and "latest saved edit".
  - **`post_generations` gains:** `note` and `base_version_id` (regenerate's note and starting text), both nullable.
  - **`review_events`:** id, post, action (approve, reject or regenerate), note, the version acted on, the writer draft compared, the diff, `created_at`.
  - **`rule_candidates`:**
    - id, review event, post, tier, section, text, before, after, reason;
    - status (proposed, accepted or dismissed);
    - the knowledge version an accept created;
    - the AI call, `created_at`, `decided_at`.
  - **`ai_calls` purpose check:** gains `rules`. The constraint is dropped and recreated with the wider list in the same transaction.
  - **Slugs:** `[a-z0-9]+(-[a-z0-9]+)*`, at most 80 characters. Prefilled from the title the first time the post is opened. Unique among the project's posts, and not already a page in the project's sitemap (`/blog/<slug>`).
  - **No new statuses.**
    - Approve moves the post to `approved`, Reject to `rejected` (with its note), Regenerate to `generating`.
    - Approve is allowed from Needs review and Failed. It is blocked by placeholders only. Other check failures Amir leaves in, such as an em dash he typed, are shown as warnings and recorded on the approve event.
  - Needs confirmation.

- **Q8, backlog 18 and 20.**
  - **18, sharing the cache across roles. Lean: close it, no change.**
    - The γ4 run measured three different cached prefix sizes over the same pack: spec 3,108, writer 2,277, critic 3,092. Spec and critic use structured output; spec also uses a different effort.
    - The reference says effort changes can invalidate the system cache on some models, and does not say where a structured-output schema is placed. So the per-role split is measured, and its cause is likely but not proven.
    - Sharing would mean dropping structured output or using one effort for every role, which costs more than the about $0.06 per two posts it would save.
  - **20, tasks built twice. Amir's setting.**
    - Keep the Vercel-linked deploy, because Vercel waits for it and runs are pinned to its commit.
    - Turn off the GitHub connection's own deploy on push if Trigger.dev offers that, but keep the connection: the Vercel integration needs it.
    - The γ5 gate counts the Trigger.dev deploys of the merge commit to confirm.

Smaller decisions I will take unless you object:
- **Approved posts:** text locked; cover, slug and pillar still editable until γ6 publishes. Moving an approved post back to review goes to the backlog unless you want it in γ5.
- **Cover at approval:** not required. The post shows "No cover yet", and γ6's publish will require one.
- **Reject:** asks for a note (required) and keeps the drafts. The slot shows Rejected on the calendar, as γ3 already styles it.
- **Not built:** the prototype's "Internal links, Optimise links" panel is Phase 2 and is left out.
- **Review queue filters:** the prototype's filter chips: All, Needs review, Failed, Needs your input.

## 4. Checkpoint structure

γ5 is one checkpoint with one gate, in six internal stages.

| Stage | Focus | Files | Risk |
|---|---|---|---|
| γ5.1 | Smoke fixes: writer-2, critic-2, Examples check, length tolerance, placeholder positions. Migration `0004` (local, then Neon dev: host check, rehearsal, migration, independent check) | `src/prompts/*`, `lib/checks.ts`, `db/schema.ts`, `drizzle/0004_*` | Low to medium. Threshold tuning for the Examples check. |
| γ5.2 | Review editor: versions, live checks, placeholder highlighting and the approval block, issue anchoring, approve and reject, slug and pillar, queue badges | `posts/[postId]/*`, `review/*`, `lib/review.ts`, `lib/drafts.ts`, `config/post-status.ts` | Medium to high. First rich editor; phone layout. |
| γ5.3 | Regenerate with a note: generation from a given text, progress on the post page, costs by run | `lib/generation.ts`, `lib/batches.ts`, `prompts/writer.ts`, `api/posts/[postId]/progress` | Medium. Reuses the γ4 loop. |
| γ5.4 | Rule candidates: diff on approve, `propose-rules` task, Settings triage, accept writes a new version | `lib/rules.ts`, `prompts/rules.ts`, `trigger/propose-rules.ts`, `settings/rules/*` | Medium. Appending to a tier without disturbing it. |
| γ5.5 | Drive cover picker: folder listing with paging, subfolders, thumbnail proxy and parent check, Google stand-in for Playwright | `lib/drive.ts`, `api/drive/thumbnail/*`, the picker component | Medium. Only the smoke proves real Drive. |
| γ5.6 | Real runs on Neon dev: one regenerate with a note and one rule-candidate run, with costs; phone-width screenshots; gate | `docs/*` | Low. Within the $25 key. |

The real runs use `trigger.dev dev` with the WebSocket alias and `scripts/real-run.ts`, extended with `regenerate` and `approve` commands. Estimated spend is about $1 to $2.

## 5. Estimated LOC and test deltas

Hand-written code and tests, excluding the lockfile and generated migration files.

| Stage | LOC (est.) | New tests (est.) |
|---|---|---|
| γ5.1 | 600 | 25 Vitest (Examples check including no false positives on the six drafts, tolerance, placeholder positions, prompt assembly, critic schema) |
| γ5.2 | 1,200 | 15 Vitest (versions, gate, slugs), 10 Playwright |
| γ5.3 | 450 | 8 Vitest (regenerate path, resume, costs by run), 3 Playwright |
| γ5.4 | 800 | 12 Vitest (diff, candidate shape, accept appends and versions, dismiss), 4 Playwright |
| γ5.5 | 650 | 10 Vitest (paging, parent check, thumbnail route), 3 Playwright |
| γ5.6 | 250 | phone-width additions; the real runs are recorded in the gate |
| **Total** | **about 3,950** | **about 70 Vitest, about 20 Playwright** |

Estimates only. The gate cites the runner's own summary lines (D.1.2).

## 6. Ambiguities to resolve before starting

1. **The smoke post's text.** Paste the production smoke post ("Wet room maintenance week by week") into the chat: its Markdown and critic notes, or at least the sentences copied from Examples and the `[CONFIRM: ...]` lines. It becomes a test fixture for Q2 and Q3. Without it, the fixtures come from the γ4 Neon dev drafts and the model-test pack.
2. **Answers or amendments for Q1 to Q8**, especially:
   - **Q2:** that placeholders never fail the writer loop and only block Approve;
   - **Q3:** the 8-word and 6-word thresholds;
   - **fix 3:** the 5% tolerance;
   - **Q5:** the candidate model and the list of sections a candidate may target;
   - **Q7:** that only placeholders block Approve.
3. **The two small calls:** the cover is not required at approval, and approved posts lock their text.

Nothing runs against Neon dev or the Anthropic API until this is approved.

---

**Stopping here. No code until you approve.**

## Approval (Amir, 21 Oct 2026)

Approved, with these answers:
- Copied-Examples check at 8 and 6 words, the 5% length tolerance, and Opus 5.5 for rule candidates: approved.
- **Approve is blocked by placeholders and by em dashes or banned phrases**, because Amir's own edits could reintroduce them. Every other check failure is a warning.
- A cover is not required to approve.
- Approved posts lock their text, and the post gains **"Reopen for editing"**, available only before publishing. It moves the post back to Needs review, so Amir can fix things without regenerating.
- Backlog 18: closed. Backlog 20: Amir changes the Trigger.dev setting himself.

**Test cases from the production smoke post** ("Wet room maintenance week by week", critic passed in round 2):
- Placeholders that passed:
  - "[CONFIRM: Migss wet room specialism wording] We use our own tradespeople [CONFIRM], and specialist oversight is included in every Migss quote."
  - "Every installation carries a 10-year labour guarantee [CONFIRM]."
- Sentences copied from the client Examples:
  - "This is why who builds a wet room matters more than which drain or tile you choose."
  - "Rushing or skipping a stage hides problems behind finished tiles."
  - "In a shower enclosure, a failed silicone joint is the most common cause of small leaks around the tray, and it is cheap to fix if caught early." This closely paraphrases the Example "A failed silicone joint is the most common cause of small leaks around trays, and it is cheap to fix if caught early."
- Round 1 failed on length: 1,756 words against a 1,200 to 1,600 spec.
- Critic issues it rated minor:
  - the title promised a "week by week" structure the post did not follow;
  - a sales paragraph inside the technical tanking section;
  - an FAQ answer that left out plumbing leaks.
