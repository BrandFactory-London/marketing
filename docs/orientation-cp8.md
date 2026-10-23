# Orientation: checkpoint γ8 (Google Calendar), plus backlog 24

23 Oct 2026. Written from the template in `docs/templates/orientation-report.md`. No code has been written.

Read in full:
- `docs/handoff-cp8.md` (this branch's first commit, `0ecdc61`, identical to `224739a` on `docs/handoff-cp8`);
- `CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 4, 6, 15 and 16), `docs/backlog.md` (items 7 and 24), `docs/gate-cp7.md`;
- `src/auth.ts`, `src/lib/google-tokens.ts`, `src/lib/slots.ts`, `src/config/post-status.ts`, `src/lib/jobs.ts`, the Connections page, `e2e/google-standin.mjs`, `src/lib/learn.ts` (for backlog 24).

Skimmed: `src/lib/drive.ts` (the client pattern and its errors), `src/lib/connections.ts` (exports), `src/app/(app)/_actions/slots.ts`, where `ensureSlots` and `reconcileSlots` are called (Home, Calendar, Run plan, `src/lib/projects.ts`), the `posts`, `clients` and `app_settings` tables, `design/system/tokens.css` (status colours).

**Google facts** come from Google's developer documentation, looked up on 23 Oct 2026 (sources under Q1). No call was made to Google Calendar.

**Additional scope (your request):** backlog 24. When a candidate run gets a reply it cannot store, the reply is saved with the run (Q8).

## 1. Branch state

```
$ git branch --show-current
claude/hopeful-carson-fzy00j
$ git log --oneline -3
0ecdc61 γ8 handoff: Google Calendar
31287db Merge pull request #9 from BrandFactory-London/claude/hopeful-carson-fzy00j
fdd6e80 γ7 gate: Neon dev migration, the real learning loop, Facebook and Pinterest runs, smoke list
$ git status
nothing to commit, working tree clean
```

This session's designated branch is `claude/hopeful-carson-fzy00j`. Its γ7 pull request (#9) is merged, so the branch was restarted from main at `31287db` (γ7 merged) and keeps the same name. Its first commit is the handoff and this report is the second. The push replaces the merged γ7 history on the remote branch (`--force-with-lease`); that history is all in main.

## 2. Files in scope

**Schema and migration (γ8.1):** `src/db/schema.ts`, `drizzle/0007_calendar.sql` (Q6).

**Google Calendar (γ8.1 to γ8.3)**
- `src/auth.ts`: two Calendar scopes added to `GOOGLE_SCOPES` (Q1).
- `src/lib/google-calendar.ts` (new): a small REST client covering the calendar list, event insert, patch, delete and list, with an injectable `fetch` as `drive.ts` has. It reads `GOOGLE_API_URL` for Playwright.
- `src/lib/calendar-events.ts` (new, pure): a post's event (title, description, colour, date) and its hash.
- `src/lib/calendar-sync.ts` (new): push changes, deletions, the full resync, error recording, throttling (Q2, Q4).
- `src/lib/connections.ts`: whether Calendar is granted.
- `src/config/post-status.ts`: each status's Google colour, next to its tone (Q3).
- `src/lib/slots.ts`: `reconcileSlots` records each deleted slot so its event is deleted.
- Sync points (Q2): `_actions/slots.ts`, the batch and review actions, the post page actions, project saves, and the pages that already call `ensureSlots` (Home, Calendar, Run plan), plus the Posts and post pages.

**Screens**
- **Settings, Connections** (γ8.2): a Google Calendar row: "Calendar needs connecting" until the scope is granted, then the calendar choice, last sync, last error, and "Sync calendar now" (Q2).
- **CRM, client** (γ8.2): an optional "Short name" field for event titles (Q3, smaller decisions).

**Backlog 24 (γ8.4):** `src/lib/learn.ts`, the cost table in `src/lib/drafts.ts` (Q8).

**Tests**
- **Vitest:** event building per status, missed slots, published with live link; hash change detection; the client against a fake `fetch` (insert, 409 then patch, restore after delete, 404 on delete, rate-limit backoff); the sync and resync against a fake Calendar; failures recorded without throwing; deletions from `reconcileSlots`; backlog 24.
- **Playwright** against `e2e/google-standin.mjs` extended with a fake Calendar: Calendar needs connecting, choosing a calendar, Sync calendar now, an event updated after a topic change and after a move, an error shown on Connections while the post action still succeeds, desktop and 390px.

## 3. Open questions

- **Q1, scopes and re-consent.** Proposal:
  - **Scopes:**
    - `https://www.googleapis.com/auth/calendar.calendarlist.readonly` to list Amir's calendars;
    - `https://www.googleapis.com/auth/calendar.events.owned` to create, change and delete events on calendars he owns.
    - These are the narrowest pair Google documents for this. The first cannot touch events. The second reaches only calendars Amir owns, not ones shared with him, so the list shows owned calendars only. If his calendar is shared to him by another account, say so and I will use the wider `calendar.events` instead.
  - **Re-consent:**
    - Sign-in already asks with `access_type=offline` and `prompt=consent`, so pressing the existing "Reconnect Google" on Connections signs in again. Google then returns a new refresh token carrying Drive and Calendar, and `saveGoogleTokens` stores it with its scope list (it already does).
    - Google's consent screen lets Amir untick Calendar. The app reads the stored scope list: without the two Calendar scopes, Connections shows "Calendar needs connecting" and every sync is skipped quietly. Drive is unaffected either way, since the Drive scope is unchanged.
    - Until Amir reconnects, the stored refresh token keeps its old scopes, and nothing else changes.
  - **Sources:** Google's "Choose Google Calendar API scopes" page, and the CalendarList: list and Events: list references.
  - Needs confirmation, including that Amir's calendar is one he owns.

- **Q2, where the sync runs.** Proposal: **in the app, never in Trigger.dev, driven by a stored "dirty" check.**
  - **Why not Trigger.dev:** a Calendar call needs the Google refresh token, so `APP_ENCRYPTION_KEY` and `AUTH_GOOGLE_*` would have to be added to Trigger.dev Production. Keeping the secrets in Vercel only is the γ6 reasoning for publishing.
  - **How changes are found:** each post's event is a pure function of the post, its project and client, and the status words (`calendar-events.ts`). The app stores the hash of what it last sent. A post whose current hash differs is due an update, whichever code changed it. That covers changes made inside Trigger.dev tasks too (a generation finishing, the live check confirming) without those tasks calling Google.
  - **When a sync pass runs:**
    1. **After every post action**, through Next's `after()`, so the response is never delayed or blocked. That covers topic, move, batch confirm, generate, approve, reject, reopen, publish and project saves.
    2. **On reading** Home, Calendar, Run plan, Posts and a post page, also through `after()`. Those pages already create new slots with `ensureSlots`; this pass gives new slots their events and picks up task-driven status changes. A pass is skipped if one ran in the last 60 seconds.
    3. **"Sync calendar now"** on Connections: the full resync (Q4).
    4. **Optional, your call (section 6):** a daily Vercel Cron at about 06:00 UK time. It would catch changes made while nobody opens the app, such as a live check confirming overnight. It needs a `CRON_SECRET` variable in Vercel, which is your setting.
  - **Latency, stated plainly:** an app action shows in the calendar within seconds. A change made by a Trigger.dev task shows the next time any app page is opened, or at the daily cron.
  - **Rate limits:** calls go one after another with at most four in flight. A 403 `rateLimitExceeded` or a 429 is retried with backoff (1, 2, 4 seconds), then left for the next pass. Each pass handles at most 100 changes. A resync with more continues by itself: the button calls the action again until the response says it has finished, and shows the count. The whole Migss calendar is about 35 events today.
  - **Failures never block:** every Google error is caught. It is recorded on the post (`calendar_error`) and as the last error on Connections ("Calendar: 12 events not synced. Google said: …"), and the next pass retries it. A missing or revoked Google connection pauses the sync and shows "Calendar needs reconnecting".
  - Needs confirmation, and your answer on the daily cron.

- **Q3, titles, descriptions and colours.**
  - **Title:** `<short name> · SEO · <topic>`, for example "Migss · SEO · Wet room maintenance week by week". An empty slot reads "Migss · SEO · Planned slot", and a past empty slot "Migss · SEO · Missed slot".
    - The short name is a new optional field on the client, falling back to the client name's first word ("Migss" from "Migss Interiors").
    - "SEO" comes from a small content-type map, so Phase 2's derived posts add their own type there.
  - **Description,** plain text:
    - the status in words from `post-status.ts` ("Needs review", "Writing"), or "Missed";
    - the project name;
    - the batch spec's notes, if any (slots have no notes of their own);
    - "Open in BrandFactory Marketing: <app link to /posts/id, or /calendar for an empty slot>";
    - once published, "Live post: <live URL>".
    - The app's address comes from `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets itself, so the link is the production address even from a preview.
  - **Colours.** Google's event colours are a fixed set of eleven. Each status gets one, recorded next to its tone in `post-status.ts`, so one vocabulary drives both (D.3.1):

    | Status | App tone (colour) | Google colour | How close |
    |---|---|---|---|
    | Planned (future, empty) | neutral grey | Graphite | close |
    | Missed (past, no writing) | warning | Tangerine | a stronger orange than the app's amber |
    | Topic set | neutral | Lavender | lighter, but tells it apart from an empty slot |
    | Spec ready, Writing, Checking | brand teal (#0e7c86) | Peacock (blue) | nearest to teal; Google has no true teal |
    | Needs review | warning amber (#8a4f00) | Banana (yellow) | brighter than the app |
    | Approved | brand teal | Blueberry (deep blue) | not the app's colour, chosen so approved stands apart from writing |
    | Published | success green (#1d6f47) | Basil (dark green) | close |
    | Failed | danger red (#b3261e) | Tomato | close |
    | Rejected | neutral | Flamingo (muted red) | not the app's colour, chosen so it does not look like an empty slot |

  - Needs confirmation of the colours, the short name field and the description lines.

- **Q4, identity and idempotency.**
  - **A deterministic event ID:** `bfm` plus the post's UUID without hyphens. Google requires IDs in lower-case base32hex (0 to 9 and a to v), 5 to 1024 characters. Hex digits and "bfm" fit.
    - Nothing needs storing before the first call, so a lost reply cannot make a duplicate. A retried insert gets 409, and the app then patches the event instead.
    - An event deleted in Google keeps its ID (it becomes cancelled), so a retried insert also gets 409. The patch sets the event back to confirmed.
  - **A private extended property** on every event: `bfmApp=brandfactory-marketing` and `bfmPostId=<id>`.
  - **The resync:**
    - It lists events in the chosen calendar that carry `bfmApp`, then compares them with the posts.
    - It creates what is missing, patches any event whose title, description, colour or date differs (an edit made in Google is overwritten, since the app is the source of truth), and deletes events whose post no longer exists.
    - **Events without `bfmApp` are never read, changed or deleted.** Amir's own events in that calendar are safe.
  - **Deletions:** `reconcileSlots` hard-deletes empty slots. In the same transaction it writes the post ID to a new `calendar_deletions` table, and the next pass deletes the event. A 404 or 410 from Google counts as done. The resync also catches any deletion the table missed, for example one made by the live γ7 version during the build.
  - Needs confirmation.

- **Q5, which slots appear.**
  - **Every post row**, as the app's calendar shows it: future empty slots, posts in progress, published, failed and rejected.
  - **Past empty slots stay**, as "Missed slot" in Tangerine, matching the app's Missed badge. Your call if you would rather they were deleted once missed.
  - **Paused projects:** their future empty slots are already deleted by `reconcileSlots`, so their events go. Slots with a topic stay, as in the app.
  - **The eight-week horizon:** whatever `ensureSlots` has created. It tops up on page reads, so each new day's slot appears after the next page view.
  - **Switching calendars:** choosing a different calendar starts a resync into the new one. The old calendar's events are left alone, and Connections says so ("Events already in <old calendar> stay there").
  - **Published posts** stay, marked Published in Basil, with the live link.
  - Needs confirmation, especially keeping missed slots.

- **Q6, migration `0007_calendar`.** It only adds nullable columns and a table, so the live γ7 version keeps working while γ8 builds (CLAUDE.md).
  - **`app_settings`:**
    - `calendar_user_id` (whose Google token syncs);
    - `calendar_id` and `calendar_name`;
    - `calendar_synced_at`, `calendar_error`, `calendar_error_at`.
  - **`posts`:** `calendar_hash`, `calendar_synced_at`, `calendar_error`. The event ID is derived (Q4), so it is not stored.
  - **`calendar_deletions`** (new): `post_id` (no foreign key, since the post is gone), `event_id`, `attempts`, `error`, `created_at`.
  - **`clients`:** `short_name`, nullable.
  - **`ai_calls`:** `unstored` jsonb, nullable (Q8).
  - **During the build window** the live version ignores all of it. Its slot deletions write no deletion rows, and the first resync catches those.
  - **Neon dev:** host check `ep-square-mode-zatw6e39`, `--rehearse 0007_calendar`, migrate, then the independent query, in the gate.
  - Needs confirmation.

- **Q7, testing.**
  - **Vitest:** the Calendar client against a fake `fetch`, and the sync against a fake Calendar that can fail any call once, return 409, 404, 410 or a rate limit. Assertions: no duplicate events, the right patch after a 409, deletions done once, errors recorded without throwing, the hash skipping unchanged posts.
  - **Playwright:** `e2e/google-standin.mjs` gains the calendar list and events endpoints, kept in memory with a `__state` view. Its token reply can include or leave out the Calendar scopes, to test "Calendar needs connecting".
  - **Real Calendar calls from this session: none that write.** This session has no Google token of Amir's, so the app's code cannot call Google from here at all. Two read-only options, both your call (section 6):
    - (a) through the Google Calendar connector attached to this session, list your calendars once, to confirm the calendar's name and that you own it (Q1);
    - (b) none, leaving the first real Calendar call to the production smoke.
  - Needs confirmation.

- **Q8, backlog 24: a reply the candidate run cannot store.**
  - **When something is not stored,** `proposeCandidates` saves what it dropped on the run's own `ai_calls` row, in the new `unstored` column. It records each dropped candidate as the model sent it, with the reason:
    - "already waiting" (the duplicate check, with the ID of the candidate it matched);
    - "not a place a suggestion can go" (tier and section outside the allowed list);
    - "empty text";
    - "over the limit of 5".
  - **A reply that cannot be read at all** (not JSON, or the wrong shape) is already an error on the call. Its raw text is saved in the same column, cut to 20,000 characters.
  - **Nothing is saved when every candidate is stored or the reply is empty,** so normal runs carry no extra data.
  - **Where it shows:** the post's cost table line reads, for example, "Rule and fact suggestions (1 not added: already waiting)". `real-run.ts post-report` prints the column.
  - Needs confirmation.

**Smaller decisions I will take unless you object:**
- **Event time zone:** all-day events (start date and next-day end date), so no time zone applies. The date is the slot date as the app shows it.
- **One sync user:** the account that chooses the calendar is stored as the sync user. The app is single-operator, so that is always Amir.
- **The Google stand-in's default token** gains the Calendar scopes, so existing Playwright specs keep passing. One spec asks for a token without them.
- **No new status words:** "Missed" already exists as `MISSED` in `post-status.ts`.

## 4. Checkpoint structure

γ8 is one checkpoint with one gate, in five internal stages.

| Stage | Focus | Files | Risk |
|---|---|---|---|
| γ8.1 | Migration `0007` (local, then Neon dev). Scopes, Calendar client, event building and colours | `db/schema.ts`, `drizzle/0007_*`, `auth.ts`, `lib/google-calendar.ts`, `lib/calendar-events.ts`, `config/post-status.ts` | Medium. The request shapes come from the docs and are not yet exercised with a real token. |
| γ8.2 | Connections row: needs connecting, calendar choice, Sync calendar now with progress, errors; client short name | `settings/connections/*`, `lib/connections.ts`, CRM client form | Low. |
| γ8.3 | The sync: hash check, `after()` hooks on actions and pages, deletions from `reconcileSlots`, resync with orphan sweep, backoff | `lib/calendar-sync.ts`, `lib/slots.ts`, actions, pages | Medium. Many call sites; the consumer audit lists each. |
| γ8.4 | Backlog 24 | `lib/learn.ts`, `lib/drafts.ts`, `scripts/real-run.ts` | Low. |
| γ8.5 | Stand-in, Playwright at desktop and 390px, consumer audit, gate | `e2e/*`, `docs/*` | Low. |

## 5. Estimated LOC and test deltas

Hand-written code and tests, excluding the lockfile and generated migration files.

| Stage | LOC (est.) | New tests (est.) |
|---|---|---|
| γ8.1 | 450 | 14 Vitest (event per status, missed, published, hash, ID format, client calls and errors) |
| γ8.2 | 300 | 3 Playwright (needs connecting, choose calendar, short name) |
| γ8.3 | 550 | 14 Vitest (dirty detection, 409 then patch, restore, deletions, orphan sweep, foreign events untouched, backoff, errors never throw), 3 Playwright (sync now, topic and move update events, error shown while the action succeeds) |
| γ8.4 | 120 | 4 Vitest (each drop reason, unreadable reply, nothing saved on a clean run) |
| γ8.5 | 200 | phone-width additions |
| **Total** | **about 1,600** | **about 32 Vitest, about 6 Playwright** |

Estimates only. The gate cites the runner's own summary lines (D.1.2).

## 6. Ambiguities to resolve before starting

1. **Answers or amendments for Q1 to Q8**, especially:
   - **Q1:** the two narrow scopes, which need the calendar to be one you own;
   - **Q2:** sync in the app, not Trigger.dev, and whether to add the daily Vercel Cron (it needs a `CRON_SECRET` you set in Vercel);
   - **Q3:** the colour table and the client short name;
   - **Q5:** keeping missed slots on the calendar.
2. **A read-only look at your calendars before building (Q7):** (a) list them through the Google Calendar connector in this session, to confirm the name and that you own it, or (b) none. (a) is the lean. It changes nothing.
3. **Your setup before the smoke**, not needed to start building:
   - nothing in Google Cloud, since the OAuth app is Internal;
   - `CRON_SECRET` in Vercel Production, only if you want the daily cron.

Nothing runs against Neon dev or Google until this is approved.

---

**Stopping here. No code until you approve.**

## Approval (Amir, 23 Oct 2026)

Approved, with these answers:
- **Q1:** the calendar is "BrandFactory Content" on hello@brandfactorylondon.com, which Amir owns. Use the two narrow scopes. If it does not appear in the picker during the smoke, switch to `calendar.events`.
- **Q2:** add the daily Vercel Cron at about 06:00 UK time. Amir sets `CRON_SECRET` in Vercel Production; the smoke list says exactly when.
- **Q5:** keep missed slots on the calendar.
- **Q7:** no read-only connector check; the calendar list was confirmed in the review chat.

Everything else as proposed.
