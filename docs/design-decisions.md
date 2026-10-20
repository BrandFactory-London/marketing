# BrandFactory Marketing: Phase 1 design decisions

20 Oct 2026. Status: **approved by Amir on 20 Oct 2026 and locked.** Later disagreement goes to the backlog rather than reopening a decision.

Source of record: the Claude Docs doc "BrandFactory Marketing: Phase 1 design decisions". This file is a copy for the implementation session.

## Conversation context

- **What this is.** Phase 1 of BrandFactory Marketing: the core loop live for Migss, from planned calendar slot to a published Wix post, with GMB and LinkedIn copy.
- **Inputs.** The v1 scope (`docs/scope.md`), the approved prototype (`design/prototype/`) and design system (`design/system/`), the Wix publish test (in the scope), and the model test (`docs/model-test/`).
- **Repo.** BrandFactory-London/marketing. The build runs in a Claude Code session, with checkpoints, verification gates and Amir's smoke between them. A separate Claude chat reviews orientation reports and gates.

## Pass 1: Architecture

#### 1. App framework
**Decision:** Next.js with the App Router, TypeScript and pnpm, deployed on Vercel from main.
**Reasoning:** This is the Labs standard and matches the scope doc. No new hosting.

#### 2. Styling
**Decision:** Use the BrandFactory Marketing design system's own tokens.css and component CSS as the styling layer, wrapped in React components. No Tailwind and no shadcn.
**Reasoning:** The design system already defines the components the prototype uses. Using its CSS directly avoids the hardcoded-value and framework-default drift that methodology D.3.2 warns about.

#### 3. Database
**Decision:** Neon Postgres with Drizzle. Schema changes go through drizzle-kit generate and migrate, never push. Each migration is checked with an independent query.
**Reasoning:** Labs standard. D.4.4 records push and migrate silently doing nothing.

#### 4. Sign-in and Google access
**Decision:** Auth.js with Google, allowing only hello@brandfactorylondon.com. The same Google sign-in asks for read-only Drive access, and the refresh token is stored encrypted. GA4 and Search Console scopes are added in Phase 2.
**Reasoning:** One Google connection covers sign-in and the cover photo picker, so Drive needs no separate setup.

#### 5. Background jobs
**Decision:** Trigger.dev runs one job per post: writer, scripted checks, critic, and up to two fix rounds. Each step writes its status to the database, and the Generating screen polls it.
**Reasoning:** A long post with a critic loop can run for several minutes, which is longer than a Vercel request allows.

#### 6. Secrets
**Decision:** Publishing credentials (Wix API key, account ID, site ID) are stored per project, encrypted with AES-GCM using an app key held in Vercel env vars.
**Reasoning:** Matches the scope doc and keeps credentials out of the code.

## Pass 2: Knowledge and generation

#### 7. Knowledge storage
**Decision:** Each tier is stored as named sections of Markdown text. Saving creates a new version, and every post records which version of each tier it was written with.
- BrandFactory rules (in Settings): writing rules and banned phrases.
- Client (on the client page): business facts, voice, examples and counter-examples.
- Project (on the project page): ideal customer profiles, project facts, CTA, and allowed internal links.

**Reasoning:** The model test ran on exactly this shape and it worked (see `docs/model-test/knowledge-pack.md`). Versions make an odd post traceable to the knowledge it used.

#### 8. Site pages and crawl
**Decision:** The project's page list comes from its sitemap.xml and is used for duplicate checks and the allowed links list. A "Draft from site" button crawls up to 50 pages and asks Claude to propose client and project knowledge, which Amir edits before saving.
**Reasoning:** The sitemap is complete and cheap to read. The crawl only drafts knowledge, so nothing unreviewed reaches the writer.

#### 9. Knowledge pack and caching
**Decision:** The system prompt holds the three tiers plus the output format, marked for prompt caching. The post spec and the existing page list go in the user message. The critic gets the same pack plus its rubric.
**Reasoning:** It is the pattern from the scope doc, and every post in a batch reuses the cached pack.

#### 10. Writer output
**Decision:** The writer returns Markdown with an Excerpt line, as in the model test. The app converts that Markdown into Wix rich content itself, limited to the nodes the Migss renderer supports.
**Reasoning:** The format is proven. The Wix converter refused the credential in the test.

#### 11. Checks and critic
**Decision:** Every draft first goes through scripted checks: dashes, banned patterns, links outside the allowed list, word count, excerpt length and the FAQ rule. These are a TypeScript port of `docs/model-test/check.py`. The critic model then returns a structured verdict: pass or fail, issues with quotes, and scores. A failed draft goes back to the writer with the issues listed. After two fix rounds, a failed post is flagged for Amir rather than retried.
**Reasoning:** Scripted checks cost nothing and never miss a dash. Structured output lets Review show each issue against its line.

#### 12. Prompt fixes from the model test
**Decision:** Bake in three rules. Ban the "your X, your Y and your Z" and "more X, more Y, more Z" patterns by name, especially in the CTA. Never describe a client process, policy or customer pattern the knowledge does not state. The critic treats spec items as hard checks: the opening the spec asks for, a headed CTA, and the contact link.
**Reasoning:** The model test showed every writer shares these faults.

