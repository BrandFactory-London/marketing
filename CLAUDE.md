# BrandFactory Marketing

Internal web app for BrandFactory London: turns client knowledge into SEO blog posts (plus GMB and LinkedIn copy), which Amir approves before they publish to the client's site. Single operator. First project: the Migss Interiors website (Wix Blog).

## Read before any work

1. `docs/methodology.md`: how BrandFactory Labs builds software. The disciplines are load-bearing.
2. `docs/design-decisions.md`: the locked Phase 1 design. Do not relitigate it; raise disagreement as a backlog item.
3. `docs/scope.md`: the v1 scope, Wix findings and data model.
4. The handoff for the current checkpoint in `docs/` (for example `docs/handoff-cp1.md`).

## How we work

- Every implementation session opens with an orientation report (`docs/templates/orientation-report.md`) and stops for Amir's approval before any code is written.
- Work is split into γ-checkpoints. Each closes with a verification gate (`docs/templates/verification-gate.md`) and stops for Amir's smoke.
- One branch per checkpoint, PR to main. Do not merge without Amir's go-ahead.
- Never claim something works unless it was verified. Say plainly what was checked visually and what was only read in code.
- Paste test runner summary lines verbatim. Never grep or retype counts.
- Drizzle: generate and migrate only, never push. Confirm every migration with an independent query.
- Ask before anything hard to reverse: pushing to main, merging, running migrations against a shared database, deleting data.
- Describe the work, never the user's state.

## Writing rules (code comments, UI copy, docs, prompts)

- Never use em dashes. Use a comma, a full stop or a hyphen.
- British English. Sentence case for UI text. Buttons are a verb plus an object ("Approve post").
- Follow `design/system/README.md` for content, colour, type, space and motion rules.

## Layout

- `design/system/`: the BrandFactory Marketing design system (tokens.css, components/bundle.css, per-component README and preview). The app uses this CSS directly; no Tailwind, no shadcn (design decision 2).
- `design/prototype/`: the approved clickable prototype as design canvas files (`*.dc.html`). They reference styles at `ds/bfm/`, which is the same content as `design/system/`. Treat them as the visual and workflow reference for every screen.
- `docs/model-test/`: the knowledge pack, drafts, critic reports and check script from the model test.
