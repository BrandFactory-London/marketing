# Handoff: checkpoint γ7 (the learning loop, and Facebook and Pinterest copy)

You are the implementation agent for BrandFactory Marketing. A separate Claude chat reviews your orientation report. Amir approves the orientation; after that you build, test, merge and give him a short production smoke list (CLAUDE.md, "How we work").

## Where things stand

γ6 is live in production (`44ca0c4`, PR #8, gate in `docs/gate-cp6.md`) and its production smoke passed in full: Wix credentials and author saved, "Wet room maintenance week by week" published to the Migss blog and confirmed by the live check, and GMB and LinkedIn copy generated, edited and copied. Phase 1 is complete. γ7 closes the gaps Amir found in the review loop and adds the two channels his client calendar promises.

What the code does today (checked on `main` at `44ca0c4`):
- **Blog posts.** A regenerate note goes into the new version and the critic honours it. The note also starts `propose-facts` straight away. Rule candidates are proposed only on **approve** (`propose-rules`), from the edit diff plus every regenerate and reject note on the post (`src/lib/rules.ts`). Notes on a post that is rejected and never approved never become rule candidates.
- **Derivatives.** Regenerate takes an optional note ("Note for the writer (optional)", `DerivativePanel.tsx`), used only for that version (`src/prompts/derivative.ts`). Neither the note nor Amir's saved edits reach rule or fact candidates.
- **Rules have no channel.** BrandFactory rules are two sections (`writing_rules`, `banned_phrases` in `src/config/knowledge.ts`) and every writer, blog or derivative, gets the same pack. A rule meant for one channel would shape all of them.

## Read first

`CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 7, 9, 17 and 20), `docs/backlog.md` (items 21 and 23), `docs/gate-cp5.md` and `docs/gate-cp6.md`, `src/config/knowledge.ts`, `src/lib/rules.ts`, `src/prompts/rules.ts`, `src/lib/facts.ts`, `src/prompts/facts.ts`, `src/lib/derivatives.ts`, `src/prompts/derivative.ts`, `src/lib/ai/` (how the pack is assembled and cached), `src/lib/checks.ts`, `src/app/(app)/posts/[postId]/` (actions, `DerivativePanel.tsx`, `DerivativesCard.tsx`), and the Settings rules page.

## Your first deliverable: the γ7 orientation report

Write it using `docs/templates/orientation-report.md`, post it, and **stop**. Write no code until Amir approves it.

## γ7 scope

Goal: every time Amir says what was wrong, on any channel, the new version fixes it and the reason comes back to him as a proposed rule or fact, scoped to the channel it belongs to, so the next run does not repeat the mistake. And every approved post yields the four channel versions his client plan promises: GBP, LinkedIn, Facebook and Pinterest.

### The learning loop

1. **Derivative regenerate asks what was wrong.** The note becomes required on regenerate ("What was wrong with this version?"). A first generation still needs no note.
2. **Derivative notes and edits feed the candidates.** A derivative regenerate note, and the diff when Amir saves an edit to a model version, go to rule and fact candidates in Settings, triaged as today. Nothing changes the rules without Amir.
3. **Blog notes propose rules straight away.** A regenerate or reject note on a blog post proposes rule candidates when it is saved, not only on approve. Approve still proposes from the edit diff. The duplicate check (backlog 21) keeps the same rule from appearing twice while both are pending.
4. **Rules carry a channel.** A candidate names its scope: all channels, blog, GBP, LinkedIn, Facebook or Pinterest. Accepting it writes it where that scope lives, and each writer (blog writer, critic, each derivative) receives only the rules for all channels plus its own. This applies to BrandFactory rules and to client voice rules. Existing rules are all-channel.
5. **Settings shows the scope.** Each candidate shows its channel and where it came from ("From your note on the LinkedIn post for …"), and Amir can change the scope before accepting. The accepted rules are readable per channel.
6. **Prove the loop.** At least one real run on Neon dev where a note on a derivative becomes a candidate, is accepted, and the next generation for that channel visibly follows it while another channel does not receive it.

### Facebook and Pinterest

7. **Two more derivative channels**, with the same mechanism as GBP and LinkedIn: prompt per channel, shared checks (dashes, banned phrases, placeholders), one fix round, versions, edit, copy, regenerate with a note, cost recorded.
   - **Facebook:** a Page post, conversational, with the post link.
   - **Pinterest:** a pin title and a pin description as two fields with their own copy buttons, the post link as the destination, and the post's cover as the suggested image (shown, not uploaded). Amir posts both by hand; API posting stays Phase 3.
   - State the length limits and their source in the orientation, as γ6 did for GBP and LinkedIn.
8. **Generate all.** One action on the post that generates every channel that has no version yet.

### Housekeeping

9. Rename the Settings heading for candidates now that it holds rules and facts from edits and notes (backlog 23).

## Questions to settle in orientation

- **Q1. Where channel rules live.** For example new sections per channel in the BrandFactory rules tier and in client voice, or a scope recorded per rule line. Which keeps the cached pack shared across channels, and what the cache cost is (backlog 18 context).
- **Q2. What triggers a candidate run.** Regenerate note, reject note, saved derivative edit, approve. Whether runs are batched per post to keep cost and noise down, and the expected cost per run.
- **Q3. Edit diffs on derivatives.** Every saved edit, or only the difference between the model's version and the version Amir copies or keeps. Small edits (a typo) should not produce rules.
- **Q4. Prompt changes.** How the rules prompt decides the scope, and what stops a one-off instruction ("lead with the drainage point") becoming a standing rule.
- **Q5. Facebook and Pinterest shapes.** Length limits, link handling, hashtags, and how Pinterest's two fields are stored as one version.
- **Q6. Migration.** Widening the derivatives channel constraint, any scope column on candidates or rules, safe for the live version per CLAUDE.md.

## Out of scope for γ7

Posting to any social platform, scheduling, Instagram, the knowledge base and planner (Phase 2), Copy as HTML and Download Markdown (backlog 22).

## Closing γ7

Close with a verification gate using `docs/templates/verification-gate.md`, including the Neon dev migration and its independent check, the real loop run from item 6 with its costs, one real Facebook and one real Pinterest generation with costs, and phone-width screenshots. Then merge and give Amir a short production smoke list: regenerate a LinkedIn post with a note, see the candidate in Settings scoped to LinkedIn, accept it, regenerate again and see it followed; check the GBP version does not receive it; reject or regenerate a blog post with a note and see a candidate straight away; generate Facebook and Pinterest copy for the wet room post and copy them.
