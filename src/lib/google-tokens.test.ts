import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { googleTokens, users } from "@/db/schema";
import { createTestDb, testDatabaseUrl } from "@/test/db";
import { decrypt } from "./crypto";
import { GoogleReconnectRequired, getGoogleAccessToken, saveGoogleTokens } from "./google-tokens";

describe.skipIf(!testDatabaseUrl)("Google token store (local Postgres)", () => {
  const { db, close } = createTestDb();
  const userId = "test-user-google";

  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.AUTH_GOOGLE_ID = "client-id";
    process.env.AUTH_GOOGLE_SECRET = "client-secret";
  });

  beforeEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({ id: userId, email: "token-store-test@example.com" });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await close();
  });

  const stored = async () => (await db.select().from(googleTokens).where(eq(googleTokens.userId, userId)))[0];

  it("stores the refresh token encrypted, never in plain text", async () => {
    await saveGoogleTokens({ userId, refreshToken: "1//first", accessToken: "ya29.a", expiresAt: new Date() }, db);
    const row = await stored();
    expect(row.refreshTokenEnc).not.toContain("1//first");
    expect(decrypt(row.refreshTokenEnc, `google-refresh-token:${userId}`)).toBe("1//first");
    expect(row.accessTokenEnc).not.toContain("ya29");
  });

  it("never overwrites an existing refresh token with null", async () => {
    await saveGoogleTokens({ userId, refreshToken: "1//first" }, db);
    await saveGoogleTokens({ userId, refreshToken: null, accessToken: "ya29.new", expiresAt: new Date() }, db);
    await saveGoogleTokens({ userId }, db);
    const row = await stored();
    expect(decrypt(row.refreshTokenEnc, `google-refresh-token:${userId}`)).toBe("1//first");
    expect(decrypt(row.accessTokenEnc!, `google-access-token:${userId}`)).toBe("ya29.new");
  });

  it("replaces the refresh token when Google returns a new one", async () => {
    await saveGoogleTokens({ userId, refreshToken: "1//first" }, db);
    await saveGoogleTokens({ userId, refreshToken: "1//second" }, db);
    expect(decrypt((await stored()).refreshTokenEnc, `google-refresh-token:${userId}`)).toBe("1//second");
  });

  it("creates no row when there is no refresh token to store", async () => {
    await saveGoogleTokens({ userId, accessToken: "ya29.only" }, db);
    expect(await stored()).toBeUndefined();
  });

  it("uses the stored access token while it has more than a minute left", async () => {
    await saveGoogleTokens({ userId, refreshToken: "1//r", accessToken: "ya29.cached", expiresAt: new Date(Date.now() + 10 * 60_000) }, db);
    const fetchImpl = vi.fn();
    const result = await getGoogleAccessToken(userId, { db, fetchImpl });
    expect(result).toEqual({ accessToken: "ya29.cached", refreshedAt: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("exchanges the refresh token when forced or close to expiry, and stores the new access token", async () => {
    await saveGoogleTokens({ userId, refreshToken: "1//r", accessToken: "ya29.old", expiresAt: new Date(Date.now() + 30_000) }, db);
    const fetchImpl = vi.fn(async () => Response.json({ access_token: "ya29.fresh", expires_in: 3599, scope: "drive.readonly" }));
    const result = await getGoogleAccessToken(userId, { db, fetchImpl });
    expect(result.accessToken).toBe("ya29.fresh");
    expect(result.refreshedAt).toBeInstanceOf(Date);
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("1//r");
    const row = await stored();
    expect(decrypt(row.accessTokenEnc!, `google-access-token:${userId}`)).toBe("ya29.fresh");
    expect(decrypt(row.refreshTokenEnc, `google-refresh-token:${userId}`)).toBe("1//r");

    const forced = await getGoogleAccessToken(userId, { db, fetchImpl, forceRefresh: true });
    expect(forced.refreshedAt).toBeInstanceOf(Date);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("asks for a new sign-in when Google rejects the refresh token", async () => {
    await saveGoogleTokens({ userId, refreshToken: "1//revoked" }, db);
    const fetchImpl = vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    await expect(getGoogleAccessToken(userId, { db, fetchImpl })).rejects.toBeInstanceOf(GoogleReconnectRequired);
  });

  it("asks for a new sign-in when nothing is stored", async () => {
    await expect(getGoogleAccessToken(userId, { db, fetchImpl: vi.fn() })).rejects.toBeInstanceOf(GoogleReconnectRequired);
  });
});
