# Handoff: Phase 2, session A (the run workflow)

You are the implementation agent for BrandFactory Marketing. A separate Claude chat reviews your orientation report. Amir approves the orientation; after that you build, test, merge and give him a short production smoke list (CLAUDE.md, "How we work").

Phase 2 is built in three grouped sessions. This is session A, the run workflow. Session B (knowledge entries, the inbox, proof, the gap grid, Search Console and GA4) and session C (knowledge chat, MCP server) follow. Design session A so B and C can build on it without reshaping it.

## Where things stand

Phase 1 and its follow-ups are live (`c98d6bd`, γ8): CRM, three knowledge tiers with channel sections, package-cadence slots, batches with confirmed specs, writer and critic, review, the learning loop, Drive covers, Wix publishing with a live check, GBP, LinkedIn, Facebook and Pinterest copy, and Google Calendar sync. Read the gates, `docs/gate-cp1.md` to `docs/gate-cp8.md`, as needed.

**Production is in real use.** On 23 Oct 2026 the Migss project ("Migss Interiors Marketing Website", now on the Mid package) was seeded by hand with 14 SEO posts on Tuesdays and Thursdays from 27 Oct to 17 Nov, two per day (bathroom and kitchen, the second with no cadence date). Several are being generated now. "Wet room maintenance week by week" is published. Every change in this session must keep those posts, their drafts, reviews, publications, derivatives and calendar events intact and working while the new version builds and after it ships.

## Read first

- `CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md`, `docs/backlog.md`.
- The scope doc's **Build phases** and **Phase 2 in detail** sections. They are in the Claude Doc "BrandFactory Marketing App: v1 Scope", not in the repo. The design is summarised below; ask in the orientation if anything there is unclear.
- `src/config/packages.ts`, `src/lib/slots.ts`, `src/config/post-status.ts`, the batch and spec code (`src/lib/batches*`, `src/prompts/spec.ts`), `src/lib/derivatives.ts`, `src/lib/calendar-sync.ts` and `calendar-events.ts`, `src/lib/learn.ts`, the project pages under `src/app/(app)/projects/`, the Calendar and Home pages, and `trigger.config.ts` and the Vercel cron route.
- The prototype screens in `design/prototype/` that touch projects, the run plan, the calendar and batches. There is no prototype for runs, the planner or the client link: follow the design system and say in the orientation what layout you propose.

## The design (agreed with Amir, 23 Oct 2026)

**Knowledge layers.** BrandFactory content rules (global style, anti-AI writing and quality rules) apply to everything. Client knowledge holds business facts and preferences. The project holds its website, facts, rules, brand voice and ICP. Session A does not restructure knowledge (session B does); it only moves where things are shown (item 2).

**Runs.** A run is a block of content for one project: a duration of 1 to 3 months, an amount per channel, and priority notes (for example "big SEO push" or "testimonial push"). Package rules move from the project to the run; Entry, Mid and Premium become **run presets** that prefill a run's configuration. A project can have a high-volume run followed by a low-volume one.

**The workflow:**
1. **Configure the run:** duration, amounts per channel, priority notes.
2. **Generate the slots:** typed placeholders on the calendar ("SEO post 3", "LinkedIn post 3"). **Derived posts are children of an SEO post**, never standalone, but are scheduled on their own days (for example SEO on Monday, Wednesday and Friday, derived posts the next day).
3. **Arrange:** Amir changes the cadence and days, for example "SEO every Monday, Tuesday and Friday, Instagram the next day, GBP every Wednesday and Sunday", and moves individual slots.
4. **Plan:** the planner fills each SEO slot with a title and short excerpt, using the project's knowledge, the topics already covered (published posts and the sitemap) and the run's priority notes, and says why each item is there. Amir approves, or regenerates an item or the whole plan with feedback. Feedback feeds the learning loop like any other note.
5. **Client link:** the plan is sent to the client as a private, read-only link (no sign-in, no costs or internal notes, print-friendly). The client can approve the plan, suggest changes, or comment on each item. Client comments become suggestions in Settings (source: client), triaged like any other. **Client approval is recorded, never required:** Amir activates the run whenever he decides.
6. **Generate fortnightly:** once the run is active, every two weeks the app generates the posts dated in the fortnight that starts two weeks out, so 2 to 4 weeks of posts are always ready. It uses Anthropic's Message Batches API at half price. "Generate now" covers urgent posts. **Approving the plan replaces per-post spec confirmation:** the spec is drafted from the planned title and excerpt and recorded as before, without Amir confirming it. Amir still reviews every post, and publishing stays on his click. The calendar shows what has been generated and when the next generation runs.

