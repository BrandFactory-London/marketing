# Handoff: Phase 1, checkpoint γ2 (CRM, projects, knowledge and Settings)

You are the implementation agent for BrandFactory Marketing. A separate Claude chat reviews your orientation report and verification gate. Amir approves each step.

## Where things stand

γ1 is merged (`4dd4dd1`, PR #1) and smoked on preview and production: Google sign-in for one allowed account, Drive read access with encrypted tokens, the signed-in shell with the prototype's navigation, migrations verified on the Neon dev and production branches, and the app pinned to `lhr1` next to the database. Read `docs/gate-cp1.md` for the details and `docs/backlog.md` for open items.

Environments: the build session's cloud environment has the Neon **dev** branch as `DATABASE_URL`. Production migrations run only from a separate, short-lived session whose environment holds the production string, and only on Amir's go-ahead.

## Read first

`CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 7, 8, 13, 15 and 16 matter most here), `docs/scope.md`, `docs/backlog.md`, `design/system/README.md`, and these prototype screens in `design/prototype/`: `Main.dc.html` (Home), `CRM.dc.html`, `Client.dc.html`, `Projects.dc.html`, `Project.dc.html`, `Settings.dc.html`. `docs/model-test/knowledge-pack.md` shows the shape of all three knowledge tiers.

## Your first deliverable: the γ2 orientation report

Write it using `docs/templates/orientation-report.md`, post it, and **stop**. Write no code until Amir approves it.

## γ2 scope

Goal: Amir can create a client, add a project under it, write and version all three knowledge tiers, and set the AI models, all on screens that match the prototype.

0. **Backlog item 6 first.** Move Neon migrations to a route that runs inside a transaction over port 443 (for example the `neon-serverless` WebSocket driver), with tests, before any γ2 migration runs on Neon. γ2 must not merge until this is done.
1. **CRM page.** List clients. Create and edit a client (fields per the prototype; keep them minimal). Show each client's project count and packages.
2. **Client page.** The client's projects, a posts area (empty state until γ4), and the **client knowledge** tier: named Markdown sections (business facts, voice, examples, counter-examples), editable, and versioned on save (decision 7).
3. **Projects page and Home gallery.** Project cards with a plain cover (live screenshots are Phase 2), the client name, package and an Active or Paused pill. Clicking a card opens the project. Home shows the same gallery; the two-week calendar on Home stays an empty state until γ3.
4. **Project page.** The tab structure from the prototype. In γ2:
   - **Knowledge tab:** the **project knowledge** tier (ideal customer profiles, project facts, CTA, allowed internal links), versioned like the client tier.
   - **Settings tab:** name, client, site URL, package (Entry, Mid or Premium), Active or Paused, publishing target (Wix Blog; credentials arrive in γ6), and the Drive folder (paste a link or ID; the app extracts the ID and checks it can list the folder with the stored Google token).
   - **Sitemap tab:** import the page list from the site's `sitemap.xml` (decision 8): URL and title per page, stored per project, with a re-import action. The visual sitemap is Phase 2.
   - **Content and performance tab and Run plan tab:** empty states (Phase 2 and γ3).
5. **Settings.**
   - **BrandFactory rules:** the agency tier, versioned like the others. Rule-candidate triage arrives in γ5.
   - **AI models:** read and write the `app_settings` row through `src/lib/settings.ts`, with writer, critic and derivative chosen from `src/config/models.ts`.
   - **Connections:** show the Google connection (connected account, scopes, last refresh) with a reconnect action. Wix and Anthropic rows can show "Not connected yet".
6. **Knowledge versioning.** One storage shape for all three tiers. Every save creates a new version; old versions are kept and can be viewed. Later checkpoints will record which version of each tier a post used, so expose a way to read "the current version" and "version N".
7. **Backlog housekeeping.** Add: "Google Calendar connection (later phase). Needs the Calendar API enabled on the existing Google project and a Calendar scope added to sign-in. Purpose to settle before building, for example showing publishing slots on Amir's calendar. Raised by Amir, 20 Oct." Also add an item to style the 404 page with the design system.

## Questions to settle in orientation

- **Q1. Packages and slots.** Packages are set here, but calendar slots come in γ3 (decision 15). Propose what γ2 stores so γ3 can generate slots without a schema change.
- **Q2. "Draft from site".** Decision 8's crawl that drafts knowledge needs the Anthropic API key, which arrives before γ4. Lean: defer the button to γ4 and keep γ2 to manual editing. Confirm or propose otherwise.
- **Q3. Seeding Migss.** Lean: no seed script. Amir creates the Migss Interiors client and the "Migss Interiors website" project through the UI at smoke, and pastes the three tiers from `docs/model-test/knowledge-pack.md` (with real figures replacing the placeholders where he has them). Confirm, or propose a one-off import that runs only with his go-ahead.
- **Q4. Knowledge editor.** Plain Markdown text areas per section, or a Markdown editor with preview. Lean: text areas now; decision 17's Markdown editor arrives in γ5 for posts.
- **Q5. Migration shape and the transactional route.** List the new tables and how backlog item 6 will be proven before the γ2 migration touches the Neon dev branch.

## Out of scope for γ2

Calendar slots and the Posts page (γ3), batch spec and generation (γ4), Review and rule candidates (γ5), Wix credentials and publishing (γ6), the "Draft from site" crawl unless Q2 says otherwise, and every Phase 2 or 3 item.

## Closing γ2

Close with a verification gate using `docs/templates/verification-gate.md`, including the migration on the Neon dev branch (with Amir's go-ahead and his independent SQL check) and numbered smoke steps: create the Migss client and project, paste and version each knowledge tier, import the sitemap, set the Drive folder, change the AI models, and check Connections. The production migration for γ2 runs from a separate session on Amir's go-ahead, after the smoke and before merge.
