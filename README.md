# BrandFactory Marketing

Internal content engine for BrandFactory London. Turns stored client and project knowledge into SEO blog posts, checked by a critic model and approved by Amir, then publishes them to the client's site (Wix Blog first). Generates GMB and LinkedIn copy from approved posts.

Status: Phase 1 build starting. See `docs/design-decisions.md` and `docs/scope.md`.

Stack: Next.js (App Router) on Vercel, pnpm, Neon Postgres with Drizzle, Auth.js with Google, Anthropic TypeScript SDK, Trigger.dev, Google Drive API, Wix REST API.

Working instructions for Claude Code are in `CLAUDE.md`.

## Run locally

```
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # Vitest
pnpm typecheck
pnpm lint
pnpm test:e2e     # Playwright: builds, starts on port 3100, saves screenshots to e2e/screenshots/
```