**The project page has four tabs:**
- **Details:** the curated profile (positioning, brand voice, ICP), project settings, and connectors such as Wix, all editable.
- **Run plan:** the current run, its plan, scheduled, current and past posts, and past runs.
- **Content and performance:** filled by session B (Search Console, GA4). In session A, show what is real: published posts with their live links. Nothing fake.
- **Knowledge** (name to be settled): the project's knowledge and sitemap as today, until session B replaces it.

## Session A scope, as internal checkpoints

Each checkpoint ends with its own gate section, a merge and a short production smoke for Amir, as γ5 to γ8 did. The orientation covers all four, and is the only planned stop.

- **A1. Runs and slots.** The run model, presets, typed slots with derived children, cadence rules per content type, arranging and moving, the run configuration screen. **Migss's existing posts become Run 1**, with nothing lost. Project packages stop driving slots; the package column is removed only in a later checkpoint (CLAUDE.md: split a drop across two checkpoints). Google Calendar shows derived slots with their own type in the title.
- **A2. The four-tab project page.** Move existing content into Details, Run plan, Content and performance and Knowledge, without losing any current function.
- **A3. The planner and the client link.** Planning, item and whole-plan regeneration with notes, plan approval, the client link with approve, suggest and comment, client comments into suggestions, recorded client approval, activation.
- **A4. Fortnightly generation.** The schedule, the batch API, auto-drafted specs from the approved plan, derived posts generated once their parent SEO post is approved, "Generate now", and generation state on the calendar.

## Questions to settle in orientation

- **Q1. The run model.** Tables for runs, per-channel amounts and cadence rules; how a slot records its run, content type and parent; what happens at a run's end and between runs; whether two runs can overlap.
- **Q2. Derived slots against derivatives.** Today a derivative is a version of channel copy attached to a post (`derivatives`). How a derived slot (a dated calendar placeholder) relates to those versions, without reshaping γ6 and γ7's derivative flow.
- **Q3. Migrating Migss to Run 1.** How the existing posts, including the two-per-day seeded posts without a cadence date and the published post, become Run 1, and how the package-driven slot generator is retired safely while the live version still uses it.
- **Q4. Cadence and arranging.** How rules per content type are expressed ("SEO Mon, Tue, Fri; Instagram the day after; GBP Wed and Sun"), how changing them regenerates only empty placeholders, and how moves are kept.
- **Q5. The planner.** Prompt, inputs (knowledge, published topics, sitemap, priority notes), model and effort, output per item (title, excerpt, pillar, category, reason), cost per plan, regeneration of one item against the whole plan, and how it avoids repeating published topics.
- **Q6. The client link.** Token design, expiry and revoking, what the client sees, how approve, suggest and comment are stored and shown to Amir, protection against abuse on a public route, and the print layout.
- **Q7. Fortnightly generation.** The schedule (Vercel Cron runs daily in UTC; how a fortnight is decided), the Message Batches API flow (submit, poll, collect, failures, partial results), cost recording at batch prices, how auto-drafted specs are shown, and what "Generate now" does.
- **Q8. Statuses.** New statuses or display lines for runs, plans and slots, all in `src/config/post-status.ts` or a sibling module, so one vocabulary drives every surface (D.3.1).
- **Q9. Migrations.** Every migration safe for the live version per CLAUDE.md, with the order across A1 to A4. Keep the **full** rehearsal output for the gate this time (γ8 kept only the tail).
- **Q10. What session B needs from A.** Name the seams B will build on: where knowledge is read for the planner, where performance data will plug in, and how the Knowledge tab will be replaced.

## Out of scope for session A

Knowledge entries, the inbox, proof from Wix Projects, the gap grid, Search Console and GA4 (session B). Knowledge chat and the MCP server (session C). Scheduled publishing, posting to social platforms and Instagram visuals (Phase 3).

## Closing each checkpoint

A verification gate using `docs/templates/verification-gate.md` for each of A1 to A4: the Neon dev migration with its full rehearsal output and independent check, real runs where a model is called (a real plan in A3, a real batch generation in A4) with their costs, and phone-width screenshots. Then merge and give Amir a short production smoke list before starting the next checkpoint.
