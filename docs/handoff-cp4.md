# Handoff: Phase 1, checkpoint γ4 (batch spec and generation)

You are the implementation agent for BrandFactory Marketing. A separate Claude chat reviews your orientation report and verification gate. Amir approves each step.

## Where things stand

γ3 is merged (`267a6c3`, PR #3) and smoked on preview, with its migration verified on the Neon dev and production branches. Every active project has planned slots eight weeks ahead at its package's cadence, Amir can set a topic and move a slot, and one status module (`src/config/post-status.ts`) drives every surface. Migss Interiors Website is on Premium (Mon, Wed, Fri). Read `docs/gate-cp3.md` and `docs/backlog.md`.

Environments, as before: the build session's `DATABASE_URL` is the Neon **dev** branch. Production migrations run only from a separate session in `marketing-production-migrations`, on Amir's go-ahead, after the smoke and before merge, in γ2's order: `--check-only`, `--rehearse <tag>`, the real run, Amir's SQL check.

## Read first

`CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 5, 7, 9, 10, 11, 12, 13, 14 and 16 above all), `docs/scope.md` (the generation pipeline), `docs/model-test/README.md`, `docs/model-test/knowledge-pack.md` (the proven prompt shape and output format), `docs/model-test/check.py` (the scripted checks to port), one or two drafts and the Opus critic report in `docs/model-test/`, `src/config/post-status.ts`, `src/lib/knowledge.ts`, `src/lib/settings.ts`, `src/config/models.ts`, and these prototype screens in `design/prototype/`: `BatchSpec.dc.html`, `SpecConfirm.dc.html`, `Generating.dc.html`, `Review.dc.html` (the queue list), `Post.dc.html` (for what γ4 shows and γ5 completes), `Calendar.dc.html` ("Generate from planned slots").

## Your first deliverable: the γ4 orientation report

Write it using `docs/templates/orientation-report.md`, post it, and **stop**. Write no code until Amir approves it.

## γ4 scope

Goal: Amir picks slots with topics, fills one batch form, confirms a spec per post, and gets checked drafts in his review queue, written by the models he chose from the knowledge he approved.

1. **Batch form (decision 14).** Started from the calendar ("Generate from planned slots") or the project page ("Create content"). Takes the selected slots with their topics, plus length range, CTA, FAQ choice, pillar tag (Bathroom Renovation or Kitchen Renovation, the deferred γ2 item), notes, and the writer and critic models (defaults from Settings, overridable per batch, decision 13).
2. **Specs (decision 14).** The writer model turns each slot into a spec: keyword, post type, angle, outline headings, the facts from the pack it will rely on, and the internal links it will use (only from the project's allowed links). Amir edits, redrafts with a note, or confirms each one. Nothing is written until a spec is confirmed.
3. **Generation (decisions 5, 9, 11, 12).** One Trigger.dev job per post: writer, scripted checks, critic, and up to two fix rounds, then in review or flagged. The knowledge pack (three tiers plus the output format) sits in the system prompt with prompt caching; the spec and the existing page list (from the sitemap) go in the user message. Bake in decision 12's three prompt fixes.
4. **Scripted checks.** A TypeScript port of `docs/model-test/check.py`: word count against the spec, em and en dashes, banned phrases from the BrandFactory rules, links outside the allowed list, excerpt length (160 characters) and the FAQ rule. They run before the critic and cost nothing.
5. **Critic.** Returns a structured verdict: pass or fail, issues each with a quote, category and note, and scores. Spec items are hard checks (decision 12). A failed draft goes back to the writer with the issues; after two fix rounds it is flagged.
6. **Generating screen.** As the prototype: each post's step (Writing, Checking, Needs another pass, done), progress, and "you can leave this page". It polls the database.
7. **Records.** Each post records the knowledge version ids it was written with (decision 7), every draft and every critic verdict, and the model, token usage and cost of each call.
8. **Review queue and a read-only draft view.** Posts land in the review queue (prototype `Review.dc.html`) as Needs review or Failed. Opening one shows the draft, excerpt and critic notes read-only. Editing, approve, reject, regenerate, rule candidates and the cover picker are γ5.
9. **Draft from site (decision 8, deferred from γ2).** The crawl of up to 50 pages that drafts client and project knowledge for Amir to edit. Include it here if the orientation judges it fits; otherwise propose where it goes.
10. **Connections.** The Anthropic row shows Connected once the key is set; add a Trigger.dev row.

## Questions to settle in orientation

- **Q1. Accounts and keys.** What Amir must create (an Anthropic API key, a Trigger.dev project), where each key goes (Vercel Preview and Production, Trigger.dev's own environments, this cloud environment), and which hosts this environment's network allowlist needs for Trigger.dev deploys. Propose how the Trigger.dev dev and production environments map to the Neon dev and production branches.
- **Q2. Real API calls from this session.** Lean: Amir adds a separate, low-limit Anthropic key to this cloud environment so the pipeline can be proven once end to end against the real API before the smoke. Estimate the cost of the test runs.
- **Q3. Batch form fields.** The prototype has Amir type a keyword, post type and location per post; decision 14 has the writer propose the keyword. Propose one shape: what Amir types, what the writer proposes, what he confirms.
- **Q4. Tables.** Propose the shape for batches, specs, drafts (versions), critic verdicts and call records, building on `posts` without reshaping it. Name the migration and confirm it follows γ2's sequence.
- **Q5. Prompts.** Where the system prompts live (versioned in code is the lean), how the knowledge pack is assembled from the three tiers' current versions, and how the critic's structured output is enforced.
- **Q6. Failure handling.** API errors, timeouts, a job that dies halfway, and a batch where some posts fail. What Amir sees, and what he can retry.
- **Q7. Cost visibility.** Lean: show the cost of each post and batch from the recorded usage, so the model choice stays an informed one.
- **Q8. Draft from site.** In γ4 or later (scope item 9).

## Out of scope for γ4

Editing drafts, approve and reject, regenerate with a note, rule candidates, the cover picker browsing Drive subfolders (backlog 11): γ5. Converting Markdown to Wix rich content, publishing, and GMB and LinkedIn derivatives: γ6. The monthly half-price batch run (Phase 3). Social media packages and Google Calendar (later phases).

## Closing γ4

Close with a verification gate using `docs/templates/verification-gate.md`: the migration on Neon dev (rehearsal and real run, each on Amir's go-ahead, then his SQL check), at least one real end-to-end generation through Trigger.dev with its cost, phone-width screenshots of the new screens, and numbered smoke steps: set topics on two Migss slots, start a batch, confirm both specs, watch generation, open both drafts and their critic notes, check the scripted checks caught nothing a reader would catch first, and check the recorded knowledge versions and cost. The production migration runs from a separate session on Amir's go-ahead, after the smoke and before merge.
