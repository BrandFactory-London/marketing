# Verification gate: Phase 1, checkpoint γ6 (publish to Wix and derivatives)

Status: **complete.** Every check passes and the real runs are recorded below. Per CLAUDE.md the PR is opened and merged, and the production smoke list is at the end.

## Git state

```
Branch: claude/confident-clarke-b0js94 (pushed). Started from main f79f4dd (γ5 live in production).
Commits since main:
e006b0f γ6.7: real-run commands for derivatives and facts; status words for derivatives; e2e fixes after the Drive proof removal
f82b13f γ6.6: fact suggestions from regenerate notes, duplicate check for pending candidates, Drive proof page removed
9710e52 γ6.5: GMB and LinkedIn copy with platform checks, versions and copy buttons
f69b7f2 γ6.3 and γ6.4: publish to Wix step by step, the live check, and Published surfaces
53d3993 γ6.2: Markdown to Wix rich content, refusing what the Migss blog cannot show
13dd48f γ6.1: Wix client, encrypted credentials, author member, connection check, migration 0005
d38b0c7 Record γ6 orientation approval
2c1144f Add γ6 orientation report
c4fe288 Add γ6 handoff
Status: clean before this gate commit.
```

## LOC delta

Excluding `pnpm-lock.yaml` and `drizzle/meta`, before this gate: `70 files changed, 4960 insertions(+), 164 deletions(-)`. That figure includes the orientation report and the handoff (about 450 lines). The orientation estimated about 3,700 lines of code and tests. The rest of the difference is mostly tests and the two fakes (the Vitest fake Wix and the Playwright Wix stand-in).

## Test count

Vitest:
```
 Test Files  41 passed (41)
      Tests  345 passed (345)
```
Playwright:
```
  78 passed (2.5m)
```
Delta from γ5:
- **Vitest:** +6 files and +79 tests (266 to 345).
- **Playwright:** +3 tests (75 to 78): +6 in the new `publish.spec.ts`, and −3 from removing `drive-check.spec.ts` with the Drive proof page.
- `review.spec.ts` also gained assertions: the facts task starts beside a regenerate, and a fact is triaged in Settings.

All four runs above are on `e006b0f`.

## Typecheck, lint and build

`pnpm typecheck` and `pnpm lint` exit 0, with no warnings. Playwright builds the app with `pnpm build` before every run, so the production build passed as well.

## Migrations

`drizzle/0005_publish.sql` (16 statements). It is safe for the live version:
- it adds four tables: `project_wix`, `post_publications`, `publish_events` and `derivatives`;
- it adds two nullable columns to `posts` (`published_at`, `live_url`);
- it adds `rule_candidates.kind`, NOT NULL with the default `'rule'`, so the live γ5 version's inserts still work;
- it replaces `ai_calls_purpose_check` with a wider list that adds `derivative` and `facts`, in the same transaction.

**Local:** applied to `bfm_test`, 6 migrations applied.

**Neon dev** (host check `ep-square-mode-zatw6e39`). Rehearsal, verbatim:
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Rehearsal: 16 statements from drizzle/0005_publish.sql, inside BEGIN ... ROLLBACK
Inside the transaction: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, derivatives, google_tokens, knowledge_versions, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, sessions, site_pages, users
Rolled back.
Public tables: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, google_tokens, knowledge_versions, post_drafts, post_generations, post_specs, post_versions, posts, project_pillars, projects, review_events, rule_candidates, sessions, site_pages, users
Applied migrations: 5
```
Migration, verbatim:
```
Target: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech/neondb
Driver: neon-serverless (WebSocket, port 443, one transaction)
Migrator finished.
Public tables: accounts, ai_calls, app_settings, batches, clients, critic_verdicts, derivatives, google_tokens, knowledge_versions, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, sessions, site_pages, users
Applied migrations: 6
  1 bc9dce5f5136 1792531354466
  2 58801d2dc19d 1792542524859
  3 9b771848e2a2 1792547861813
  4 019250fdfb17 1792588397103
  5 a8bd56f19ad4 1792607618124
  6 f20cc06f07cd 1792761166850
