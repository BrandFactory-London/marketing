import { randomBytes, randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { Client } from "pg";

// Signed-in tests insert a real user and session into the local test database and set the
// Auth.js session cookie. The app checks that session the normal way; nothing in src/ knows about tests.

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5433/bfm_test";
export const TEST_EMAIL = "hello@brandfactorylondon.com";
export const SESSION_COOKIE = "authjs.session-token";

export async function query<T extends object = Record<string, unknown>>(text: string, values: unknown[] = []) {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

// Empties the domain tables, children first.
export async function resetDomain() {
  // γ8: the calendar choice and any queued event deletions.
  await query("delete from calendar_deletions");
  await query("update app_settings set calendar_user_id = null, calendar_id = null, calendar_name = null, calendar_synced_at = null, calendar_error = null, calendar_error_at = null");
  // Candidates refer to derivatives (γ7), so they go first.
  await query("delete from rule_candidates");
  for (const table of ["publish_events", "post_publications", "derivatives"]) await query(`delete from ${table}`);
  await query("delete from review_events");
  // post_versions and post_generations refer to each other, so the regenerate link is cleared first.
  await query("update post_generations set base_version_id = null");
  for (const table of [
    "post_versions",
    "critic_verdicts",
    "post_drafts",
    "post_generations",
    "post_specs",
    // Phase 2 A3: the plan refers to posts, runs and its AI calls.
    "plan_feedback",
    "plan_items",
    "plan_drafts",
    "plan_shares",
    "ai_calls",
    // Phase 2 A1: derived slots refer to posts and runs.
    "derived_slots",
    "posts",
    "runs",
    "batches",
    "project_pillars",
    "project_categories",
    "site_pages",
    "knowledge_versions",
    "project_wix",
    "projects",
    "clients",
  ]) {
    await query(`delete from ${table}`);
  }
}

// A run of SEO slots for a spec (Phase 2 A1): from today for `weeks` weeks on the given weekdays (0 is Sunday), as the
// run form would make it with no derived channels. Returns the run's ID.
export async function seedRun(projectId: string, weekdays: number[], options: { weeks?: number; preset?: string; status?: string } = {}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const day = (offset: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const length = (options.weeks ?? 8) * 7;
  const days = Array.from({ length }, (_, index) => day(index)).filter((iso) => weekdays.includes(new Date(`${iso}T00:00:00Z`).getUTCDay()));
  const [{ count }] = await query<{ count: number }>("select count(*)::int as count from runs where project_id = $1", [projectId]);
  const [run] = await query<{ id: string }>(
    "insert into runs (project_id, name, preset, starts_on, ends_on, status, writer_model, critic_model) values ($1, $2, $3, $4, $5, $6, 'claude-opus-5-5', 'claude-opus-5-5') returning id",
    [projectId, `Run ${count + 1}`, options.preset ?? "custom", today, day(length - 1), options.status ?? "setting_up"],
  );
  await query("insert into run_channels (run_id, content_type, amount, cadence) values ($1, 'seo', $2, $3)", [run.id, days.length, JSON.stringify({ weekdays })]);
  for (const iso of days) await query("insert into posts (project_id, run_id, slot_date, cadence_date, status) values ($1, $2, $3, $3, 'planned')", [projectId, run.id, iso]);
  return run.id;
}

export async function createSession(expires = new Date(Date.now() + 24 * 3600_000)) {
  const userId = randomUUID();
  const sessionToken = randomBytes(32).toString("hex");
  await query("insert into users (id, name, email) values ($1, $2, $3) on conflict (email) do nothing", [userId, "Amir", TEST_EMAIL]);
  const [user] = await query<{ id: string }>("select id from users where email = $1", [TEST_EMAIL]);
  await query("insert into sessions (session_token, user_id, expires) values ($1, $2, $3)", [sessionToken, user.id, expires]);
  return sessionToken;
}

export const test = base.extend<{ signedIn: void }>({
  signedIn: async ({ context, baseURL }, provide) => {
    const token = await createSession();
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await provide();
    await query("delete from sessions where session_token = $1", [token]);
  },
});

export { expect };
