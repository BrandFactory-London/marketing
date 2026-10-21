# Handoff: Phase 1, checkpoint γ5 (review, approval and covers)

You are the implementation agent for BrandFactory Marketing. A separate Claude chat reviews your orientation report. Amir approves the orientation; after that you build, test, merge and give him a short production smoke list (CLAUDE.md, "How we work").

## Where things stand

γ4 is live in production (deployed from `81bbf19`, gate in `docs/gate-cp4.md`). Amir can batch slots, confirm specs and generate posts through Trigger.dev, and drafts land in the review queue read-only. The production smoke generated one real Migss post ("Wet room maintenance week by week", $0.51, critic passed in round 2). Read `docs/gate-cp4.md`, `docs/backlog.md` and that post's record in production before designing anything; three problems it exposed are part of this checkpoint (items 1 to 3 below).

## Read first

`CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 11, 16, 17 and 18 above all), `docs/scope.md`, `docs/backlog.md` (items 11, 18, 19 and 20), `src/prompts/` and the scripted checks, `src/config/post-status.ts`, and these prototype screens in `design/prototype/`: `Review.dc.html`, `Post.dc.html`, `Settings.dc.html` (rule candidates).

## Your first deliverable: the γ5 orientation report

Write it using `docs/templates/orientation-report.md`, post it, and **stop**. Write no code until Amir approves it.

## γ5 scope

Goal: Amir can turn a draft into an approved post he would publish: edit it, see what needs his attention, pick a cover, and approve, reject or regenerate it, with his edits feeding back into the rules.

### Fixes from the γ4 production smoke (do these first)

1. **Placeholders block approval.** The smoke post contained `[CONFIRM: ...]` markers and other square-bracket placeholders, and the critic passed it. Any square-bracket placeholder left in the title, excerpt or body must be highlighted in Review and must block Approve until resolved. The critic should treat a placeholder as something for Amir, not as a pass.
2. **Examples are style references, not text.** The writer copied sentences from the client's Examples section word for word into the post. Change the writer and critic prompts so Examples and Counter-examples guide voice only: never reused verbatim or closely paraphrased. Add a scripted check that flags any sentence of the draft that matches an Examples line.
3. **Length (backlog 19).** Every first draft so far has overshot the maximum by about 150 words, costing a fix round each time. Have the writer aim for the middle of the range, and decide in orientation whether the scripted check gets a small tolerance.
4. **Title honesty.** The critic flagged a title that promised a structure the post did not follow. Add it to the critic's hard checks for structure, or say why not.

### Review (decision 17)

5. **Editor.** The draft view becomes editable: title, excerpt and Markdown body beside a live preview, with the critic's issues listed against their lines and the scripted check results. Saving creates a new draft version; the writer's version is kept.
6. **Actions.** Approve post, Reject with a note, and Regenerate with a note (a new writer round using the note and the current text, then the checks and the critic again). Statuses follow `src/config/post-status.ts`.
7. **Edits become rule candidates.** On approve, the diff between the writer's last version and Amir's approved version is saved, and Claude proposes rule candidates from it, each naming the tier it would join (BrandFactory rules, client or project). They are triaged in Settings: accept (adds to that tier as a new version) or dismiss. Nothing changes the rules without Amir.
8. **Cover photo (decision 18, backlog 11).** Pick a cover from the project's Drive folder, browsing into subfolders (the Migss folder is a parent with subfolders such as Bathrooms and Kitchens). Thumbnails, the chosen file recorded on the post. Uploading to Wix is γ6.
9. **Publishing details.** Slug (editable, prefilled from the title) and pillar, shown on the post as the prototype does, ready for γ6.

## Questions to settle in orientation

- **Q1. Editor.** Which Markdown editor and preview, how critic issues anchor to lines that Amir has since edited, and how a version is saved (explicit save, autosave or both).
- **Q2. Placeholder rule.** Exactly what counts as a placeholder, where it is detected (scripted check, critic, Review UI), and what Amir sees.
- **Q3. Verbatim check.** How the Examples match works (exact sentence, normalised text, or close paraphrase) without false positives on common phrases.
- **Q4. Regenerate with a note.** Which text the writer starts from, how many rounds it gets, how its cost is shown, and what happens to Amir's unsaved edits.
- **Q5. Rule candidates.** The prompt, the shape of a candidate, which model, the cost, and how an accepted candidate is written into a tier without disturbing its existing text.
- **Q6. Drive browsing.** Thumbnails (Drive's thumbnail links or proxied through the app, given the files are private), subfolder depth, and paging for large folders.
- **Q7. Tables.** The migration for review events, rule candidates and the post's cover and slug fields, safe for the live version per CLAUDE.md.
- **Q8. Backlog 18 and 20.** Whether to share the prompt cache across roles now (18), and whether Amir should switch off Trigger.dev's GitHub-connection deploy (20, a production setting he changes himself).

## Out of scope for γ5

Uploading covers and publishing to Wix, GMB and LinkedIn derivatives (γ6). Optimise links and analytics (Phase 2). Draft from site (backlog 15). Editing posts that are already published.

## Closing γ5

Close with a verification gate using `docs/templates/verification-gate.md`, including the Neon dev migration and its independent check, at least one real Regenerate with a note and one real rule-candidate run with their costs, and phone-width screenshots. Then merge and give Amir a short production smoke list: open the smoke post, see its placeholders highlighted and Approve blocked, fix them, edit a line, pick a cover from a subfolder, approve it, and triage the rule candidates it produces.
