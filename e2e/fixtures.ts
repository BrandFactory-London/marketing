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
  for (const table of [
    "critic_verdicts",
    "post_drafts",
    "post_generations",
    "post_specs",
    "ai_calls",
    "posts",
    "batches",
    "project_pillars",
    "site_pages",
    "knowledge_versions",
    "projects",
    "clients",
  ]) {
    await query(`delete from ${table}`);
  }
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
