# BrandFactory Marketing: v1 scope

20 Oct 2026. Source of record: the Claude Docs doc "BrandFactory Marketing: v1 Scope". This file is a copy for the implementation session. Where it and `docs/design-decisions.md` differ, the design decisions win, because they came later.

## Purpose

BrandFactory Marketing is an internal web app that turns each client's stored knowledge into scheduled, on-brand content, then publishes it after Amir approves it. It replaces Notion for marketing content work.

Guiding principle: this is a content engine with just enough project structure. It is not a general project management tool. Tasks, docs and boards are out of scope.

## Locked decisions

| Decision | Choice |
| --- | --- |
| Audience | Internal only, single operator (Amir). No client logins or billing |
| Topics | Amir chooses every topic. No keyword research or topic suggestion |
| Post spec | Set per batch through a form, turned into a spec per post, confirmed by Amir before any writing |
| Images | Each project links a Google Drive folder holding its photos. Amir picks one cover photo per post |
| Crawl limit | Up to 50 pages per site |
| Publishing targets | Wix Blog in Phase 1. A posts feed for the BrandFactory site comes in Phase 3 |
| Approval | Every post goes through Amir before publishing. No auto-publish |
| Job runner | Trigger.dev |
| Run mode | Immediate in v1. Monthly batch at half price later |
| AI models | Opus 5.5 default writer and critic; changeable in Settings and per batch; writer and critic may differ |
| Projects | Clients own projects. Projects is the main navigation. Amir adds projects manually. v1 starts with one: Migss Interiors website |
| Knowledge tiers | BrandFactory rules (Settings), Client facts and voice (client page in CRM), Project ICPs, facts and site pages (project page). No separate Knowledge page |
| CRM and packages | CRM page for clients. Packages per project: Entry 1, Mid 2, Premium 3 SEO posts a week. Active projects get planned calendar slots at that cadence; Amir fills in topics |
| Calendar | All posts across projects, colour-coded by status; planned slots can be generated from it. Home shows the next two weeks |
| Posts page | Every written post, filterable by status and client |
| Editing from the project page | Run plan entries and knowledge only; live posts are not edited from the app |
| Phase 2 items | GA4 and Search Console per project, Optimise links in Review, visual sitemap tab, Home gallery with live site screenshots |

## Pages (see `design/prototype/`)

Home (project gallery, two-week calendar), Calendar, Projects, Project (tabs: Content and performance, Sitemap, Run plan, Knowledge, Settings), Posts, CRM, Client, Settings, plus the flow screens: Batch spec, Confirm spec, Generating, Review, Post, Links (Phase 2), Publish.

## Generation pipeline

Writer drafts with the cached knowledge pack, the confirmed spec and the existing page list. Scripted checks run. A separate critic call scores the draft against a rubric built from the pack. A failed draft returns to the writer with fix notes, up to two rounds, then it is flagged for Amir. Nothing publishes without Amir's approval. Amir's edits become rule candidates.

## Wix Blog (Migss Interiors)

From reading `migssinteriorsfrontend` at commit `6287c4c` (code inspection):

- Blog and resources pages read the Wix Blog at request time and refresh every 60 seconds. `/blog/[slug]` accepts slugs published after the last deploy. Publishing into the Wix Blog is enough; no frontend change is needed.
- Pillar pages filter by tag slugs `bathroom-renovation` and `kitchen-renovation`. The adapter must set the right tag.
- The page meta description comes from the post excerpt, not Wix SEO fields.
- The renderer supports paragraphs, headings, bulleted and numbered lists, quotes, images, galleries, video, tables, buttons, bold, italic, underline and links. Generated content must stay inside that set.

Live test on 20 Oct 2026 (approved by Amir, then cleaned up):

| Step | Result |
| --- | --- |
| Author member ID | Required; the known Migss member exists |
| Tag lookup | `bathroom-renovation` resolved by slug |
| Cover image import | Worked from a public image URL (Wix Media Import File) |
| Rich content | Built directly as Wix rich content (Ricos) JSON; headings, bold, link, both list types and a quote rendered |
| Markdown converter API | Refused (403) for the credential used |
| Create and publish | Worked in one call (create draft post with publish: true, memberId, tagIds, excerpt, seoSlug, media.wixMedia.image.id) |
| Live site | Post appeared at `/blog/<slug>` with title, excerpt as meta description, cover, tag and body |

Consequences: build Ricos JSON in the app. Drive photos are private, so download and upload them to Wix. Tables were not tested.

## Stack

Next.js on Vercel with pnpm; Neon Postgres with Drizzle; Auth.js with Google restricted to Amir; Anthropic TypeScript SDK; Trigger.dev; Google Drive API; Wix REST API; publishing secrets encrypted per project.

## Data model sketch

| Entity | Holds | Belongs to |
| --- | --- | --- |
| Agency rules | BrandFactory-wide writing rules and banned phrases; versioned | None |
| Client | Name, business facts, voice rules, examples, counter-examples; versioned | None |
| Project | Name, site URL, package, active or paused, publishing target and settings, Drive folder, GA4 property, Search Console site | Client |
| Project knowledge | ICPs, project facts, CTA, allowed links; versioned | Project |
| Site page | URL and title from the sitemap | Project |
| Slot / run plan item | Date, topic, status | Project |
| Batch | Form answers: slots, length, CTA, FAQ choice, pillar, models, notes | Project |
| Post spec | Topic, keyword, angle, outline, links, length, CTA, FAQ | Batch |
| Post | Title, slug, excerpt, body, cover (Drive file), tags, status, version, knowledge versions used | Post spec |
| Review event | Action, note, diff of Amir's edits | Post |
| Rule candidate | Proposed rule and the tier it would join | Review event |
| Derivative | Channel, body, status | Post |
| Publish event | Target, external ID, live URL, result | Post |

## Build phases

| Phase | Goal | Contents |
| --- | --- | --- |
| 1 | Migss posting live | CRM, clients and client knowledge; projects with package, status, knowledge and settings; calendar slots; batch spec, confirm, generate, review, Drive cover, publish to Wix; Posts page; Settings (rules, models, connections); GMB and LinkedIn copy; sitemap page list |
| 2 | Insight and SEO tools | GA4 and Search Console; Optimise links; visual sitemap; Home screenshots |
| 3 | Automation | Monthly batch at half price with scheduled publishing; BrandFactory posts feed; GMB and LinkedIn API posting |

Open discovery item: Google Drive access (sign-in with Drive read permission, listing a folder's photos, passing a chosen photo to Wix). Proven during γ1 and γ5.
