# Orientation: Phase 1, checkpoint γ6 (publish to Wix and derivatives)

23 Oct 2026. Written from the template in `docs/templates/orientation-report.md`. No code has been written.

Read in full:
- `docs/handoff-cp6.md` (this branch's first commit, `c4fe288`, identical to `e266d7d` on `docs/handoff-cp6`);
- `CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 6, 10, 13, 18, 19 and 20, and the Phase 3 list), `docs/scope.md` ("Wix Blog (Migss Interiors)"), `docs/backlog.md`, `docs/gate-cp5.md`, `docs/orientation-cp5.md`;
- `src/config/post-status.ts`, `src/config/models.ts`, `src/lib/checks.ts`, `src/lib/crypto.ts`, `src/lib/review.ts`, `src/lib/rules.ts`, `src/prompts/rules.ts`, `src/prompts/shared.ts`, `src/lib/jobs.ts`, `src/lib/settings.ts`, `src/db/schema.ts`, `trigger.config.ts`;
- the `<main>` markup and script of `Publish.dc.html`, and the text of `Posts.dc.html` and `Settings.dc.html` (Connections).

Skimmed: `src/prompts/writer.ts` and `critic.ts` (the regenerate note), `src/lib/drive.ts` and `covers.ts` (function list), `src/lib/google-tokens.ts`, `src/lib/ai/client.ts` (exports), the Connections page, the project Settings page, the Posts page, `e2e/trigger-standin.mjs`, `e2e/google-standin.mjs`, `playwright.config.ts`. Not opened: `Post.dc.html` beyond what γ5 already built from it.

**Wix API facts** come from the Wix REST documentation, read through the Wix docs tools on 23 Oct 2026. No call was made to any Wix site. Each request shape I use is listed under Q1 to Q4 with what the docs confirm and what they do not.

## 1. Branch state

```
$ git branch --show-current
claude/confident-clarke-b0js94
$ git log --oneline -3
c4fe288 Add γ6 handoff
f79f4dd Merge pull request #7 from BrandFactory-London/claude/gamma4-cost-cache-validation-jpq1pb
b104808 Gate: name its own commit
$ git status
nothing to commit, working tree clean
```

- **Base:** the branch starts from `origin/main` at `f79f4dd` (γ5 live in production), with the handoff as its first commit. Pushed.
- **Branch name:** this session pushes to `claude/confident-clarke-b0js94`, so the γ6 PR comes from that branch. Its title will be "γ6 publish to Wix and derivatives".

## 2. Files in scope

**Dependencies (γ6.2).** Pinned exactly.
- `mdast-util-from-markdown` 2.1.0 and `micromark` 4.0.3, already in the lockfile through `react-markdown`, become direct dependencies, plus `@types/mdast`.
- `micromark-extension-gfm-table` and `mdast-util-gfm-table` are added. They are needed only to **recognise** a table so it can be refused (Q2). Without them a pipe table parses as a paragraph of pipes and would be sent silently.

**Schema and migration (γ6.1):** `src/db/schema.ts`, `drizzle/0005_publish.sql` (Q8).

**Wix (γ6.1 to γ6.4)**
- `src/lib/wix.ts` (new): a small REST client covering tags, members, draft posts, posts by slug and the media upload URL. It reads `WIX_API_URL` when set, for Playwright only, the same pattern as `GOOGLE_API_URL`.
- `src/lib/wix-credentials.ts` (new): save, mask, decrypt and check the credentials.
- `src/lib/ricos.ts` (new): Markdown to Ricos (Q2).
- `src/lib/publish.ts` (new): the publish steps, the publish record and retry (Q3, Q4).
- `src/lib/live-check.ts` (new) and `src/trigger/confirm-live.ts` (new): the live check (Q5).
- `src/lib/drive.ts`: downloads a file's bytes (`alt=media`), with a size check from its metadata first.

**Derivatives and facts (γ6.5, γ6.6)**
- `src/prompts/derivative.ts` (new, `derivative-1`) and `src/prompts/facts.ts` (new, `facts-1`).
- `src/lib/derivatives.ts` (new) and `src/trigger/write-derivative.ts` (new).
- `src/lib/facts.ts` (new) and `src/trigger/propose-facts.ts` (new).
- `src/lib/checks.ts`: the dash, banned-phrase and placeholder checks are split out so derivatives reuse them.
- `src/lib/rules.ts`: the duplicate check (backlog 21).
- `src/lib/jobs.ts`: gains `startDerivative`, `startFacts` and `startLiveCheck`.

**Status module:** `src/config/post-status.ts` gains publish display lines: "Publishing", "Checking the live page", "Not confirmed live" and "Publish failed". These are lines, not statuses. `published` already exists.

**Screens**
- **Project Settings** (γ6.1): a Wix card with the API key, account ID and site ID, Check connection, and the author member picked from a list (Q1).
- **Settings, Connections** (γ6.1): the Wix row lists each project with its state (Connected, the error Wix returned, or Not set up), with a Check button.
- **Post page** (γ6.3 to γ6.5):
  - the prototype's Publish card for approved and published posts: what will be sent, Publish post, the step list while it runs, failures by step, "Check again", and the live link;
  - the Derivatives card: Generate GMB post and Generate LinkedIn post, each with an edit box, Save, Regenerate and Copy.
- **Posts page, calendar and Home** (γ6.4): published posts link to the live URL. The Published colour already comes from the status module; the consumer audit confirms each surface.
- **Settings, BrandFactory rules** (γ6.6): fact candidates appear in the existing list, marked "From your note on <post>".

**Housekeeping (γ6.6):**
- Remove `src/app/(app)/dev/drive-check/`, `e2e/drive-check.spec.ts`, `DRIVE_PROOF_FOLDER_ID` from `.env.example` and the Playwright config. Keep `listFolderFiles`, because `drive-folder.ts` uses it (backlog 3).
- Ask Amir to delete `DRIVE_PROOF_FOLDER_ID` in Vercel. It is a production setting.

**Tests**
- **Vitest:**
  - converter fixtures for each node type, plus refusals;
  - the Wix client against a fake `fetch`;
  - publish steps with a failure injected at each step, and retries that never create a second post;
  - the live check with a fake clock;
  - derivative checks;
  - facts and the duplicate check;
  - the migration's new constraints.
- **Playwright:** against a new `e2e/wix-standin.mjs`, at desktop and 390px width:
  - credentials and the member list;
  - Publish post from start to finish;
  - a failed step and its retry;
  - "Not confirmed live" with "Check again";
  - the live link on Posts;
  - derivative copy and edit.

## 3. Open questions

- **Q1, Wix API key and IDs.** Proposal:
  - **What Amir creates:**
    - An API key in Wix's API Keys Manager (`manage.wix.com/account/api-keys`), on the account that owns the Migss site, limited to that site.
    - It needs these permissions:
      - Manage Blog (`SCOPE.DC-BLOG.MANAGE-BLOG`), Read Blog and Read Draft Blog Posts;
      - Read Members (`SCOPE.DC-MEMBERS.READ-MEMBERS`);
      - Manage Media Manager (`SCOPE.DC-MEDIA.MANAGE-MEDIAMANAGER`).
    - The docs give the scope IDs only, not the labels shown in the Keys Manager, so the smoke list will name them by these words.
  - **Where each value comes from:**
    - **Account ID:** shown in the API Keys Manager.
    - **Site ID:** the part after `/dashboard/` in the Migss site's dashboard URL.
  - **How the app calls Wix:**
    - Headers: `Authorization: <key>` (no "Bearer") and `wix-site-id`. The docs say to send either the site ID or the account ID header, never both, so the account ID is stored but not sent. I can drop it if you would rather not enter it.
    - Every endpoint below is site-level.
  - **Storage (decision 6):**
    - The key, account ID and site ID are stored as one AES-GCM ciphertext from the existing helper, with the associated data `wix:<projectId>`, so the ciphertext only decrypts for that project.
    - The form shows "Key ending 7f3a" and never the full key again.
    - Saving new values replaces the old ones. "Remove credentials" asks first.
  - **Author member:**
    - After the credentials are saved, the card lists the site's members (`GET /members/v1/members?fieldsets=PUBLIC`, showing each nickname), and Amir picks the Migss member.
    - The ID is stored in plain text, because it is not a secret.
    - Publish post is not available until a member is chosen.
    - The docs say `memberId` is required for third-party apps and say nothing about API keys either way, so it is always sent.
  - **The connection check:**
    - It sends `POST /blog/v3/tags/query` with the project's pillar slugs.
    - It shows "Connected" with how many pillar tags were found, for example "2 of 2 pillar tags found".
    - Otherwise it shows Wix's status and message, for example "403: the key cannot reach this site". A pillar slug missing on Wix is a warning on the check.
    - The result and its time are stored, and Connections shows them.
  - Needs confirmation.

- **Q2, converter.** Proposal:
  - **Parser:** `mdast-util-from-markdown`, with the GFM table extension only so tables are recognised and refused. No HTML is passed through.
  - **What is converted:** the body only. The title goes in `title`, and the `Excerpt:` line goes in `excerpt`. The H1 and the Excerpt line are taken off before converting, by the same `splitDraft` Review uses.
  - **Node mapping:**

    | Markdown | Ricos |
    |---|---|
    | `##` to `####` | `HEADING`, `headingData.level` 2 to 4 |
    | paragraph | `PARAGRAPH` containing `TEXT` runs |
    | `**bold**` | `TEXT` with decoration `{type: "BOLD", fontWeightValue: 700}` |
    | `*italic*` | `{type: "ITALIC", italicData: true}` |
    | bold and italic nested | both decorations on the same run |
    | `[text](url)` | `{type: "LINK", linkData: {link: {url, target, rel}}}` |
    | `-` list | `BULLETED_LIST` > `LIST_ITEM` > `PARAGRAPH` |
    | `1.` list | `ORDERED_LIST` > `LIST_ITEM` > `PARAGRAPH` |
    | nested list | a list inside the `LIST_ITEM`, after its paragraph |
    | `>` quote | `BLOCKQUOTE` > `PARAGRAPH` |

    The docs confirm that a list item and a quote must hold a paragraph; TEXT directly inside fails. Node `id`s are optional and are left to Wix.
  - **Links:**
    - A site path such as `/renovation-services/bathroom` becomes an absolute URL on the project's site, with target `SELF` and no `rel`.
    - Any other link gets target `BLANK` and `rel: {noreferrer: true}`.
    - The checks already allow only links on the allowed list, so in practice every link is internal.
  - **Spacing:** the docs say Ricos adds no gap between blocks. The publish test rendered correctly on the Migss frontend, which styles its own spacing, so **no spacer paragraphs** are added. I'll check this on the live page in the smoke (body formatting).
  - **Refused, before anything is sent:**
    - tables;
    - images;
    - raw HTML;
    - code blocks and inline code;
    - horizontal rules;
    - an H1 or an H5 or H6 heading in the body;
    - hard line breaks;
    - footnotes;
    - reference-style links.

    These are refused because the publish test did not show them working, and for each one the converter returns the node, its line and a plain message.
  - **What Amir sees:**
    - The Publish card runs the converter when the page loads.
    - If anything is refused, Publish post is disabled and the card lists each problem, for example "Line 42: a table. The Migss blog can only show headings, paragraphs, lists, quotes, bold, italic and links. Reopen for editing and turn it into a list."
    - The publish action runs the converter again on the server, so a stale page cannot get past it.
    - The writer never produces these today, so this is a guard, not an expected path.
  - Needs confirmation, including headings 2 to 4 only.

- **Q3, cover upload.** Proposal:
  - **A cover is required to publish.** It was optional at approval (γ5). The Publish card says "Choose a cover first" and links to the picker.
  - **Download:**
    - Read the file's metadata (`size`, `mimeType`) with the stored Google token.
    - Re-check that the file is under the project's folder (the γ5 parent walk).
    - Then download with `files/{id}?alt=media`. The existing `drive.readonly` scope covers this.
  - **Size limit: 10 MB.**
    - The docs say files over 10 MB must use Wix's resumable upload instead of the single upload URL.
    - Rather than build that for Phase 1, a larger photo is refused before download: "This photo is 14.2 MB. Wix takes covers up to 10 MB in one upload. Choose a smaller copy."
    - Phone photos are usually 2 to 6 MB. If Migss's photos are larger, I can add the resumable upload instead. Say if you know the folder holds large files.
  - **Upload:**
    - `POST /site-media/v1/files/generate-upload-url` with `mimeType`, `fileName` (the Drive name), `sizeInBytes` and `filePath: "/BrandFactory covers"`. The docs say missing folders in the path are created.
    - Then `PUT <uploadUrl>?filename=<name>` with the bytes and `Content-Type`.
    - The response's `file.id` is stored.
  - **On the post:** `media: {wixMedia: {image: {id: <file id>}}, displayed: true, custom: true}`. The ID is passed without a `wix:image://` prefix, as the blog docs say.
    - The docs say an upload is "not immediately available", while the blog guide says a PENDING image can be used straight away. The live check also looks for the cover (Q5), so if this turns out wrong, the smoke shows it.
  - **Reuse on a retry:**
    - The Wix file ID is recorded with the Drive file ID it came from.
    - A retry with the same cover reuses it and skips the download and upload.
    - Choosing a different cover means a new upload. The old file stays in Wix Media.
  - Needs confirmation of the 10 MB limit.

- **Q4, idempotency.** Proposal:
  - **Two calls instead of one:**
    - Create the draft with `publish: false`, store its ID straight away, then call `POST /blog/v3/draft-posts/{id}/publish`.
    - The scope's test used one call with `publish: true`. Splitting it gives a stored ID before anything is public.
    - The docs confirm that publishing a draft again updates the same post rather than making a new one.
  - **Before creating:** if the post already has a Wix draft ID, it is never created again; the retry goes straight to publish.
  - **After a lost reply:** Wix may have created a draft while the reply was lost.
    - Before creating, the app queries draft posts with `title $eq` and checks each result's `seoSlug`. Query Draft Posts cannot filter on `seoSlug` itself.
    - An unpublished draft with this title and slug is taken as ours and published.
  - **Slug already on Wix:**
    - Before creating, `GET /blog/v3/posts/slugs/{slug}` checks whether a published post already has the slug.
    - If one does and it is not this post's recorded post, publishing stops: "A post at /blog/<slug> already exists on Wix. Change the slug in Publishing details, or check the Wix Blog."
    - The docs do not say whether Wix would reject a duplicate slug or add a suffix, so the app checks first. After publishing it reads the slug Wix actually used and builds the live URL from that.
  - **Double clicks:**
    - The publish action locks the post row and refuses while a publish is running: "Publishing is already in progress."
    - A run that has not reported for 3 minutes counts as stopped and can be retried.
    - The button is also disabled while the action runs.
  - **Where the steps run: in the app's server action, not in Trigger.dev.** This changes the handoff's lean, which was only for the live check. Reasons:
    - The publish steps are a few API calls lasting seconds.
    - The secrets they need (`APP_ENCRYPTION_KEY`, `AUTH_GOOGLE_*`) are already in Vercel. Trigger.dev Production gets them only if they are not marked Sensitive (γ4 gate).
    - Playwright can drive the steps end to end against a Wix stand-in, which it cannot do with Trigger.dev tasks.
    - The route gets `maxDuration = 60`.
  - **Steps and failures:** each step is recorded as it starts and ends: cover download, cover upload, tag, create draft, publish, live check. A failure shows that step, Wix's status and message, and Wix's request ID when given. "Try again" resumes from the failed step.
  - **After a draft exists on Wix:**
    - Reopen for editing is refused.
    - The text stays locked.
    - Changes are made on Wix until editing live posts arrives (out of scope).
  - Needs confirmation, especially the draft-then-publish split and running the steps in the app.

- **Q5, live check.** Proposal:
  - **Where it runs:** a Trigger.dev task, `confirm-live`, started after Wix accepts the publish. Amir can leave the page.
    - It needs only the database and a public URL fetch, so it needs no new Trigger.dev variables.
    - The post page polls every 3 seconds while it shows "Checking the live page".
  - **What is fetched:** `<project site URL>/blog/<slug Wix used>`, with no cache.
  - **Timing:** every 20 seconds for up to 5 minutes. The Migss blog refreshes from Wix every 60 seconds, so 5 minutes allows several refreshes. That is 15 fetches at most.
  - **What counts as confirmed:**
    - HTTP 200, and the page's `<h1>` or `<title>` contains the post title, after decoding HTML entities and normalising spaces and quotes.
    - The other fields (excerpt as meta description, cover and tag) are recorded as seen or not seen, for the smoke and the gate, but they do not block "Published". The title is the decision 19 test.
  - **When it confirms:** the post becomes `published`, with `published_at` and the live URL, and the publish event records the result.
  - **When it does not:**
    - The post stays `approved`, with "Wix accepted this post, but the live page did not show it within 5 minutes", the URL tried and the last response (status, or "title not found").
    - "Check again" starts another 5-minute check.
    - It is never marked Published.
  - Needs confirmation of 20 seconds and 5 minutes.

- **Q6, derivatives.** Proposal:
  - **Two calls:** one per channel, as the prototype has a button for each, so either can be regenerated alone. They run in a Trigger.dev task, `write-derivative`, like every model call.
  - **Prompt (`derivative-1`):**
    - It uses the cached pack, so the client's voice and the BrandFactory rules apply.
    - The user message holds the approved post's title, excerpt and body, the channel's rules, and the link:
      - the live URL once published;
      - before publishing, the planned URL `<site>/blog/<slug>`, with a note on the card that it goes live when the post does.
  - **Channel rules and checks:**

    | | GMB post | LinkedIn post |
    |---|---|---|
    | Length | aim 600 to 1,000 characters; check fails over 1,500 (Google's limit) | aim 900 to 1,500 characters; check fails over 3,000 (LinkedIn's limit) |
    | Link | none in the text; Amir adds the post URL as the "Learn more" button, shown under the text | the post URL once, at the end |
    | Shape | plain text, no Markdown, no hashtags | plain text, short hook line first, up to 3 hashtags at the end |
    | Shared checks | dashes, banned phrases (built-in and the rules), placeholders, no invented facts in the prompt | same |

    The platform limits are from my knowledge of the platforms, not from a source read in this session. Both are the published caps as I know them; please correct them if your own figures differ.
  - **Checks fail:** one automatic fix round with the issues listed, as for posts. If it still fails, it is shown with the failures as warnings. Copy is still allowed, but the warning names the problem.
  - **No critic** for derivatives. The scripted checks and Amir's edit box are enough for short copy.
  - **Model:** the derivative model from Settings (Opus 5.5) at effort medium.
    - Roughly 3,000 cached pack tokens, 2,500 of post, and 300 to 500 output.
    - That is about $0.02 to $0.04 per derivative, or up to double with a fix round.
    - Recorded in `ai_calls` with the purpose `derivative`, and shown in the post's cost table under "GMB post" and "LinkedIn post".
  - **Stored as versions:**
    - Each generation and each saved edit is a row: channel, version, text, checks, source (model or edit), AI call.
    - The card shows the newest, with "Save edit" and "Copy".
    - Regenerate asks for an optional note and creates a new model version. Nothing is overwritten.
  - **Available** from Approved and Published.
  - Needs confirmation of the limits and of "no critic".

- **Q7, fact suggestions.** Proposal:
  - **When:** each time Amir queues a regenerate with a note, a `propose-facts` task runs alongside the regenerate, never blocking it.
  - **Detection:** a model call, not a pattern. Its input is the cached pack plus the note.
    - Instructions: propose only concrete facts about the client or the site that the note states and the pack does not hold, for example "Migss gives a 10-year labour guarantee".
    - Never propose instructions about this post, opinions or anything the pack already says.
    - Up to 3 facts, usually none.
    - Most notes are edit requests ("shorten the opening"), so most calls return nothing.
  - **Tier:** client `business_facts` for facts about the business, project `project_facts` for facts about this website only. The model picks the narrowest, as rule candidates do.
  - **Stored** in `rule_candidates`:
    - the regenerate's review event, the tier and section, the fact, `before` empty, `after` the note's sentence, and `kind = 'fact'`;
    - triage in Settings is unchanged: edit, move, Accept rule or Dismiss.
    - The accept button reads "Add fact" for facts.
  - **Model and cost:** the writer model (Opus 5.5) at effort low, about $0.02 per regenerate. Purpose `facts`.
  - **Overlap with γ5:** the rule-candidate call at approval also sees regenerate notes. The duplicate check (backlog 21) stops the same fact appearing twice while both are pending: same tier, section and normalised text.
  - Needs confirmation.

- **Q8, tables.** One migration, `0005_publish`. It only adds tables, nullable columns, one column with a default, and a wider check constraint, so the live γ5 version keeps working while γ6 builds (CLAUDE.md).
  - **`project_wix`** (one row per project):
    - project (primary key);
    - `credentials_enc` (key, account ID and site ID as one ciphertext);
    - `key_hint` (last 4 characters);
    - `member_id`, `member_name`;
    - `checked_at`, `check_ok`, `check_message`;
    - `updated_at`.
  - **`post_publications`** (one row per post and target, unique on post):
    - post;
    - target (`wix_blog`);
    - state (`running`, `failed`, `accepted`, `live`, `not_confirmed`);
    - the step reached, `cover_drive_file_id`, `wix_file_id`, `wix_tag_id`, `wix_draft_id`, `wix_post_id`, the slug Wix used, `live_url`;
    - `heartbeat_at`, `confirmed_at`, `error`, `created_at`, `updated_at`.
  - **`publish_events`** (the log the scope's data model names): publication, step, result (`ok` or `failed`), Wix status and message, request ID, details (JSON, for example what the live check saw), `created_at`.
  - **`derivatives`:** id, post, channel (`gmb`, `linkedin`), version, text, checks, source (`model`, `edit`), note, status (`writing`, `ready`, `failed`), error, AI call, `created_at`. Unique on post, channel and version.
  - **`posts` gains:** `published_at` and `live_url`, both nullable, so lists don't need a join.
  - **`rule_candidates` gains:** `kind` (`rule` or `fact`), not null with the default `'rule'`. Existing rows and the live version's inserts get `'rule'`.
  - **`ai_calls_purpose_check`:** dropped and recreated with `derivative` and `facts` added, in the same transaction.
  - **Neon dev:** host check `ep-square-mode-zatw6e39`, rehearsal, migration, then the independent check, as in γ5.
  - Needs confirmation.

- **Q9, testing without publishing.** Proposal:
  - **Vitest:** every Wix call goes through `src/lib/wix.ts` with an injectable `fetch`, as `drive.ts` does. The publish tests use a fake Wix that can fail any step once, and then assert:
    - one draft created across all retries;
    - the cover uploaded once;
    - the step and message recorded;
    - the right state after each failure.
  - **Playwright:** `e2e/wix-standin.mjs` serves:
    - tags and members;
    - draft create, query and publish;
    - posts by slug;
    - the upload URL and the PUT;
    - a fake live blog page whose title can be switched on or off to test "Not confirmed live".

    `WIX_API_URL` points the app at it; it is never set in Vercel. The live check task is covered by Vitest. In Playwright the test plays the task's part in the database, as γ4 and γ5 do for Trigger.dev.
  - **Real Wix calls from this session before merge: none that write.** Two read-only options, both your call (section 6):
    - (a) through the Wix connector attached to this session, a Query Tags and a List Members on the Migss site, to confirm the response shapes and find the member;
    - (b) none at all, leaving the first real Wix call to the production smoke.
  - **Real model runs on Neon dev:** one GMB and one LinkedIn derivative from an approved post, and one fact run from a regenerate note, with their costs. About $0.10 to $0.40 in total.
  - Needs confirmation.

**Smaller decisions I will take unless you object:**
- **Left out of the Publish card:** the prototype's "Copy as HTML" and "Download Markdown" (not in the handoff) and "Unpublish" (editing or unpublishing is out of scope).
- **Pillar tag required to publish:** the Migss pillar pages filter by tag, so a post with no pillar would not appear on them. If the tag slug is missing on Wix, publishing stops at the tag step with that message. Tags are never created on Wix.
- **What the Publish card shows before the button:**
  - the slug and live URL;
  - the pillar tag;
  - the cover thumbnail;
  - the excerpt marked "meta description";
  - the author member;
  - the converter's result;
  - and the line "Publishing makes this post public on the Migss blog."
- **Publish asks for confirmation** in a dialog ("Publish to the Migss blog now?"), because it is public and hard to reverse.
- **Backlog 21:** included. It is about 30 lines in `proposeRuleCandidates` and the facts insert.

## 4. Checkpoint structure

γ6 is one checkpoint with one gate, in seven internal stages.

| Stage | Focus | Files | Risk |
|---|---|---|---|
| γ6.1 | Migration `0005` (local, then Neon dev). Wix client, credentials, member list, connection check, Connections row, Wix stand-in | `db/schema.ts`, `drizzle/0005_*`, `lib/wix*.ts`, project settings, `settings/connections`, `e2e/wix-standin.mjs` | Medium. Request shapes are from the docs, not yet exercised with an API key. |
| γ6.2 | Markdown to Ricos converter and refusals, with fixtures | `lib/ricos.ts` | Low to medium. Mapping is small; spacing is checked in the smoke. |
| γ6.3 | Publish steps, the publication record, retries, the Publish card | `lib/publish.ts`, `lib/drive.ts`, `posts/[postId]/*` | High. Real money moment: public and idempotency-critical. |
| γ6.4 | Live check task, Check again, Published on Posts, calendar and Home, display lines | `lib/live-check.ts`, `trigger/confirm-live.ts`, `config/post-status.ts`, list pages | Medium. Timing against the 60-second refresh. |
| γ6.5 | Derivatives: prompt, task, checks, versions, card | `prompts/derivative.ts`, `lib/derivatives.ts`, `trigger/write-derivative.ts` | Low to medium. |
| γ6.6 | Fact suggestions, duplicate check, removal of the Drive proof page | `prompts/facts.ts`, `lib/facts.ts`, `trigger/propose-facts.ts`, `lib/rules.ts`, `dev/drive-check` | Low. |
| γ6.7 | Real runs on Neon dev (derivatives and facts, with costs), phone-width screenshots, consumer audit, gate | `scripts/real-run.ts`, `docs/*` | Low. |

The real runs use `trigger.dev dev` with the WebSocket alias and `scripts/real-run.ts`, extended with `derivative` and `facts` commands, as in γ5.

## 5. Estimated LOC and test deltas

Hand-written code and tests, excluding the lockfile and generated migration files.

| Stage | LOC (est.) | New tests (est.) |
|---|---|---|
| γ6.1 | 750 | 14 Vitest (client, credentials, check), 4 Playwright |
| γ6.2 | 450 | 22 Vitest (one fixture per node type, nesting, links, each refusal) |
| γ6.3 | 900 | 16 Vitest (each step's failure and retry, no second post, slug clash, cover reuse, size limit), 5 Playwright |
| γ6.4 | 400 | 8 Vitest (confirmed, title missing, timeout, entities), 3 Playwright |
| γ6.5 | 650 | 12 Vitest (checks per channel, fix round, versions, cost), 4 Playwright |
| γ6.6 | 350 | 8 Vitest (facts, duplicates), 1 Playwright; the drive-check spec is removed |
| γ6.7 | 200 | phone-width additions |
| **Total** | **about 3,700** | **about 80 Vitest, about 17 Playwright (net of the removed spec)** |

Estimates only. The gate cites the runner's own summary lines (D.1.2).

## 6. Ambiguities to resolve before starting

1. **Answers or amendments for Q1 to Q9**, especially:
   - **Q3:** the 10 MB cover limit, rather than the resumable upload;
   - **Q4:** draft then publish as two calls, and the steps running in the app rather than in Trigger.dev;
   - **Q5:** 20 seconds and 5 minutes, with the title as the only test for Published;
   - **Q6:** the character limits, and no critic for derivatives.
2. **Read-only Wix calls before merge (Q9):** (a) Query Tags and List Members on the Migss site through the Wix connector in this session, or (b) none. (a) is the lean. It confirms the shapes and the member ID before the smoke and changes nothing on the site.
3. **Your setup before the smoke**, not needed to start building:
   - a Wix API key with the Q1 permissions, limited to the Migss site;
   - delete `DRIVE_PROOF_FOLDER_ID` in Vercel after the merge.

Nothing runs against Neon dev, the Anthropic API or Wix until this is approved.

---

**Stopping here. No code until you approve.**

## Approval (Amir, 23 Oct 2026)

Approved, with these amendments:
- **Q3:** covers over 10 MB are not refused. They are downscaled before upload to about 2,400px on the long edge, as JPEG, so they fit the single upload URL. Covers already under 10 MB upload unchanged.
- **Q5:** the live check follows redirects (www and non-www).
- **Q6:** the GMB check also fails on a phone number in the text. The prompt says to leave contact details to the call button.
- **Q9:** option (a). Read-only Query Tags and List Members on the Migss site through the Wix connector. No writes to Wix from this session.

Everything else as proposed, including the smaller decisions.
