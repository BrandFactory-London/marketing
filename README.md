# BrandFactory Marketing

Internal content engine for BrandFactory London. Turns stored client and project knowledge into SEO blog posts, checked by a critic model and approved by Amir, then publishes them to the client's site (Wix Blog first). Generates GMB and LinkedIn copy from approved posts.

Status: Phase 1 build starting. See `docs/design-decisions.md` and `docs/scope.md`.

Stack: Next.js (App Router) on Vercel, pnpm, Neon Postgres with Drizzle, Auth.js with Google, Anthropic TypeScript SDK, Trigger.dev, Google Drive API, Wix REST API.

Working instructions for Claude Code are in `CLAUDE.md`.

## Run locally

```
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # Vitest; set TEST_DATABASE_URL to a local Postgres for the database tests
pnpm typecheck
pnpm lint
pnpm test:e2e     # Playwright: builds, starts on port 3100, saves screenshots to e2e/screenshots/
pnpm db:generate  # after a schema change; never drizzle-kit push
pnpm db:migrate   # applies migrations, then prints an independent check; refuses remote databases without --remote;
                  # Neon targets run over HTTPS (port 443), local ones over node-postgres
```

Database tests and Playwright expect a local Postgres with migrations applied, at `postgres://postgres@localhost:5433/bfm_test` unless `TEST_DATABASE_URL` says otherwise.
