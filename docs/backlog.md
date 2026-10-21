# Backlog

Items raised during implementation. Disagreements with locked design decisions go here rather than reopening them.

| # | Raised | Item | Notes |
|---|---|---|---|
| 1 | γ1 orientation | Update `design/system/components/Sidebar/README.md` to the prototype's nav: Home, Calendar, CRM, Projects, Posts, Review queue, then a Settings section (BrandFactory rules, AI models, Connections). | The README still lists Home, Clients, Batches, Review queue, Settings. The app follows the prototype (Amir, γ1 orientation Q6). |
| 2 | γ1 orientation | Consider loading Plus Jakarta Sans with `next/font` instead of the bundle's Google Fonts `@import`. | γ1 keeps the `@import` so the design system CSS stays unchanged. Revisit if the fallback-font flash on load is noticeable. |
| 3 | γ1 orientation | Remove the Drive proof page (`/dev/drive-check`) before Phase 1 ends. | Hidden whenever `DRIVE_PROOF_FOLDER_ID` is unset. Keep the Google token helper for γ5. |
| 4 | γ1.1 | The design system README reserves aurora colours for generating surfaces, but the prototype's brand mark uses `aurora-peach`. | The app follows the prototype. Decide whether the README or the mark should change. |
| 5 | γ1 gate | Match the Vercel function region to the Neon database region. | Vercel defaults to `iad1` (US East). The Neon database is in `eu-west-2` (London), confirmed by the γ1 connection test, so set the function region to `lhr1`. Done in γ1: `vercel.json` pins `regions` to `lhr1`. |
| 6 | γ1 gate | Move Neon migrations to a transactional route over port 443, for example the `neon-serverless` WebSocket driver (`drizzle-orm/neon-serverless`), before production holds real data, and at the latest before γ2 merges. | **Done in γ2.0 (`1b2e9ee`).** `scripts/migrate-lib.ts` uses `neon-serverless` over WebSocket (port 443); Drizzle runs all pending migrations in one transaction. Tested through a local WebSocket relay, including partial-failure rollback. `--rehearse <tag>` runs one migration inside `BEGIN ... ROLLBACK`. |
| 7 | γ2 handoff | Google Calendar connection (later phase). Needs the Calendar API enabled on the existing Google project and a Calendar scope added to sign-in. Purpose to settle before building, for example showing publishing slots on Amir's calendar. | Raised by Amir, 20 Oct. |
| 8 | γ2 handoff | Style the 404 page with the design system. | The app shows Next.js's default "This page could not be found." page. |
| 9 | γ2 orientation | Let the allowed internal links section pick paths from the imported sitemap. | γ2 keeps it a Markdown list typed or pasted by hand; the Knowledge tab links to the Sitemap tab. |
| 10 | γ2.2 | Unknown client or project pages show the not-found page with HTTP status 200, not 404. | The pages stream (Cache Components), so `notFound()` runs after the status line is sent. Harmless for a signed-in internal tool; revisit with item 8 if a real 404 status matters. |
| 11 | γ2 smoke | For γ5: cover picker must browse subfolders. Each project's Drive folder is a parent (e.g. Migss Interiors) with photos in subfolders such as Bathrooms and Kitchens. The γ2 check counts subfolders as files. | Raised by Amir at the γ2 smoke. |
