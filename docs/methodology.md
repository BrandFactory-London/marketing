# BrandFactory Labs: Engineering Methodology

> Copied from the BrandFactory Labs project for this repo's implementation sessions. The canonical
> version lives in the BrandFactory Labs project. Project-agnostic; applies to any app.

> Developed and proven across real multi-session sprints. Every discipline in §D exists because a real
> mistake on a real sprint made it necessary. Treat it as hard-won, not theoretical.

---

## A. The core loop

All substantial development work follows one spine:

```
Scope  ->  (Audit, if shape unknown)  ->  (Design conversation)  ->  Orientation report  ->
   ->  Implementation (γ-checkpoints + verification gates + smoke between checkpoints)  ->
   ->  Final verification gate  ->  PR  ->  Merge  ->  Production smoke  ->  (Hotfix if a gap is caught)
```

Ceremony scales with the size and uncertainty of the work:
- **Tiny, contained, correctness fix**: hotfix (branch off main, orientation-lite, fix, PR, merge). No checkpoints.
- **Clear-shape feature**: single implementation session with orientation + verification gate.
- **Large or multi-phase work**: γ-checkpoint structure.
- **Unknown-shape work**: discovery-first sequence (§B) before any implementation.

The judgment: can you describe the work's structure in two sentences without hedging? If yes, you
know the shape, so proceed to implementation. If no, the shape is unknown, so audit first.

---

## B. The discovery, design, implementation pattern

For work whose *shape* (not just details) is genuinely unknown, use three distinct phases, often three
separate sessions:

### Phase 1: Audit (pure investigation, no code)
Produces a comprehensive map: how something currently works, every token/consumer/contract involved,
gaps against the goal, blast radii of likely changes, and open questions code alone can't answer. No
code is modified. Output is a single reference document.

### Phase 2: Design conversation (chat-only, between sessions)
Read the audit. Decide the shape through structured passes. Produce the implementation prompt and a
design-decisions document of record. Trade-offs get made with the user here, not during implementation.
Give an honest lean on each question, let the user push back, lock decisions as you go, don't
relitigate locked decisions.

### Phase 3: Implementation (the build)
Execute the agreed design with γ-checkpoint structure.

**The trigger to use it:** any scoping conversation where you catch yourself proposing "Plan A vs
Plan B" comparisons without knowing what's actually in the code.

---

## C. The artefacts

Templates live in `docs/templates/`.

### Orientation report (`docs/templates/orientation-report.md`)
Opens every implementation session. Confirms branch state, lists files in scope grouped by domain,
addresses open questions left by the design conversation, proposes the checkpoint structure,
estimates LOC + test deltas, and flags ambiguities. **Reviewed and approved before any code is written.**
Expect an orientation Q&A round (see D.2.4).

### Design-decisions document (`docs/design-decisions.md`)
The record of a design conversation. Locked: disagreement is filed as a backlog item, not relitigated.

### Verification gate (`docs/templates/verification-gate.md`)
Closes every checkpoint and every session. Literal `git` output (branch, HEAD, status), LOC delta,
test count **from the test runner's own summary line** (never a grep approximation), typecheck/lint
status, a consumer audit for any changed contracts, and an explicit **"what was visually verified vs
code-inspection only"** section.

---

## D. The disciplines

### D.1: Verification and honesty

**D.1.1 Don't claim work is done until it's verified.**
Tool output is one input to verification, not verification itself. A passing test suite proves the
suite passes, not that the feature works. Visual checks require actual visual confirmation, not "the
code looks right." When reporting something done, specify what was actually checked. If you genuinely
can't verify something (e.g. a sandbox can't reach authed routes), say so explicitly.

**D.1.2 The test runner is the source of truth for counts.**
Cite the runner's own summary line (e.g. vitest's "Tests N passed"), never `grep -c` or eyeballed
per-file counts. **Paste the runner's literal summary lines verbatim; never retype or paraphrase them.**
Copy both the `Test Files X passed (Y)` and `Tests N passed (M)` lines exactly as printed, including any
`X failed |` prefix. *(Origin: Sprint A0, a gate paraphrased 411-passed/0-failed when the runner said
404-passed/1-failed.)* A non-zero `failed` count must be addressed in the gate: fixed, or shown to be
pre-existing by reproducing it on the base commit.

**D.1.3 A tool reporting success is not verification.**
A migration tool printing "Migrations applied" means nothing without an independent domain check.
Always verify the actual effect.

**D.1.4 Don't assume features or routes exist.**
Before proposing a smoke check that uses a feature or route, confirm it exists in the code, or phrase
it conditionally.

### D.2: Sequencing and scoping

**D.2.1 Discovery-first when the shape is unknown.**

**D.2.2 Honest assessment over false confidence.** State assumptions. Ask the cheapest diagnostic
question first. Treat user pushback as signal. Be specific about what you read vs skimmed.

**D.2.3 Novel work needs rendering/feedback before commitment.** Treat the first render of anything
novel as a decision point, not a confirmation. Checkpoint isolation makes reverting clean.

**D.2.4 Implementation orientation surfaces details the design conversation couldn't.** Budget for an
orientation Q&A round before the first checkpoint.

**D.2.5 Size and group work coherently.** Don't bundle a critical correctness fix with a large new
integration. Don't make a tiny contained fix wait for a sprint.

### D.3: Consumer and blast-radius discipline

**D.3.1 When introducing a new vocabulary, audit every consumer.** Status vocabularies, display-label
modules, enums: grep every component that displays the related data, look for siblings with their own
internal vocabulary, audit by data flow. Most likely missed: list tables, kanban columns, filter chips,
modals, export text, dashboard segments.

**D.3.2 When introducing or changing tokens, audit hardcoded values.** Grep for hardcoded equivalents
(hex/rgb literals, inline styles). Check framework defaults. Check portaled components: CSS vars don't
cascade through portals. Never hardcode a value that has a token equivalent.

**D.3.3 Audit consumers of any changed contract before committing.**

### D.4: Migration and infrastructure safety

**D.4.1 Verify branch state before any database operation.** Current branch, recent commits, available
migrations. Three commands, always.

**D.4.2 Migrations need an explicit application + verification step.** Build the migration, apply it
via the documented mechanism, verify with an independent domain check, only then deploy for smoke.

**D.4.3 Diagnose local before remote.**

**D.4.4 Know your tooling's silent-failure modes.** Seen with Drizzle: "Migrations applied" printed with
zero work done; `drizzle-kit push` syncing schema without creating the tracking table; auto-generated
enum-redefinition migrations being broken. Always check tool output against an independent query.

### D.5: Communication and conduct

**D.5.1 Hotfixes are fine; ignoring them is not.** A visible production bug caught in smoke is
hotfixed before the next session starts. Scope is strictly the bug. Branch off main.

**D.5.2 Never infer the user's state.** Don't include inferred facts about the user's schedule,
location, energy, intent or next steps in prompts or conversation. Describe the work, not the user.

---

## E. Smoke discipline

- Scale smoke to risk.
- Name the specific things to look at, with expected outcomes and "report back if X" conditions.
- Smoke the correct surfaces (D.1.4).
- The first render of anything novel is a decision point (D.2.3).

---

## F. Between-session / between-checkpoint loop

1. Verify the verification gate.
2. Optional GitHub spot-check.
3. PR title + description.
4. For migration-bearing work: apply migration before the smoke deploy (D.4.2).
5. Merge to main.
6. Auto-deploy.
7. Production smoke.
8. If a gap is caught: hotfix before the next session (D.5.1).
9. Begin next work.

If a session surfaces something genuinely unexpected, pause and raise it.
