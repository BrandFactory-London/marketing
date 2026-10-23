# Handoff: checkpoint γ8 (Google Calendar)

You are the implementation agent for BrandFactory Marketing. A separate Claude chat reviews your orientation report. Amir approves the orientation; after that you build, test, merge and give him a short production smoke list (CLAUDE.md, "How we work").

## Where things stand

Phase 1 (γ1 to γ6) is live. γ7 (the learning loop, Facebook and Pinterest copy) is merged before this checkpoint starts: branch from `main` after it, and read `docs/gate-cp7.md`. Google Calendar was backlog item 7 ("purpose to settle before building"). Amir has now settled it, and wants it before the first real Migss month.

Phase 2 will replace project packages with runs, and add derived posts scheduled on their own days as children of an SEO post. Build the sync on post records and their dates, not on packages, so it carries over unchanged when runs arrive.

## Read first

`CLAUDE.md`, `docs/methodology.md`, `docs/design-decisions.md` (decisions 4, 6, 15 and 16), `docs/backlog.md` (item 7), `docs/gate-cp7.md`, `src/auth.ts` (`GOOGLE_SCOPES` and the consent parameters), `src/lib/google-tokens.ts`, `src/lib/drive.ts` (how Google APIs are called and tested), `src/lib/slots.ts` (how slots are created, moved and removed), `src/config/post-status.ts`, `src/lib/jobs.ts`, the Connections page, and `e2e/google-standin.mjs`.

## Your first deliverable: the γ8 orientation report

Write it using `docs/templates/orientation-report.md`, post it, and **stop**. Write no code until Amir approves it.

## γ8 scope

Goal: every post slot in the app appears in Amir's Google Calendar, and stays correct as it moves through its life, without him touching the calendar.

1. **Permission.** Add the Google Calendar scopes needed to list Amir's calendars and write events. The OAuth app is Internal, so no verification is needed. Amir re-consents once. Until he does, the app shows that Calendar needs connecting, and nothing else breaks. Drive keeps working throughout.
2. **Choose the calendar.** Amir already has a calendar for this. Settings, Connections lists his calendars, he picks one, and the choice is stored. One calendar for all clients.
3. **An event for every slot,** empty placeholders included, from the slot's creation onwards.
   - All-day, on the slot's date.
   - **Title:** client or project short name, the content type and the topic, for example "Migss · SEO · Wet room maintenance week by week". An empty slot reads like "Migss · SEO · Planned slot".
   - **Description:** the status in words from `src/config/post-status.ts`, any notes on the slot, and a link to the post's page in the app. Once published, the live link as well.
   - **Colour:** changes with the post's status, so the calendar shows at a glance what is planned, written, approved and published (see Q3).
4. **Kept in sync, one way.** Setting or changing a topic, moving a slot, generating, approving, rejecting and publishing update the event. Removing a slot (pausing a project, changing its package) deletes its event. Changes made in Google Calendar are never read back; the app is the source of truth.
5. **Published posts stay** on the calendar as the record, marked published.
6. **Resync.** A "Sync calendar now" action on Connections that creates, updates or deletes events so the calendar matches the app exactly. Use it for the first fill and after any outage.
7. **Failures never block the app.** A calendar error is recorded and shown on Connections. The post action that caused it still succeeds, and the next sync repairs it.

## Questions to settle in orientation

- **Q1. Scopes.** The narrowest scopes that let the app list calendars and write events, and how re-consent works with the stored refresh token.
- **Q2. Where the sync runs.** Inline in each action, a Trigger.dev task per change, or both, given that failures must not block. How a burst of changes (a batch, a resync) stays within Google's rate limits.
- **Q3. Colours.** Google Calendar offers a fixed set of event colours. Map each status in `post-status.ts` to one, and say how close it can get to the app's status tones. The client is identified by the title, since one event has one colour.
- **Q4. Identity and idempotency.** Where the event ID is stored, how a lost reply avoids a duplicate event (for example a deterministic event ID or a private extended property holding the post ID), and what the resync does with events the app did not create.
- **Q5. Which slots.** Past empty slots (shown as missed today), paused projects, and the eight-week horizon: what appears, and what is deleted.
- **Q6. Migration.** Event ID and sync state per post, and the chosen calendar, safe for the live version per CLAUDE.md.
- **Q7. Testing.** Vitest against a fake Calendar API, Playwright against an extended Google stand-in, and whether any real Calendar call is made from this session (none that writes, unless Amir agrees to a test calendar).

## Out of scope for γ8

Reading anything back from Google Calendar, inviting other people, reminders and notifications, runs and derived posts (Phase 2), scheduled publishing (Phase 3).

## Closing γ8

Close with a verification gate using `docs/templates/verification-gate.md`, including the Neon dev migration and its independent check, and phone-width screenshots of any new screens. Then merge and give Amir a short production smoke list: re-consent, pick his calendar, run "Sync calendar now" and see every Migss slot appear with the right titles and colours, set a topic and move a slot and see both events update, confirm the published wet room post shows as published with its live link, and open an event's app link on his phone.