#### 13. Models
**Decision:** Opus 5.5 (`claude-opus-5-5`) is the default writer, critic and derivative model, set in Settings with an override on each batch. Model IDs are stored as plain strings chosen from a list kept in one config file (also offer `claude-sonnet-5-5` and `claude-haiku-5-5`).
**Reasoning:** Locked after the model test. One config file means adding a new model is a one-line change.

#### 14. Post specs
**Decision:** The batch form takes the selected slots with their topics, plus length, CTA, FAQ choice, pillar tag and notes. The writer model turns each slot into a spec: keyword, angle, outline headings and the internal links to use. Amir edits or confirms each spec, and nothing is written until he does.
**Reasoning:** This matches the locked post spec decision, and the outline gives Amir something concrete to confirm.

## Pass 3: Workflow and data

#### 15. Calendar slots
**Decision:** An active project gets planned slots on fixed weekdays for its package: Entry on Tuesday; Mid on Tuesday and Thursday; Premium on Monday, Wednesday and Friday. Slots are kept eight weeks ahead, and Amir can move a slot's date. Pausing a project removes its future empty slots but keeps any slot that has a topic.
**Reasoning:** Predictable weekdays read clearly on the calendar. The eight-week window covers the monthly planning that is coming later.

#### 16. Post status
**Decision:** A post moves through these statuses: planned, topic set, spec confirmed, generating, in review, approved, published. A post can also be flagged (it failed the critic twice) or rejected. One status list drives every surface: calendar colours, pills, filters and the Home calendar.
**Reasoning:** One status list avoids the vocabulary drift that D.3.1 warns about.

#### 17. Review and rule candidates
**Decision:** Review shows the draft in a Markdown editor beside a live preview, with the critic's issues listed. Approve, reject with a note, and regenerate with a note are all available. When Amir approves, his edits are saved as a diff, and Claude proposes rule candidates from the diff. Amir accepts or dismisses them in Settings.
**Reasoning:** A Markdown editor keeps the conversion to Wix exact. The candidates are only proposals, so nothing changes the rules without Amir.

#### 18. Cover photo
**Decision:** Review lists photos from the project's Drive folder as thumbnails. On publish, the app downloads the chosen photo and uploads it to Wix Media through an upload URL.
**Reasoning:** Drive files are private, so the public-URL import used in the test will not work for them.

#### 19. Publishing to Wix
**Decision:** The app calls the Wix REST API directly. A publish sets the author member, the pillar tag by slug, the excerpt (which becomes the meta description), the SEO slug and the cover. A publish event records the Wix post ID and the live URL. After publishing, the app fetches the live URL and confirms the title appears before marking the post published.
**Reasoning:** This is the path proven in the test. Checking the live page means a post is not marked published just because Wix accepted it (D.1.3).

#### 20. Derivatives
**Decision:** From an approved post, a GMB post and a LinkedIn post are generated, checked against the same rules, and shown with copy buttons.
**Reasoning:** This is the locked copy-only scope for Phase 1.

## Out of scope for Phase 1

- **GA4 and Search Console, Optimise links, the visual sitemap tab, live screenshots on Home.** These are Phase 2. Until then, Home cards use a plain cover.
- **Monthly batch run, scheduled publishing, the BrandFactory posts feed, GMB and LinkedIn API posting.** These are Phase 3.
- **Editing live posts, links from existing posts to new ones.** Deferred in the scope doc.
- **Any second user or client login.** The app is internal and single-operator.

## Deferred to implementation orientation

- **Trigger.dev version and its Vercel setup.** Lean: current major version, deployed with its own CLI.
- **Markdown parser for the Wix conversion.** Lean: a small mdast-based converter with fixture tests per node type.
- **Wix credential.** The test used the Wix connector. The app needs a Wix API key with Blog and Media permissions, from Amir's Wix account. To confirm before checkpoint 6.
- **Test tooling.** Lean: Vitest for pure modules (checks, conversion, slot generation, pack assembly) and Playwright screenshots for visual checks, alongside Amir's smoke.
- **Status words.** Decision 16's status list and the design system README's status words ("Draft, Spec ready, Writing, Checking, Needs review, Approved, Published, Failed") differ. Orientation for the checkpoint that introduces statuses proposes one mapping for Amir to confirm.

## Cross-cutting concerns

- **Checkpoints.** γ1 foundation: scaffold, styles, sign-in, schema and app shell with navigation. γ2: CRM, projects, the three knowledge tiers and Settings. γ3: calendar slots and the Posts page. γ4: batch spec and generation. γ5: Review, rule candidates and the Drive cover picker. γ6: Wix publish and derivatives. Then the first real Migss run.
- **Accounts Amir sets up.** Before γ1 can be smoked: a Vercel project linked to the repo, a Neon database, and a Google OAuth client with the Drive API enabled. Before γ4: an Anthropic API key and a Trigger.dev project. Before γ6: the Wix API key. Code can be written and tested before these exist, but sign-in, generation and publishing can only be smoked once they do.
- **Verification.** Each gate pastes the literal git output and test runner lines, and says what was checked visually and what was only read in code.

## Handoff

Next step is the implementation session. Prompt: `docs/handoff-cp1.md`. Read this document, `docs/scope.md` and `docs/methodology.md` before starting.