```
Independent check (separate queries), verbatim:
```
host: ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech
new tables: derivatives, post_publications, project_wix, publish_events
new columns: posts.live_url nullable=YES, posts.published_at nullable=YES, rule_candidates.kind nullable=NO default='rule'::text
constraint: ai_calls_purpose_check CHECK ((purpose = ANY (ARRAY['spec'::text, 'writer'::text, 'critic'::text, 'check'::text, 'rules'::text, 'derivative'::text, 'facts'::text])))
constraint: derivatives_channel_check CHECK ((channel = ANY (ARRAY['gmb'::text, 'linkedin'::text])))
constraint: derivatives_post_channel_version_unique UNIQUE (post_id, channel, version)
constraint: post_publications_post_unique UNIQUE (post_id)
constraint: post_publications_state_check CHECK ((state = ANY (ARRAY['running'::text, 'failed'::text, 'checking'::text, 'live'::text, 'not_confirmed'::text])))
constraint: publish_events_step_check CHECK ((step = ANY (ARRAY['cover'::text, 'tag'::text, 'draft'::text, 'publish'::text, 'live'::text])))
constraint: rule_candidates_kind_check CHECK ((kind = ANY (ARRAY['rule'::text, 'fact'::text])))
0005 hash in database matches file sha256: true f20cc06f07cd
row counts: {"posts":"24","rule_candidates_kind_rule":"1","other_kinds":"0","project_wix":"0","publications":"0","derivatives":"0"}
```
The γ5 rule candidate already on Neon dev took the default `kind = 'rule'`.

**Production:** not run from this session. It runs in the Vercel production build of the merge, after a Neon backup branch, as in γ4 and γ5.

## Wix calls from this session

**Read-only, as approved (Q9 option a).** Two calls through the Wix connector on the Migss site (`cba1d6e0-2aaa-4097-b52d-71939abe2255`), plus the Wix docs. Nothing was written to Wix.

- **Query Tags**, filtered to the two pillar slugs. It returned both:
  - `bathroom-renovation` (`16d0bb99-…`, 17 published posts);
  - `kitchen-renovation` (`27b4a607-…`, 9 published posts).

  The response shape (`tags[]` with `id`, `label`, `slug`) is what `src/lib/wix.ts` reads.
- **List Members** with `fieldsets=PUBLIC`. It returned two members:
  - "Amir Taylor" (`fa29eebd-…`);
  - "info4499403" (`ef67bb59-…`).

  The shape (`members[]` with `id` and `profile.nickname`) is what the member picker reads. Choosing the author is Amir's step in the smoke.

**The live Migss blog** was also fetched once without a key (`/blog/bespoke-bathroom-renovation-chigwell`) to model the live check. It confirmed that:
- `migssinteriors.com` redirects to `www.migssinteriors.com`;
- the title is in both `<h1>` and `<title>`;
- the excerpt is the meta description;
- `og:image` carries the Wix media file ID;
- the tag label appears on the page.

**Request shapes confirmed in the Wix REST docs:**
- the API key headers;
- Create Draft Post with `publish: false`, `memberId`, `tagIds`, `excerpt`, `seoSlug`, `richContent` and `media.wixMedia.image.id`;
- Publish Draft Post (a second publish updates the same post);
- Get Post and Get Post By Slug with `fieldsets=URL`;
- Query Draft Posts, which takes `title` but cannot filter on `seoSlug`;
- Generate File Upload URL with `filePath` (`sizeInBytes` is read-only, so it is not sent);
- the Ricos node shapes.

**Not confirmed by the docs, so the smoke shows them:**
- whether `memberId` is required with an API key (it is always sent);
- what Wix does with a duplicate `seoSlug` (the app checks Get Post By Slug first, and builds the URL from the slug Wix returns);
- when an uploaded image is ready (the docs disagree);
- the labels the Keys Manager shows for each permission.

## Real runs on Neon dev

`trigger.dev dev` ran from this session (`Local worker ready on branch: default [node-24] -> 20261023.1`) with the dev-only WebSocket alias. `scripts/real-run.ts` gained `derivative`, `derivative-report` and `facts` commands. The post is the γ5 real run's approved "Finance Bathroom Installs" (`9d47679d…`).

```
○ Oct 23, 13:43:02.868 ->  20261023.1 | write-derivative | run_06gmi00gnjh1all5cpjridlka2.1 | Success (7.2s)
○ Oct 23, 13:43:08.256 ->  20261023.1 | write-derivative | run_06gmi014s9ankei4np8p046fa2.1 | Success (7.5s)
○ Oct 23, 13:43:09.841 ->  20261023.1 | propose-facts | run_06gmi01m40mqrtigfkp4a1mfa2.1 | Success (4.7s)
○ Oct 23, 13:43:10.135 ->  20261023.1 | propose-facts | run_06gmi01mhef25kevkelcpbava2.1 | Success (4.7s)
13:43:02 | derivative | claude-haiku-5-5 | medium | derivative-1 | 3243 | 1164 | 2277 | 0 | 0.001191 | 5400 | end_turn |
13:43:07 | derivative | claude-haiku-5-5 | medium | derivative-1 | 3240 | 1251 | 0 | 2277 | 0.000972 | 5750 | end_turn |
13:43:09 | facts | claude-opus-5-5 | low | facts-1 | 430 | 10 | 2834 | 0 | 0.016090 | 3100 | end_turn |
13:43:09 | facts | claude-opus-5-5 | low | facts-1 | 430 | 10 | 2834 | 0 | 0.016090 | 3075 | end_turn |
```
(time, purpose, served model, effort, prompt version, input, output, cache write, cache read, cost USD, ms, stop reason)

**1. GMB and LinkedIn copy (derivative-1).**
- **Model:** both ran on **Claude Haiku 5.5**, because the Neon dev Settings row has `derivative_model = claude-haiku-5-5` (set 21 Oct). The app reads the Settings model, as decision 20 says, so this is correct behaviour. Production's Settings value is not visible from this session, so it is on the smoke list.
- **Cost:** $0.002163 for the two.
- **Opus 5.5 equivalent**, calculated from the same token counts at Opus prices, not measured: about $0.048 for the GMB call and $0.038 for the LinkedIn call. That is within the card's "About $0.02 to $0.08 each".
- **Checks:** both passed the scripted checks first time (`passed: true`, no issues), so no fix round ran:
  - **GMB:** 814 characters, no link, phone number or hashtags.
  - **LinkedIn:** 913 characters, ending with the planned post URL and three hashtags.
- **Facts:** both used only facts the approved post states. The itemised quote, materials, waste removal and snagging come from Migss's business facts, and the FCA register point is in the post.
- **The GMB text, verbatim:** "Get a firm figure before you borrow. … Read the full guide to compare savings, remortgaging, personal loans, 0% cards and showroom finance for your bathroom." The full text is in `derivatives` on Neon dev.

**2. Fact suggestions (facts-1)** on the post's two real regenerate notes.
- **The note:** "Shorten the opening to two sentences, and end the finance section by telling readers to ask about payment options at the free consultation."
- **Result:** both runs proposed **no facts**, which is correct. The note asks for edits and states no fact about Migss.
- **Cost:** $0.032180 for the two. Each wrote the cache because they started together.
- **A note that does state a fact** is covered by Vitest and by the triage in Playwright, not by a real call. I chose not to invent a Migss fact into Neon dev.

**γ6 real spend:** $0.034343 (0.002163 + 0.032180). With γ4 and γ5's $1.891691, that is $1.926034 recorded against the $25 key.

## Consumer audit (D.3.3)

- **`src/config/post-status.ts`:**
  - It gains `PUBLISH_LINES` (Publishing, Checking the live page, Not confirmed live, Publish failed) and `DERIVATIVE_LINES` (Not generated yet, Writing, Not written, Ready to copy).
  - No new statuses: `published` was already in the list, and only the live check sets it.
  - The drift test caught `DerivativePanel` spelling "Writing" itself. That is fixed, and the test now covers the new words.
  - Every surface that shows a post's status already reads this module: Posts, the calendar and its panel, Home and the review queue. So Published shows in its success colour everywhere with no change.
- **`SlotView` gains `liveUrl`:**
  - **Consumers:** the Posts page shows "View live post"; the calendar panel shows "Live at"; Home and the Run plan ignore it.
  - Covered by the Playwright Posts check.
- **`checks.ts`:**
  - The dash and banned-phrase checks moved into `styleIssues`, which `runChecks` calls in the same place, so the order of issues is unchanged.
  - **Consumers:** `runChecks` (all γ4 and γ5 callers) and `checkDerivative`.
  - The 29 check tests pass unchanged.
- **`review.ts`:**
  - Reopen for editing and Publishing details are refused once Wix holds a draft. The cover is refused the same way, in `covers.ts`.
  - The post page hides Reopen and locks the details in that state.
  - Covered by Vitest.
- **Rule candidates:**
  - `kind` is new. `proposeRuleCandidates` now skips duplicates of pending candidates (backlog 21).
  - **Consumers:** Settings, BrandFactory rules (which labels facts) and the post page's candidate count, which counts both.
- **`ai_calls` purposes `derivative` and `facts`:** the post's cost table labels them ("GMB post call", "LinkedIn post call", "Fact suggestions").
- **The Drive proof page is removed:**
  - the route, its spec, `DRIVE_PROOF_FOLDER_ID` in `.env.example` and in the Playwright config;
  - `listFolderFiles` stays, because the project folder check uses it.
  - `project.spec.ts` now clears its own Google token. The removed spec used to do it for every test after it.
- **The Connections Wix row** now lists each project; `settings.spec.ts` is updated.
- **Domain resets:** `src/test/db.ts` and `e2e/resetDomain()` clear the four new tables first.

## What was verified vs code-inspection only (MANDATORY)

**Verified (how):**
- **Wix credentials:**
  - They are stored as one ciphertext bound to the project; a copied ciphertext does not decrypt for another project. Vitest.
  - The key is never shown again, only its last four characters. Playwright checks the key is not on the page.
  - The connection check reports pillar tags found or Wix's error (Vitest; Playwright with a refused key, then the right one).
  - Author: chosen from the site's members (Vitest, Playwright).
- **Converter:**
  - Fixtures for every node type and nesting, links internal and external, and every refusal with its line (28 Vitest).
  - All six model-test drafts convert whole.
  - A table is refused before any Wix call (Vitest asserts the fake saw no calls).
- **Publish:**
  - The happy path sends exactly the shape above: draft unpublished first, then publish (Vitest, with the body checked).
  - Playwright clicks through Publish post, then Cancel (nothing sent), then Publish now.
  - A failure at upload, tag lookup, draft create or publish, then Try again: never a second upload, draft or post (Vitest, each step; Playwright for the draft step).
  - A lost create reply is recovered by adopting the draft (Vitest).
  - A duplicate slug on Wix stops before anything is created (Vitest).
  - The live URL uses the slug Wix returns (Vitest).
  - A double click is refused while a publish runs, and a stopped one can be retried after 3 minutes (Vitest).
- **Cover downscale:**
  - A 3600 × 2400 image over 10 MB becomes a 2400 × 1600 JPEG under 10 MB; covers under 10 MB go unchanged. Vitest with sharp, really run.
  - `sharp` also loaded and resized in this container directly.
- **Live check:**
  - Three looks before it confirms. Bare-domain to www redirects followed, and the final URL saved (Vitest, with a fake clock).
  - Never Published without the title: 15 looks, then Not confirmed live.
  - Entities and curly quotes in the title.
  - Not confirmed live with Check again, and the published view with the live link: Playwright, playing the task's part.
- **Derivatives:**
  - The checks, including the phone-number rule (four UK forms caught; prices, years and sizes not), links, hashtags, Markdown and limits (Vitest).
  - One fix round, versions, never paying twice (Vitest).
  - Real Haiku runs (above).
  - The card in Playwright: generate, live warning on a phone number, edit, Save edit as version 2, Copy reaching the clipboard.
- **Facts and duplicates:**
  - Proposal, acceptance into business facts, no-op on edit-only notes, the duplicate check across clients (Vitest).
  - A real Opus run (above).
  - Triage with Add fact (Playwright).
- **Screenshots looked at:** desktop and 390px (Publish ready, failed, checking, not confirmed, published, derivatives, fact candidate, Wix settings, Connections). Nothing scrolls sideways at 390px (Playwright).
- **Neon dev migration:** outputs above.

**Code-inspection only (needs the smoke):**
- **A real publish to Wix with an API key.**
  - No write was made from this session, as agreed. The draft-then-publish split, `memberId` with an API key, the cover upload with `filePath`, and the image being ready at publish time are all from the docs only.
  - The first real publish is the smoke.
- **Real Google Drive download** (`alt=media`) of the chosen cover: this session has no Google token. The Playwright stand-in served the bytes.
- **`sharp` on Vercel:** it ran here, but Vercel's runtime is first exercised by a cover over 10 MB in production.
- **The live check against the real Migss blog** in Trigger.dev Production, including the 60-second refresh timing. The page reading was modelled on a real Migss page, but the task itself has only run in Vitest.
- **Wix's own rendering of the Ricos body**: spacing between blocks, lists and the quote. The smoke checks body formatting on the live page.
- **The tasks in Trigger.dev Production:** `confirm-live`, `write-derivative` and `propose-facts` deploy with the merge. They need only the variables the γ4 and γ5 tasks already use: `DATABASE_URL` and the Anthropic key.

## Deliberately unchanged / out of scope

- Scheduled publishing, the monthly batch, and GMB and LinkedIn API posting: Phase 3.
- Editing or unpublishing a post after it is published. The prototype's Unpublish is not built, and after Wix holds a draft the post is fixed in the app.
- The prototype's "Copy as HTML" and "Download Markdown" (backlog 22).
- Wix's resumable upload: covers over 10 MB are downscaled instead (orientation approval).
- Draft from site (backlog 15).

## Backlog housekeeping

- Closed 3 (Drive proof page removed) and 21 (duplicate check for pending candidates).
- Added 22 (Copy as HTML and Download Markdown on the Publish card) and 23 (the Settings heading "Rule candidates from your edits" now also holds facts from notes).

## Production smoke list

Publishing step 6 makes "Wet room maintenance week by week" **public on the Migss blog**.

1. **Vercel build log of the merge:** expect `backup/pre-0005_publish-...` created and ready, `Migrator finished.`, `Applied migrations: 6` and `Check passed`. Report back if the build failed.
2. **Settings, AI models:** check the Derivatives model is the one you want. Neon dev's is set to Haiku 5.5; the app default is Opus 5.5.
3. **In Wix's API Keys Manager:**
   - create a key on the account that owns the Migss site, limited to that site;
   - give it the Blog permissions (manage, read, read drafts), Read Members and Manage Media Manager;
   - copy the key and the account ID.
4. **Projects, Migss Interiors Website, Settings, Wix Blog publishing:**
   - paste the key, the account ID and the site ID (the part after `/dashboard/` in the site's dashboard address);
   - Save and check credentials. Expect "Connected. 2 of 2 pillar tags found on Wix." and "Key ending" with the key's last four characters;
   - Choose author and pick the Migss member, then Save author;
   - check Settings, Connections shows the Wix row Connected.
   - Report back the exact message if the check fails.
5. **Open "Wet room maintenance week by week"** (approved). The Publish card should list:
   - the address `www.migssinteriors.com/blog/<slug>`;
   - Bathroom Renovation (bathroom-renovation);
   - your author;
   - the excerpt as meta description;
   - the cover from Bathrooms;
   - no problems.

   Report back any line under "Before this can be published".
6. **Publish post, then Publish now.**
   - Within about a minute the card shows "Checking the live page".
   - Within about 5 minutes it should change to Published, with "Live at …".
   - It must not say Published before that. If it shows "Not confirmed live", open the link, then use Check again.
   - Report back the step and message if it shows "Publish failed".
7. **Open the live page** and check:
   - the title;
   - the cover;
   - the Bathroom Renovation tag;
   - the excerpt as the meta description (view the page source, `<meta name="description">`);
   - the body formatting: headings, lists, bold, links and the gap between paragraphs.

   Then check the post appears on the bathroom pillar page. Report back anything that looks wrong in the body.
8. **Posts page:** the post shows Published with "View live post"; the calendar shows it in the Published colour.
9. **On the post, Derivatives:**
   - Generate GMB post and Generate LinkedIn post, about $0.02 to $0.08 each on Opus;
   - check the GMB text has no phone number or link, and the LinkedIn text ends with the live link;
   - edit one, Save edit, then Copy and paste it somewhere to check.
10. **Optional:** in Wix's Media Manager, the cover is in a "BrandFactory covers" folder, and the Wix Blog lists the post once (no duplicate draft).
11. **After the smoke:** delete `DRIVE_PROOF_FOLDER_ID` from the Vercel project's environment variables. The page that read it is gone.
