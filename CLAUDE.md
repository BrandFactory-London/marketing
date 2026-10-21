# BrandFactory Marketing

Internal web app for BrandFactory London: turns client knowledge into SEO blog posts (plus GMB and LinkedIn copy), which Amir approves before they publish to the client's site. Single operator. First project: the Migss Interiors website (Wix Blog).

## Read before any work

1. `docs/methodology.md`: how BrandFactory Labs builds software. The disciplines are load-bearing.
2. `docs/design-decisions.md`: the locked Phase 1 design. Do not relitigate it; raise disagreement as a backlog item.
3. `docs/scope.md`: the v1 scope, Wix findings and data model.
4. The handoff for the current checkpoint in `docs/` (for example `docs/handoff-cp1.md`).

## How we work

- Every implementation session opens with an orientation report (`docs/templates/orientation-report.md`) and stops for Amir's approval before any code is written. This is the only planned stop: there are no mid-checkpoint check-ins and no preview smoke.
- Work is split into γ-checkpoints. Each closes with a verification gate (`docs/templates/verification-gate.md`).
- One branch per checkpoint, PR to main. Once typecheck, lint, build, Vitest and Playwright all pass and the gate is written, open the PR and merge it yourself. Then give Amir a short, numbered production smoke list. A production bug found in that smoke is fixed straight away on a new branch (methodology D.5.1).
- Never claim something works unless it was verified. Say plainly what was checked visually and what was only read in code.
- Paste test runner summary lines verbatim. Never grep or retype counts.
- Drizzle: generate and migrate only, never push. Confirm every migration with an independent query.
- Migrations, from γ4 on:
  - Neon **dev** (the build session's `DATABASE_URL`): migrate it yourself, no go-ahead needed. Confirm the host is `ep-square-mode-zatw6e39` first, rehearse (`--rehearse <tag>`), migrate, then run the independent check, and put the outputs in the gate.
  - Neon **production**: never from a session. Migrations run automatically in the Vercel production build, in one transaction, after a backup branch of production is created. If the backup or the migration fails, the build fails and the previous version stays live.
  - Every migration must be safe for the version that is still live while the new one builds: add columns and tables freely; split a rename, a drop or a new NOT NULL on an existing table across two checkpoints.
- Still ask before anything else that is hard to reverse: deleting data (including Neon backup branches), force-pushing main, changing production settings in Vercel, Neon or Trigger.dev.
- Describe the work, never the user's state.

## Writing rules (code comments, UI copy, docs, prompts)

- Never use em dashes. Use a comma, a full stop or a hyphen.
- British English. Sentence case for UI text. Buttons are a verb plus an object ("Approve post").
- Follow `design/system/README.md` for content, colour, type, space and motion rules.

## Layout

- `design/system/`: the BrandFactory Marketing design system (tokens.css, components/bundle.css, per-component README and preview). The app uses this CSS directly; no Tailwind, no shadcn (design decision 2).
- `design/prototype/`: the approved clickable prototype as design canvas files (`*.dc.html`). They reference styles at `ds/bfm/`, which is the same content as `design/system/`. Treat them as the visual and workflow reference for every screen.
- `docs/model-test/`: the knowledge pack, drafts, critic reports and check script from the model test.
