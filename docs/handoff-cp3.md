# Handoff: Phase 1, checkpoint γ3 (calendar slots, statuses and the Posts page)

You are the implementation agent for BrandFactory Marketing. A separate Claude chat reviews your orientation report and verification gate. Amir approves each step.

## Where things stand

γ2 is merged (`41dbc40`, PR #2) and smoked on preview, with its migration verified on the Neon dev and production branches. The app has clients, projects (package, Active or Paused, site, Drive folder), three versioned knowledge tiers, a sitemap page list per project, AI model settings and a Connections page. Migss Interiors is set up as a client with one project, "Migss Interiors Website", on the Premium package. Read `docs/gate-cp2.md` and `docs/backlog.md`.

Environments, as before: the build session's `DATABASE_URL` is the Neon **dev** branch. Production migrations run only from a separate session in the `marketing-production-migrations` environment, on Amir's go-ahead, after the smoke and before merge. The γ2 sequence is the model: `--check-only`, then `--rehearse <tag>`, then the real migration, each output pasted verbatim, then Amir's SQL check.

## Read first

`CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 15 and 16 above all, then 14), `docs/scope.md`, `docs/backlog.md`, `src/config/packages.ts`, `design/system/README.md` (its fixed status words), and these prototype screens in `design/prototype/`: `Calendar.dc.html`, `Main.dc.html` (the Home two-week calendar), `Posts.dc.html`, `Project.dc.html` (the Run plan tab), `Projects.dc.html` (card badges).

## Your first deliverable: the γ3 orientation report

Write it using `docs/templates/orientation-report.md`, post it, and **stop**. Write no code until Amir approves it.

## γ3 scope

Goal: every active project has planned slots on the calendar at its package's cadence, Amir can give each slot a topic and move its date, and one status vocabulary drives every surface that shows a post.

1. **Slots (decision 15).** An active project gets planned slots on its package's weekdays (`src/config/packages.ts`), kept eight weeks ahead. Amir can move a slot's date. Pausing removes the project's future empty slots and keeps any slot with a topic. Changing the package changes future empty slots to match and keeps slots with topics.
2. **One post record per slot.** A slot is the start of a post: the same record later carries the spec (γ4), the draft (γ4), review (γ5) and publishing (γ6). Propose the table shape so γ4 to γ6 add columns or child tables without reshaping it.
3. **Status vocabulary (decision 16 and D.3.1).** One module defines every post status, its display word and its badge tone, and every surface reads from it. Decision 16's states: planned, topic set, spec confirmed, generating, in review, approved, published, plus flagged and rejected. The design system README fixes the display words as Draft, Spec ready, Writing, Checking, Needs review, Approved, Published, Failed. Propose one mapping (see Q3).
4. **Calendar page.** Month view of every slot and post across projects, colour-coded by status, as in the prototype. Clicking an empty slot lets Amir set or change its topic. Clicking a slot that has a topic opens it. "Generate from planned slots" belongs to γ4: leave it out or disabled, per Q8 of γ2 (nothing fake on screen).
5. **Home.** The two-week calendar from the prototype, reading the same data.
6. **Project page, Run plan tab.** The project's upcoming slots as a list: date, topic, status, with set topic and move date.
7. **Posts page.** Every post that has started (topic set or later), filterable by status and client. Until γ4 writes drafts it lists topics only; show what is real.
8. **Project cards.** The "Next in run plan" badge deferred from γ2 (date and topic of the next slot, or "No topic yet").
9. **Backlog housekeeping.** Update the design system README's status words to whatever mapping Amir approves, or file it, and mark any items this checkpoint closes.

## Questions to settle in orientation

- **Q1. Keeping slots eight weeks ahead.** No scheduled job exists yet. Lean: generate idempotently whenever a project becomes active or changes package, and top up whenever the calendar, Home or Run plan is read; no cron. Confirm, or propose Vercel Cron if a read-time top-up has a real drawback.
- **Q2. Moved slots and regeneration.** If Amir moves Tuesday's slot to Wednesday, the generator must not create a new Tuesday slot. Propose how a slot remembers the cadence date it was generated for.
- **Q3. Status mapping.** Decision 16's states against the design system's display words. Name each state's word and tone, say whether "Writing" and "Checking" are display words for the generating state's two steps, and whether Flagged and Rejected become "Failed" or get their own words. If the README should change, say how.
- **Q4. Past slots.** What happens to an empty slot whose date has passed: kept as missed, hidden, or rolled forward. Lean: kept and shown as missed on the calendar, never auto-moved.
- **Q5. Topic entry.** Topic only, or topic plus an optional keyword at this stage. Decision 14 puts the keyword in the spec (γ4). Lean: topic only now.
- **Q6. Migration.** The new table or tables, and confirmation the dev and production migrations follow γ2's sequence.

## Out of scope for γ3

Batch spec and generation, including "Generate from planned slots" (γ4); pillar tags (γ4); Review and rule candidates (γ5, including backlog item 11, the cover picker browsing subfolders); Wix publishing and derivatives (γ6); Google Calendar (backlog item 7, later phase); every Phase 2 or 3 item.

## Closing γ3

Close with a verification gate using `docs/templates/verification-gate.md`, including the migration on the Neon dev branch (rehearsal and real run, each with Amir's go-ahead and his SQL check), phone-width screenshots of the new screens, and numbered smoke steps: Migss shows three slots a week for eight weeks on the calendar and Home; set a topic; move a slot and confirm no duplicate appears; pause the project and confirm empty future slots go while topic slots stay; switch to Mid and back; the Posts page and card badge show the topic. The production migration for γ3 runs from a separate session on Amir's go-ahead, after the smoke and before merge.
