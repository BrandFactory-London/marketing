# Handoff: Phase 1, checkpoint γ1 (foundation)

You are the implementation agent for BrandFactory Marketing. A separate Claude chat reviews your orientation report and verification gates. Amir approves each step.

## Read first

`CLAUDE.md`, then `docs/methodology.md`, `docs/design-decisions.md`, `docs/scope.md`, `design/system/README.md`, and the prototype navigation in `design/prototype/Nav.dc.html` and `design/prototype/Main.dc.html`.

## Environment check (do this before anything else)

Run `pnpm view next version` (or `npm view next version`). If the package registry cannot be reached, stop and tell Amir that this environment's network access must allow package registries (Trusted, or Custom with the defaults). Do not try to work around a blocked host.

For running migrations from the session, the environment also needs `*.neon.tech` allowed and `DATABASE_URL` set as an environment variable. If either is missing, say so in the orientation and propose running migrations another way.

## Your first deliverable: the γ1 orientation report

Write it using `docs/templates/orientation-report.md`, post it, and **stop**. Write no code until Amir approves it.

## γ1 scope

Goal: a deployed, signed-in app shell that matches the prototype's navigation, built on the design system, with the foundations later checkpoints need.

1. **Scaffold.** Next.js with the App Router, TypeScript (strict), pnpm, ESLint, Vitest. `.env.example` listing every variable used.
2. **Styles.** Bring `design/system/tokens.css` and `design/system/components/bundle.css` into the app unchanged as the styling layer. No Tailwind, no shadcn, no hardcoded colour or spacing values that have a token (D.3.2). Decide in orientation whether the Plus Jakarta Sans font stays as the bundle's Google Fonts import or moves to `next/font`.
3. **UI components.** React wrappers for the design system components the shell needs (at least Sidebar, Button, Card, Badge, Field). Add the others (Cover, Stepper, AIPanel) when a checkpoint needs them.
4. **App shell.** Sidebar navigation with glyph icons, matching the prototype: Home, Calendar, Projects, Posts, CRM, Settings. One route per item, each with its page title and an empty state. No feature work on these pages yet.
5. **Sign-in.** Auth.js (lean: v5) with the Google provider.
   - Only the address in `ALLOWED_EMAIL` (hello@brandfactorylondon.com) may sign in. Anyone else is refused.
   - Scopes: openid, email, profile and `https://www.googleapis.com/auth/drive.readonly`, with offline access so a refresh token is issued.
   - The Google refresh token must be stored encrypted (AES-GCM, key from `APP_ENCRYPTION_KEY`). Note in orientation that the Auth.js Drizzle adapter writes OAuth tokens to its accounts table in plain text, and propose how to avoid storing the refresh token unencrypted.
   - Every route except the sign-in page and the auth API requires a session.
6. **Database.** Drizzle with Neon. γ1 tables: the auth tables, an encrypted Google token table, and an app settings table holding the default writer, critic and derivative model IDs (default `claude-opus-5-5` for all three). Model IDs come from one config file listing `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`. Use `drizzle-kit generate` and `migrate`, never `push`. Do not run a migration against a shared database without Amir's go-ahead.
7. **Encryption helper.** AES-GCM encrypt and decrypt with tests, used for the Google token now and Wix credentials in γ6.
8. **Drive proof (discovery item).** After sign-in, a minimal server check that lists file names in one Drive folder ID given in an env var, or a dev-only route, to prove the Drive scope and token refresh work. Propose the exact shape in orientation. Remove or hide it before Phase 1 ends.

## Questions to settle in orientation

- **Q1.** Auth.js v5 with database sessions (lean), or JWT sessions. Include how the encrypted refresh token is stored and refreshed.
- **Q2.** Test tooling: Vitest for logic, plus Playwright screenshots for visual checks (Chromium may be pre-installed; check). Explain how you will screenshot authenticated pages without adding an auth bypass to production code.
- **Q3.** Font loading (see Styles).
- **Q4.** Branching: lean is a first commit on main already exists (docs only), then branch `cp1-foundation`, PR to main after the gate, merge only on Amir's go-ahead.

## Out of scope for γ1

CRM, projects, knowledge, calendar, generation, review, publishing and every Phase 2 or 3 item. Statuses are introduced in γ3; note that design decision 16 and the design system README use different status words, and γ3's orientation proposes one mapping.

## Accounts Amir is setting up for the γ1 smoke

Vercel project linked to this repo, a Neon database, and a Google OAuth client (Web application) with the Google Drive API enabled. Redirect URL: `https://<vercel-domain>/api/auth/callback/google`. If any are missing when you reach the smoke, write the code and tests anyway and list what Amir needs to provide.

## Closing γ1

Close with a verification gate using `docs/templates/verification-gate.md`: literal git output, runner summary lines pasted verbatim, typecheck and lint, migrations and their independent check, the consumer audit, what was verified visually versus only read in code, and numbered smoke steps for Amir (for example: sign in with the allowed account; confirm a different Google account is refused; click every nav item; confirm the Drive proof lists the folder's files). Then stop.
