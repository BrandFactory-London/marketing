# Handoff: Phase 1, checkpoint γ6 (publish to Wix and derivatives)

You are the implementation agent for BrandFactory Marketing. A separate Claude chat reviews your orientation report. Amir approves the orientation; after that you build, test, merge and give him a short production smoke list (CLAUDE.md, "How we work").

## Where things stand

γ5 is live in production (`f79f4dd`, PR #7, gate in `docs/gate-cp5.md`). Its production smoke passed in full: placeholders blocked approval until filled, the cover picker browsed real Drive subfolders, the smoke post ("Wet room maintenance week by week") was approved with a cover from Bathrooms and the Bathroom Renovation pillar, and rule candidates were accepted and dismissed in Settings. Trigger.dev Production runs deploy `f79f4dd` with 4 tasks. That approved post is the one γ6's production smoke publishes for real.

γ6 is the last Phase 1 checkpoint. After it, Amir runs the first real Migss month.

## Read first

`CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 6 on encrypted per-project credentials, 10 on Markdown to Wix rich content, 13, 18, 19 and 20 above all, and the Phase 3 list: scheduled publishing is not in Phase 1), `docs/scope.md` ("Wix Blog (Migss Interiors)": the publish test, the field list and its consequences), `docs/backlog.md` (items 3, 20 and 21), `docs/gate-cp5.md`, `src/config/post-status.ts`, the scripted checks and `src/prompts/`, and these prototype screens in `design/prototype/`: `Publish.dc.html`, `Post.dc.html`, `Posts.dc.html`, `Settings.dc.html` (Connections).

Use the Wix REST documentation for the Blog (Draft Posts, Tags, Members) and Media Manager (upload URL) APIs. The scope's publish test went through the Wix connector, not an API key, so confirm every request shape against the docs and say in the orientation which ones you could not confirm.

## Your first deliverable: the γ6 orientation report

Write it using `docs/templates/orientation-report.md`, post it, and **stop**. Write no code until Amir approves it.

## γ6 scope

Goal: Amir publishes an approved post to the client's Wix blog with one button, the app confirms it is live, and he gets GMB and LinkedIn copy from it.

1. **Wix credentials (decision 6).** Per project: Wix API key, account ID and site ID, entered on the project's settings, stored encrypted with the existing AES-GCM helper, never shown again in full. A Wix row on Connections with a real check (for example listing the site's blog tags) that shows Connected or the error Wix returned.
2. **Markdown to Wix rich content (decision 10).** A small mdast-based converter to Ricos JSON, limited to what the Migss renderer showed in the publish test: headings, paragraphs, bold, italic, links, both list types and quotes. Anything else (tables, images in the body, raw HTML) is refused with a clear message before anything is sent, not silently dropped. Fixture tests per node type.
3. **Publish (decisions 18 and 19).** "Publish post" on an approved post. In order: download the chosen cover from Drive, upload it to Wix Media through an upload URL, resolve the pillar tag by slug (`bathroom-renovation` or `kitchen-renovation`), create the post with publish set, with the author member, tag, excerpt, slug and cover. Record a publish event with the Wix post ID and the live URL.
4. **Live check (decision 19).** Fetch the live URL and confirm the title appears before marking the post Published. The Migss blog refreshes from Wix every 60 seconds, so the check retries for a bounded time. If it never confirms, the post shows that Wix accepted it but the live page was not confirmed, with a "Check again" action, never Published.
5. **Publishing failures.** Each step can fail separately (cover download, upload, create, live check). Amir sees which step failed and Wix's message, and retrying must not create a second Wix post. Propose how (see Q4).
6. **Publish now only.** Publishing happens when Amir clicks. Scheduled publishing on the slot's date is Phase 3 (design decisions, Phase 3 list) and stays out.
7. **Derivatives (decision 20).** From an approved or published post, generate a GMB post and a LinkedIn post with the derivative model from Settings, run them through the same scripted checks that apply (dashes, banned phrases, length limits for each platform), and show them with copy buttons and an edit box. Record each call's cost as for posts.
8. **Fact suggestions from regenerate notes.** A regenerate note can state a fact the knowledge does not hold (the γ5 critic now accepts it as Amir's). When a note does, propose adding it to the client or project knowledge as a candidate in Settings, triaged like rule candidates. Reuse the rule-candidate shape if it fits.
9. **Posts page and calendar.** Published posts link to their live URL; the calendar and Home show the Published status from `src/config/post-status.ts`.
10. **Phase 1 housekeeping.** Remove the Drive proof page (backlog 3). Add a duplicate check for pending rule candidates (backlog 21) if it is small; otherwise leave it filed.

## Questions to settle in orientation

- **Q1. Wix API key and IDs.** What Amir creates in Wix (the permissions needed for Blog, Tags, Members and Media), where each value goes in the app, and how the app finds the author member ID (the scope says the Migss member exists).
- **Q2. Converter.** The parser, the exact node mapping, how links are marked, and what Amir sees if a post contains something the converter refuses.
- **Q3. Cover upload.** Drive download size limits, the Media upload flow and its folder in Wix Media, and whether a cover already uploaded is reused on a retry.
- **Q4. Idempotency.** How a retried or double-clicked publish avoids a second Wix post (for example recording the Wix draft ID before publishing, or looking the slug up first), and what happens if the slug already exists on Wix.
- **Q5. Live check.** Where it runs (a Trigger.dev task is the lean, so the browser can leave), how long it retries, and what counts as confirmed.
- **Q6. Derivatives.** The prompts, the platform length limits and checks, one call or two, the cost, and whether they are stored as versions Amir can edit.
- **Q7. Fact suggestions.** How a fact is detected in a note, which tier it proposes, and the cost.
- **Q8. Tables.** The migration for Wix credentials, publish events, derivatives and fact candidates, safe for the live version per CLAUDE.md.
- **Q9. Testing without publishing.** How Vitest and Playwright cover the Wix calls without touching the real site, and whether any real Wix call is made from this session before merge. Lean: none that publishes. A read-only call (tags or members) is fine if Amir has given the session a key.

## Out of scope for γ6

Scheduled publishing, the monthly batch run and GMB or LinkedIn API posting (Phase 3). Editing or unpublishing a post after it is published. Draft from site (backlog 15). Social media packages and Google Calendar (later phases).

## Closing γ6

Close with a verification gate using `docs/templates/verification-gate.md`, including the Neon dev migration and its independent check, the converter's fixture tests, one real derivative run with its cost, and phone-width screenshots. Then merge and give Amir a short production smoke list. Amir has chosen to smoke with the real approved post: enter the Wix credentials for Migss and check the Wix connection, publish "Wet room maintenance week by week" for real, confirm the app marks it Published only after the live check, open the live page and check the title, excerpt as meta description, cover, pillar tag and body formatting, then generate and copy its GMB and LinkedIn posts. Say in the smoke list that the publish step makes the post public on the Migss blog.
