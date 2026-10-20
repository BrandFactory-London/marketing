# Backlog

Items raised during implementation. Disagreements with locked design decisions go here rather than reopening them.

| # | Raised | Item | Notes |
|---|---|---|---|
| 1 | γ1 orientation | Update `design/system/components/Sidebar/README.md` to the prototype's nav: Home, Calendar, CRM, Projects, Posts, Review queue, then a Settings section (BrandFactory rules, AI models, Connections). | The README still lists Home, Clients, Batches, Review queue, Settings. The app follows the prototype (Amir, γ1 orientation Q6). |
| 2 | γ1 orientation | Consider loading Plus Jakarta Sans with `next/font` instead of the bundle's Google Fonts `@import`. | γ1 keeps the `@import` so the design system CSS stays unchanged. Revisit if the fallback-font flash on load is noticeable. |
| 3 | γ1 orientation | Remove the Drive proof page (`/dev/drive-check`) before Phase 1 ends. | Hidden whenever `DRIVE_PROOF_FOLDER_ID` is unset. Keep the Google token helper for γ5. |
| 4 | γ1.1 | The design system README reserves aurora colours for generating surfaces, but the prototype's brand mark uses `aurora-peach`. | The app follows the prototype. Decide whether the README or the mark should change. |
| 5 | γ1 gate | Match the Vercel function region to the Neon database region. | Vercel defaults to `iad1` (US East). The Neon database is in `eu-west-2` (London), confirmed by the γ1 connection test, so set the function region to `lhr1`. |
