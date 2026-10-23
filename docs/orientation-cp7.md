# Orientation: Phase 1, checkpoint γ7 (the learning loop, and Facebook and Pinterest copy)

23 Oct 2026. Written from the template in `docs/templates/orientation-report.md`. No code has been written.

Read in full:
- `docs/handoff-cp7.md` (this branch's first commit, `8a9f90e`, identical to `1e553e3` on `docs/handoff-cp7`);
- `CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 7, 9, 17 and 20), `docs/backlog.md` (items 18, 21 and 23), `docs/orientation-cp6.md`;
- `src/config/knowledge.ts`, `src/lib/rules.ts`, `src/prompts/rules.ts`, `src/lib/facts.ts`, `src/prompts/facts.ts`, `src/lib/candidate-keys.ts`, `src/lib/derivatives.ts`, `src/lib/derivative-checks.ts`, `src/prompts/derivative.ts`, `src/lib/ai/pack.ts`, `src/lib/ai/client.ts`, `src/lib/edit-diff.ts`, `src/lib/knowledge.ts`, `src/prompts/shared.ts`;
- `src/app/(app)/posts/[postId]/actions.ts`, `DerivativePanel.tsx`, `DerivativesCard.tsx`, the regenerate, reject and approve paths in `src/lib/review.ts`;
- `src/app/(app)/settings/rules/` (page, `CandidateCard.tsx`, actions), the three `propose-*` and `write-derivative` tasks, and the `ai_calls`, `review_events`, `rule_candidates` and `derivatives` tables in `src/db/schema.ts`.

Skimmed: `docs/gate-cp5.md` and `docs/gate-cp6.md` (real-run costs and token counts), `src/config/models.ts` (prices), `src/components/KnowledgeEditor.tsx`, `src/lib/drafts.ts` (cost table labels), `src/lib/covers.ts` (exports), `scripts/real-run.ts` (commands), `src/config/post-status.ts` (`DERIVATIVE_LINES`). Not opened: `src/lib/generation.ts` beyond its `loadPack` calls, the writer, spec and critic prompts beyond their imports.

**The prototype has no Facebook or Pinterest screen** (no match in `design/prototype/`). Both channels reuse the existing derivative panel, so no new layout is invented; Pinterest's second field and image are the only new pieces.

**Platform limits** were looked up on 23 Oct 2026 and their sources are given under Q5.

## 1. Branch state

```
$ git branch --show-current
claude/hopeful-carson-fzy00j
$ git log --oneline -3
8a9f90e γ7 handoff: learning loop, Facebook and Pinterest copy
44ca0c4 Merge pull request #8 from BrandFactory-London/claude/confident-clarke-b0js94
87c42aa γ6 gate: Neon dev migration, real runs, consumer audit, smoke list
$ git status
nothing to commit, working tree clean
```

The γ7 branch is this session's designated branch, `claude/hopeful-carson-fzy00j`, started from main at `44ca0c4` (γ6 merged). Its first commit is the handoff. This report is the second.

## 2. Files in scope

**Schema and migration (γ7.1):** `src/db/schema.ts`, `drizzle/0006_learning.sql` (Q6).

**Knowledge and the pack (γ7.1)**
- `src/config/knowledge.ts`: channel sections for BrandFactory writing rules and client voice, each marked with its channel (Q1). A shared `CHANNELS` list (blog, GMB, LinkedIn, Facebook, Pinterest) moves here, so every consumer reads one vocabulary (D.3.1).
- `src/lib/ai/pack.ts`: the cached pack leaves channel sections out; a new `channelRules(pack, channel)` returns the block that goes after it.
- `src/lib/generation.ts`, `src/lib/derivatives.ts`: the spec, writer and critic calls get the blog block; each derivative gets its own channel's block.
- `src/prompts/writer.ts`, `critic.ts`, `spec.ts`, `derivative.ts`: a "Rules for this channel" heading in the instructions. Prompt versions move on by one.

**The learning loop (γ7.2)**
- `src/prompts/learn.ts` (new, `learn-1`): one prompt that proposes rules and facts from any source, with a scope (Q2, Q4). It replaces `rules-1` and `facts-1`; both files go.
- `src/lib/learn.ts` (new): reads a source (blog regenerate note, blog reject note, blog approve diff, derivative regenerate note, derivative edit), calls the model, applies the duplicate check and stores candidates. It replaces `proposeRuleCandidates` and `proposeFacts`; `acceptCandidate`, `dismissCandidate` and `listCandidates` stay in `src/lib/rules.ts`, which learns the scope.
- `src/lib/candidate-keys.ts`: unchanged rule (same text, same place), now also for derivative sources.
- `src/trigger/propose-candidates.ts` (new) replaces `propose-rules.ts` and `propose-facts.ts`. `src/lib/jobs.ts` gains `startCandidates(source)`.
- `src/lib/edit-diff.ts`: a `changedWords` count, for the small-edit filter (Q3).
- `src/lib/review.ts` and `posts/[postId]/actions.ts`: reject and regenerate start a candidate run as soon as they are saved; approve still does, from the diff.

**Derivatives (γ7.3)**
- `src/lib/derivative-checks.ts`: Facebook and Pinterest limits and checks; Pinterest checks two fields.
- `src/lib/derivatives.ts`: required note on regenerate, Pinterest's title field, Generate all, Copy saves an unsaved edit and starts the edit's candidate run.
- `src/prompts/derivative.ts`: Facebook and Pinterest channel rules; `derivative-2`.
- `DerivativePanel.tsx`, `DerivativesCard.tsx`: the note question, Pinterest's two fields with their own Copy buttons and the cover shown, "Generate all channels".
- `src/lib/drafts.ts`: cost table labels for the new channels and for "Rule and fact suggestions".
- `src/config/post-status.ts`: no new words expected; the drift test confirms.

**Settings (γ7.4)**
- `src/app/(app)/settings/rules/page.tsx`, `CandidateCard.tsx`, `actions.ts`: the new heading (item 9), the channel badge, the "From your note on the LinkedIn post for …" line, and an "Applies to" choice before accepting.
- The BrandFactory rules editor and the client page's Knowledge tab show the channel sections, grouped under "By channel" (Q1).

**Real runs (γ7.5):** `scripts/real-run.ts` gains `learn-loop`, `facebook` and `pinterest` commands.

**Tests**
- **Vitest:** the pack bytes unchanged for today's knowledge; channel blocks per role; each candidate source; the small-edit filter; scope on accept; duplicates across sources; Facebook and Pinterest checks; Pinterest parsing; required note; Generate all; the migration's constraints.
- **Playwright** at desktop and 390px: regenerate needs a note; a derivative note's candidate in Settings with its channel and scope change; Pinterest's two copy buttons and cover; Generate all; the renamed heading.

## 3. Open questions

- **Q1, where channel rules live.** Proposal: **new sections per channel, kept out of the cached pack.**
  - **Storage.** Decision 7 stores knowledge as named sections, so channel rules are more sections, not a tag on each line:
    - BrandFactory rules gain "Blog post rules", "GMB post rules", "LinkedIn post rules", "Facebook post rules" and "Pinterest pin rules" (keys `writing_rules_blog` and so on).
    - Client knowledge gains "Blog post voice", "GMB post voice" and so on for the same five channels (`voice_blog` and so on).
    - The existing Writing rules and Voice sections are the all-channel ones and keep their keys and text. Nothing is moved.
    - Banned phrases, business facts, counter-examples and all project sections have no channel version. A phrase banned on one channel only is a channel writing rule ("Never use … on LinkedIn"), so the scripted banned-phrase check stays one list.
    - No migration: sections are JSON in `knowledge_versions`. Each accepted rule is a new version, as today.
  - **What each call receives.**
    - The cached pack (system block 1) holds only the all-channel sections, byte for byte as today. A Vitest test builds the pack from today's knowledge before and after and compares the text.
    - The channel block goes in system block 2, after the cache breakpoint, with the role's instructions: "Rules for this channel" holding the BrandFactory channel rules, then the client's channel voice.
    - Spec, writer and critic receive the blog block. Each derivative receives its own. The candidate proposer receives all channel sections in its user message, so it can see what already exists.
  - **Cache cost.** The pack stays one shared prefix across the writer and every derivative channel, as now (γ6's real run: derivatives read the writer's 2,277-token cache). The channel block is billed as plain input: 100 to 300 tokens at Opus's $4 per million is $0.0004 to $0.0012 a call.
    - Putting channel rules inside the pack would give five different prefixes. Each channel's first call in five minutes would then write about 2,300 tokens ($0.0115) instead of reading them ($0.0005), and the blog writer would stop sharing with derivatives. That is the reason for keeping them out.
    - Backlog 18 (roles with structured output never share the cache) is unchanged.
  - Needs confirmation, especially banned phrases staying all-channel.

- **Q2, what starts a candidate run.** Proposal: **one run per piece of feedback, as soon as it is saved, no batching.**

  | Source | When | Reads |
  |---|---|---|
  | Blog regenerate note | when the regenerate is queued (replaces today's facts run) | the note, and the edit the regenerate started from if Amir changed the text |
  | Blog reject note | when the reject is saved | the note |
  | Blog approve | when approved with edits (as today) | the diff only. The notes were already read when they were saved, so they are no longer resent |
  | Derivative regenerate note | when the regenerate is queued | the note, the channel and the version it replaces |
  | Derivative edit | on Copy of an edited version (Q3) | the diff from the model version, and the channel |

  - **One call, not two.** Today a regenerate note runs `facts-1` and the approve runs `rules-1`. γ7 merges them into one prompt, `learn-1`, that returns rules and facts together, so a note costs one call. It keeps the `rules` purpose in `ai_calls` (no constraint change); the cost table calls it "Rule and fact suggestions".
  - **Why no batching.** Item 3 asks for candidates "when it is saved", so a delay would undo the point. Noise is held down by the prompt (Q4), the small-edit filter (Q3) and the duplicate check (backlog 21).
  - **Idempotency.** Each run's Trigger.dev key is its source (`learn-review-<event id>` or `learn-derivative-<version id>`), and the run does nothing if candidates from that source exist, as today.
  - **Expected cost.** `rules-1`'s real run cost $0.028 on Opus at effort medium, with a cache write (γ5 gate). A note is shorter than a diff, so expect $0.015 to $0.03 a run. A week of three posts with a couple of notes each and one note or edit per channel is about 20 runs, roughly $0.30 to $0.60.
  - **Failure** never blocks the regenerate, reject, approve or copy it follows, as today.
  - Needs confirmation.

- **Q3, edit diffs on derivatives.** Proposal: **only the version Amir copies, and only when it changed enough.**
  - Saving an edit stores a version, as today, but starts nothing. Amir often saves twice while editing.
  - **Copy is the trigger**, because it is the text he is about to post. When he copies a version whose source is an edit, the app diffs it against the model version it came from (the newest model version before it) and starts one candidate run for that edit. Copying the same version again does nothing more.
  - **Copy saves first.** If the box holds unsaved changes, Copy saves them as a version and then copies, so what is posted is always recorded. Today Copy copies unsaved text without saving.
  - **Small-edit filter.** No run if the diff changes fewer than 4 words in total (a typo or a single word). Above that, the prompt still ignores one-off rewording (Q4).
  - **Pinterest** diffs title and description separately and sends both.
  - Needs confirmation of Copy as the trigger and the 4-word floor.

- **Q4, prompt changes (`learn-1`).**
  - **Inputs:** the source type, the channel it came from, the post's title, the note or the before and after hunks, and the current channel sections (Q1).
  - **Scope.** Each rule names one of: all channels, blog, GMB, LinkedIn, Facebook, Pinterest.
    - The default is the channel the feedback came from.
    - "All channels" only when the point is about the client or about writing in general and the wording does not depend on the channel's form (for example "never mention prices" said on a LinkedIn note).
    - Facts carry no channel: they are true everywhere.
    - Amir can change the scope before accepting (item 5), so a wrong guess costs one click.
  - **One-off guard.** The prompt asks of each candidate: "Would this still be right for a different post on a different topic?" If not, it is not proposed.
    - "Lead with the drainage point" is about this post's topic: nothing. "Lead with the single most useful action for the homeowner" is standing: a rule.
    - Two worked examples of each kind sit in the prompt.
    - Each candidate must give a reason that names why it generalises, which Settings shows.
    - The real run includes a one-off note to show it proposes nothing (item 6).
  - **Kept from today:** never repeat or contradict what the pack holds, narrowest tier, quote the source exactly, at most 5 candidates, usually none.
  - **The note still shapes that version.** A derivative note goes into the regenerate, as today, whether or not it yields a rule.
  - Needs confirmation.

- **Q5, Facebook and Pinterest shapes.**

  | | Facebook post | Pinterest pin |
  |---|---|---|
  | Length | aim 300 to 600 characters; check fails over 2,000 (our own cap; Facebook allows 63,206) | title: aim 40 to 70, fails over 100. Description: aim 200 to 500, fails over 800 |
  | Opening | the useful point in the first line, since mobile cuts to "See more" after about 125 to 240 characters | the main keyword early in the title and description |
  | Link | the post's link once, on its own line at the end. Facebook builds the preview from the Wix page | no link in either field. The post's link is the pin's destination, shown with its own Copy link |
  | Hashtags | none | none |
  | Shared checks | dashes, banned phrases, placeholders, no Markdown | the same, per field |
  | Tone | conversational, in the client's voice | descriptive and search-led, in the client's voice |

  - **Sources.**
    - Pinterest: Pinterest's Create Pin API reference (title up to 100 characters, description up to 800) and its Help Centre page "Review Pin specs", which agrees and recommends 2:3 images (for example 1000 × 1500). Some third-party sites say 500 for the description; the official figure is 800.
    - Facebook: no Meta page found. The 63,206 ceiling and the 125 to 240 character mobile cut-off come from third-party tools and differ between them. That is why the check uses our own 2,000 cap and the prompt puts the point first, rather than relying on an exact fold. Please correct any figure your own experience contradicts.
  - **Pinterest as one version.** `derivatives` gains a nullable `title` column. For a pin, `title` is the pin title and `body` the description; every other channel leaves `title` empty. One version holds both, so edit, save, regenerate and copy work as for the others.
    - The model replies with two labelled lines, `Title:` and `Description:`, which the app splits. A reply it cannot split counts as a failed check and gets the fix round.
    - A plain-text reply keeps the shared cache. Structured output would put its schema ahead of the pack (backlog 18).
  - **Pinterest image.** The panel shows the post's cover thumbnail (the existing Drive thumbnail route) with its file name and the line "Pinterest suggests tall images (2:3). Upload this or a taller crop with the pin." Nothing is uploaded. With no cover chosen, it says so.
  - **Facebook** gets a "Copy link" like GMB, as a convenience if Amir posts the link as a comment.
  - Needs confirmation of the limits and "no hashtags" on both.

- **Q6, migration `0006_learning`.** It only adds nullable columns, a column with a default, relaxes one NOT NULL and widens one check, so the live γ6 version keeps working while γ7 builds (CLAUDE.md).
  - **`derivatives`:**
    - `derivatives_channel_check` dropped and recreated with `facebook` and `pinterest` added, in the same transaction;
    - `title` text, nullable (Pinterest).
  - **`rule_candidates`:**
    - `scope` text, not null, default `'all'`, with a check on the six values. Existing rows become all-channel, which matches the handoff ("Existing rules are all-channel"), and the live version's inserts get `'all'`;
    - `derivative_id` uuid, nullable, referencing `derivatives` (the version whose note or edit it came from);
    - `review_event_id` loses NOT NULL, since a derivative source has no review event. The live version always sets it, so relaxing it is safe;
    - a check that exactly one of `review_event_id` and `derivative_id` is set. Every existing row has a review event, so it passes.
  - **No change** to `ai_calls_purpose_check` (Q2) or to `knowledge_versions` (Q1).
  - **During the build window** the live version reads derivatives through its own channel list, so it ignores new channels, and no channel sections exist until the new version saves them.
  - **Neon dev:** host check `ep-square-mode-zatw6e39`, `--rehearse 0006_learning`, migrate, then the independent query, in the gate.
  - Needs confirmation.

**Smaller decisions I will take unless you object:**
- **Item 1, the note.** Regenerate opens "What was wrong with this version?" and the button stays disabled until it holds text. The server refuses an empty note on any channel that already has a version with text. "Try again" after a failed run with no text needs no note.
- **Item 5, the "From" line.** For example: "From your note on the LinkedIn post for "Wet room maintenance week by week"", "From your edit to the GMB post for …", "From your reject note on …", "From your regenerate note on …", "From your edits when approving …". The card shows a channel badge, and an "Applies to" choice next to "Where it belongs". For facts and banned phrases, "Applies to" is fixed to All channels.
- **The duplicate check** ignores scope: the same text for the same place is not added twice while one is pending, even with a different channel.
- **Generate all channels** appears when at least one channel has no version, queues every such channel at once (one run each) and says "About $0.10 to $0.30 for all four on Opus". Starting them together means each writes the cache, which costs about 3 cents more than staggering; not worth a delay.
- **Item 9, the heading.** "Rule candidates from your edits" becomes "Suggestions from your notes and edits", with "Choose where each one belongs". The empty state names all the sources.
- **GMB naming.** The handoff says GBP; the app, decision 20 and CLAUDE.md say GMB. The code key stays `gmb` and the label stays "GMB post". Renaming is a label change if you want it.
- **The old tasks** `propose-rules` and `propose-facts` are removed. Runs already started stay on the deployment that started them (Trigger.dev pins runs to their version).

## 4. Checkpoint structure

γ7 is one checkpoint with one gate, in five internal stages.

| Stage | Focus | Files | Risk |
|---|---|---|---|
| γ7.1 | Migration `0006` (local, then Neon dev). Channel sections, the pack split, channel blocks wired into every role | `db/schema.ts`, `drizzle/0006_*`, `config/knowledge.ts`, `lib/ai/pack.ts`, `lib/generation.ts`, `lib/derivatives.ts`, prompts | Medium. The pack must stay byte-identical, or every cache misses once and posts read differently. A test pins it. |
| γ7.2 | `learn-1`, the five sources, the candidate task, scope on accept, duplicates | `prompts/learn.ts`, `lib/learn.ts`, `lib/rules.ts`, `lib/candidate-keys.ts`, `trigger/propose-candidates.ts`, `lib/jobs.ts`, `lib/review.ts`, actions | Medium. Prompt judgment on scope and one-offs is only shown by the real run. |
| γ7.3 | Required note, Copy saves and learns, Facebook and Pinterest, Generate all | `lib/derivative-checks.ts`, `lib/derivatives.ts`, `prompts/derivative.ts`, `DerivativePanel.tsx`, `DerivativesCard.tsx`, `lib/drafts.ts` | Low to medium. Pinterest's two fields are the only new shape. |
| γ7.4 | Settings: heading, channel badge, From line, Applies to; channel sections in both editors | `settings/rules/*`, `KnowledgeEditor.tsx`, client Knowledge tab | Low. |
| γ7.5 | Real runs on Neon dev (the loop, Facebook, Pinterest, with costs), phone-width screenshots, consumer audit, gate | `scripts/real-run.ts`, `docs/*` | Low. |

**The item 6 proof (γ7.5)**, with `trigger.dev dev` and `scripts/real-run.ts` as in γ6, on the approved "Finance Bathroom Installs" post:
1. Regenerate its LinkedIn post with a standing note, and a second time with a one-off note.
2. Show the candidate from the first, scoped to LinkedIn, and nothing from the second.
3. Accept it through `acceptCandidate`, the same function as the button.
4. Regenerate LinkedIn and GMB. Print the instructions block each call was sent, from the same function the task uses: the rule is in LinkedIn's and not in GMB's. Quote the LinkedIn text where it follows the rule.
5. Record every call's cost.

## 5. Estimated LOC and test deltas

Hand-written code and tests, excluding the lockfile and generated migration files.

| Stage | LOC (est.) | New tests (est.) |
|---|---|---|
| γ7.1 | 400 | 10 Vitest (pack bytes unchanged, channel blocks per role, migration constraints) |
| γ7.2 | 600 | 16 Vitest (each source, scope, one candidate per source, duplicates across sources, small-edit filter); the rules and facts tests move to `learn` |
| γ7.3 | 750 | 18 Vitest (Facebook and Pinterest checks, Pinterest split, required note, Copy saves, Generate all), 4 Playwright |
| γ7.4 | 400 | 3 Playwright (badge and From line, scope change on accept, heading) |
| γ7.5 | 200 | phone-width additions |
| **Total** | **about 2,350** | **about 44 Vitest net, about 7 Playwright** |

Estimates only. The gate cites the runner's own summary lines (D.1.2).

## 6. Ambiguities to resolve before starting

1. **Answers or amendments for Q1 to Q6**, especially:
   - **Q1:** channel rules as separate sections outside the cached pack, and banned phrases staying all-channel;
   - **Q2:** one merged `learn-1` call per piece of feedback, with no batching;
   - **Q3:** Copy as the trigger for edits, Copy saving unsaved edits first, and the 4-word floor;
   - **Q5:** the Facebook figures (third-party only), and no hashtags on Facebook or Pinterest.
2. **The model for the item 6 run.** Neon dev's derivative model is Haiku 5.5 (γ6 gate), so the proof would run on Haiku for under a cent. Production uses whatever Settings holds. Lean: keep Haiku on Neon dev and also show the Opus equivalent from the token counts, as γ6 did. Say if you would rather I set Neon dev's derivative model to Opus 5.5 for the run (about $0.30 to $0.50 for the whole proof).
3. **Nothing needed from you before the build.** No new accounts or variables: the new task needs only `DATABASE_URL` and the Anthropic key, as the γ6 tasks do.

Nothing runs against Neon dev or the Anthropic API until this is approved.

---

**Stopping here. No code until you approve.**
