# Verification gate: checkpoint γ8 (Google Calendar), plus backlog 24

Status: **complete.** Every check passes. No real Google Calendar call was made from this session (none was possible: it holds no Google token of Amir's). The first real call is in the production smoke. Per CLAUDE.md the PR is opened and merged, and the production smoke list is at the end.

## Git state

```
Branch: claude/hopeful-carson-fzy00j (pushed). Restarted from main 31287db (γ7 merged), same name.
Commits since main, before this gate:
73221b0 γ8.5: Calendar stand-in and Playwright specs, cron route test, In sync badge
c3e0b8c γ8.1 to γ8.4: Calendar client, events, one-way sync, Connections row, daily cron, client short name, backlog 24
71e7866 Record γ8 orientation approval
65800a4 Add γ8 orientation report
0ecdc61 γ8 handoff: Google Calendar
Status: clean working tree before this gate was written.
```

## LOC delta

Code and tests, excluding `docs/`, `pnpm-lock.yaml` and `drizzle/meta`: `47 files changed, 1545 insertions(+), 48 deletions(-)`. The orientation estimated about 1,600.

## Test count

Vitest, on `73221b0`:
```
 Test Files  42 passed (42)
      Tests  393 passed (393)
```
Playwright, on the same code (the run before `73221b0`, which only added the cron route's Vitest file):
```
  86 passed (2.5m)
```
Delta from γ7 (40 files, 363 tests; 80 Playwright):
- **Vitest:** +30 tests (363 to 393), +2 files:
  - `calendar.test.ts`: events per status, IDs, hashes, the client against a fake Calendar, and the sync and resync on Postgres;
  - the cron route test.
  - `learn.test.ts` gained 2 tests for backlog 24; `clients.test.ts` gained 1 for the short name.
- **Playwright:** +6 tests (80 to 86), all in the new `google-calendar.spec.ts`.
  - `auth.spec.ts` now expects the two Calendar scopes in the sign-in request.
  - `settings.spec.ts` checks that Reconnect Google asks for Calendar, and finds the Google row by exact text (it had also matched the new Google Calendar row).

The Vitest line above was printed on `73221b0` with the cron route test included; the earlier run in this session printed `Tests  391 passed (391)` across 41 files, before that file was added.

## Typecheck and lint

`pnpm typecheck` and `pnpm lint` exit 0, with no warnings. Playwright builds the app with `pnpm build` before every run, so the production build passed as well.

## Migrations

`drizzle/0007_calendar.sql` (13 statements). It is safe for the live version: one new table (`calendar_deletions`), and nullable columns on `app_settings` (the calendar choice, sync user, last sync and last error), `posts` (`calendar_hash`, `calendar_synced_at`, `calendar_error`), `clients` (`short_name`) and `ai_calls` (`unstored`). The live γ7 version ignores all of them.

**Local:** applied to `bfm_test`, 8 migrations applied. The first generation failed locally with "foreign key constraint … cannot be implemented: uuid and text" (`users.id` is text); `calendar_user_id` was changed to text and the migration regenerated before anything reached Neon.

**Neon dev** (host checked first: `ep-square-mode-zatw6e39-pooler.c-2.eu-west-2.aws.neon.tech`).
- **Rehearsal:** `--rehearse 0007_calendar` ran before the migration and finished with the pre-migration list, verbatim as kept:
  ```
    2 58801d2dc19d 1792542524859
    3 9b771848e2a2 1792547861813
    4 019250fdfb17 1792588397103
    5 a8bd56f19ad4 1792607618124
    6 f20cc06f07cd 1792761166850
    7 5172477ca12c 1792765592866
  ```
  I piped it through `tail -6`, so its first lines (statement count, tables inside the transaction, "Rolled back.") were not kept. A second rehearsal after the migration printed `Rehearsal: 13 statements from drizzle/0007_calendar.sql, inside BEGIN ... ROLLBACK` and then `relation "calendar_deletions" already exists`, as expected once applied.
- **Migration,** verbatim:
  ```
  Driver: neon-serverless (WebSocket, port 443, one transaction)
  Migrator finished.
  Public tables: accounts, ai_calls, app_settings, batches, calendar_deletions, clients, critic_verdicts, derivatives, google_tokens, knowledge_versions, post_drafts, post_generations, post_publications, post_specs, post_versions, posts, project_pillars, project_wix, projects, publish_events, review_events, rule_candidates, sessions, site_pages, users
  Applied migrations: 8
    1 bc9dce5f5136 1792531354466
    2 58801d2dc19d 1792542524859
    3 9b771848e2a2 1792547861813
    4 019250fdfb17 1792588397103
    5 a8bd56f19ad4 1792607618124
    6 f20cc06f07cd 1792761166850
    7 5172477ca12c 1792765592866
    8 752b99cf6900 1792768806191
  ```
- **Independent check,** a separate script reading `information_schema` and `pg_constraint`, verbatim:
  ```
  column: ai_calls.unstored jsonb nullable=YES
  column: app_settings.calendar_error text nullable=YES
  column: app_settings.calendar_error_at timestamp with time zone nullable=YES
  column: app_settings.calendar_id text nullable=YES
  column: app_settings.calendar_name text nullable=YES
  column: app_settings.calendar_synced_at timestamp with time zone nullable=YES
  column: app_settings.calendar_user_id text nullable=YES
  column: calendar_deletions.attempts integer nullable=NO
  column: calendar_deletions.created_at timestamp with time zone nullable=NO
  column: calendar_deletions.error text nullable=YES
  column: calendar_deletions.event_id text nullable=NO
  column: calendar_deletions.post_id uuid nullable=NO
  column: clients.short_name text nullable=YES
  column: posts.calendar_error text nullable=YES
  column: posts.calendar_hash text nullable=YES
  column: posts.calendar_synced_at timestamp with time zone nullable=YES
  constraint: calendar_deletions_pkey PRIMARY KEY (post_id)
  constraint: app_settings_calendar_user_id_users_id_fk FOREIGN KEY (calendar_user_id) REFERENCES users(id) ON DELETE SET NULL
  row counts: {"posts":"24","posts_unsynced":"24","deletions":"0","calendar_id":null,"unstored":"0"}
  ```

**Production:** not run from this session. It runs in the Vercel production build of the merge, after a Neon backup branch, as before.

## What was built

- **Scopes:** `calendar.calendarlist.readonly` and `calendar.events.owned` join `GOOGLE_SCOPES`. Reconnect Google grants them; until then the Calendar row says "Calendar needs connecting" and every pass is skipped quietly. Drive is untouched.
- **Events** (`src/lib/calendar-events.ts`, pure):
  - all-day, transparent (they do not block time);
  - titled "<short name> · SEO · <topic>", "… · Planned slot" or "… · Missed slot";
  - the description has the status in words, the project, spec notes, the app link, and the live link once published;
  - colours come from `post-status.ts`, as approved;
  - the ID is `bfm` plus the post UUID, and each event carries the private tag `bfmApp=brandfactory-marketing`.
- **Sync** (`src/lib/calendar-sync.ts`):
  - in the app only, through `after()`;
  - after the 19 post, slot, batch, project and client actions, and throttled to one pass a minute on Home, Calendar, Run plan, Posts and the post page;
  - a post is sent when its event hash differs from the one last sent, or its last attempt failed;
  - `reconcileSlots` queues each deleted slot's event in `calendar_deletions`;
  - every error is recorded on the post and on Connections, and never thrown to the action;
  - at most 100 changes per pass, four calls in flight, rate limits retried after 1, 2 and 4 seconds.
- **Sync calendar now:** lists the calendar's own copy of the app's events (by the tag) and puts it right: creates, patches anything different, restores an event deleted in Google, and deletes the app's orphans. The button repeats while anything remains.
- **Daily cron:** `vercel.json` runs `/api/cron/calendar` at `30 5 * * *` (UTC), which is 05:30 in winter and 06:30 in summer time (backlog 26). The route refuses without `CRON_SECRET` (503) or with the wrong one (401). The sign-in guard skips `/api/cron`, since the route checks its own secret.
- **Client short name:** an optional field on the client form, falling back to the name's first word.
- **Backlog 24:**
  - A candidate run that drops anything saves the dropped candidates, each with its reason ("already waiting" with the matched candidate's ID, "not a place a suggestion can go", "empty text", "over the limit of 5"), in `ai_calls.unstored`.
  - An unreadable reply is saved raw, cut to 20,000 characters.
  - The cost line reads, for example, "Rule and fact suggestions (1 not added: already waiting)". Clean runs save nothing.

## Consumer audit (D.3.3)

- **`GOOGLE_SCOPES`:** the sign-in and Reconnect Google request (both through `src/auth.ts`), `describeScope` on Connections (two new plain names), `auth.spec.ts` and `settings.spec.ts`. The Google stand-in's token now grants the Calendar scopes; Drive specs are unaffected.
- **`POST_STATUSES` gained `google`, and `MISSED` gained `google`:** read only by `buildEvent`. Every other consumer reads `label`, `tone` or `calendar`, which are unchanged (the post-status drift test passes).
- **Post-changing code paths:** every place that changes a post's status, date or topic (`slots.ts`, `batches.ts`, `review.ts`, `generation.ts`, `live-check.ts`, `covers.ts`, `publish.ts`) is covered by the hash check. The ones in app actions sync straight away; the two inside Trigger.dev tasks (`generation.ts` finishing a run, `live-check.ts` confirming) sync on the next page view or the daily cron (backlog 27).
- **`reconcileSlots`:** both delete statements now return IDs and queue their events; its callers (`createProject`, `updateProjectSettings`) run it inside their transactions, so the queue row commits with the deletion.
- **`ClientInput.shortName`:** optional, so existing callers (tests, seeds) are unchanged; the form, the header's edit values and `parseClientInput` set it.
- **`pendingCandidateKeys` now returns a Map** (key to candidate ID): its only consumer is `learn.ts`.
- **Test resets** (`src/test/db.ts`, `e2e/fixtures.ts`) clear `calendar_deletions` and the calendar choice.

## What was verified vs code-inspection only

**Verified (how):**
- Events, IDs, colours, missed and published, the short name, the hash (Vitest).
- The client against a fake Calendar API: create, 409 then patch, restore after a Google delete, delete already gone, rate-limit backoff, refusal not retried (Vitest).
- The sync on Postgres:
  - the fill;
  - nothing sent when nothing changed;
  - topic and move;
  - pause deletions keeping the topic slot;
  - a failure recorded and repaired;
  - the invalid-grant pause;
  - the resync restoring edited and deleted events, removing an orphan, and leaving an untagged event untouched;
  - the 100-change limit;
  - a calendar switch making everything due (Vitest).
- In the real app against the stand-in:
  - needs connecting;
  - only owned calendars offered;
  - choosing fills the calendar after the response;
  - Sync calendar now;
  - a topic and a move reach the event;
  - a Google 500 leaves the topic saved and shows the error on Connections, then Sync calendar now repairs it;
  - the short name retitles events (Playwright).
- Screens looked at: `g8-calendar-needs-connecting`, `g8-calendar-connected`, `g8-calendar-error` at desktop, and `g8-mobile-connections` at 390px. Nothing scrolls sideways at 390px (Playwright).
- Backlog 24: dropped candidates with reasons and the matched ID, an unreadable reply cut to 20,000 characters, the cost line wording, a clean run saving nothing (Vitest).

**Code-inspection only (needs smoke):**
- **Real Google Calendar:** the request shapes follow Google's Calendar v3 reference, but no real call was made. In particular:
  - that "BrandFactory Content" appears with `minAccessRole=owner`;
  - that Google accepts the custom `bfm…` event IDs;
  - that `privateExtendedProperty` filtering finds them;
  - that the event colours look as intended.
- **`after()` on Vercel:** verified in `next start` locally (Playwright); the smoke shows it on Vercel.
- **The daily cron:** registered by `vercel.json` on deploy; its first run is the morning after `CRON_SECRET` is set.
- **Re-consent with Google's granular consent screen:** if Amir unticks a Calendar box, the row stays "Needs connecting" (the stored scope check), but that screen itself was not exercised.

## Deliberately unchanged / out of scope

Reading anything back into the app, invitations, reminders, runs and derived posts (Phase 2), scheduled publishing (Phase 3). The event ID is derived, not stored.

## Backlog

- **Closed 7** (Google Calendar) and **24** (unstored candidate replies).
- **Added 26:** the cron's fixed UTC time shifts by an hour in summer.
- **Added 27:** changes made inside Trigger.dev tasks reach the calendar at the next page view or the daily cron.

## Smoke instructions for Amir

1. **Before or right after the merge, set `CRON_SECRET` in Vercel Production:**
   - Vercel, project marketing, Settings, Environment Variables;
   - name `CRON_SECRET`, a long random value (for example the output of `openssl rand -hex 32`), Production only, Sensitive.
   - Vercel only gives new variables to new deployments. If you add it after the merge's deployment is live, redeploy that deployment once (Deployments, the latest Production one, Redeploy).
   - The cron runs at 05:30 UTC: 06:30 UK time until the clocks go back on 25 Oct, then 05:30. Report back if the first run after you set the secret does not update "Last synced" on Connections.
2. **Settings, Connections, Google Calendar** reads "Calendar needs connecting". Press **Reconnect Google** and allow both Calendar permissions. The Google row's access list then names "Your calendar list, read only" and "Events on calendars you own", and Drive still works (a cover picker opens).
3. **Pick "BrandFactory Content"** and press Use this calendar. Report back if it is not in the list; we then switch to `calendar.events`, as agreed.
4. **Press Sync calendar now.** In Google Calendar, every Migss slot appears as an all-day event, for example "Migss · SEO · Planned slot" in Graphite, missed past slots in Tangerine, topics in Lavender, approved in Blueberry, published in Basil. Report back if any colour reads wrongly.
5. **Set a topic** on an empty slot on the Run plan, and **move another slot.** Within a few seconds both events change (title and date).
6. **The published wet room post** shows as "Migss · SEO · Wet room maintenance week by week" in Basil, with "Status: Published" and its live link in the description.
7. **On your phone**, open that event and tap its "Open in BrandFactory Marketing" link; it opens the post's page in the app.
8. **Optional:** add an event of your own to BrandFactory Content, press Sync calendar now, and check it is left alone.

## What the next checkpoint picks up

Phase 2 (runs and derived posts on post records, which the calendar already follows), backlog 25 to 27.

---

**PR opened and merged per CLAUDE.md; production smoke list above.**
