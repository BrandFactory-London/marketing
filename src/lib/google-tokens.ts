import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { googleTokens } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import { requireEnv } from "./env";

const refreshAad = (userId: string) => `google-refresh-token:${userId}`;
const accessAad = (userId: string) => `google-access-token:${userId}`;

export type GoogleTokenGrant = {
  userId: string;
  refreshToken?: string | null;
  accessToken?: string | null;
  expiresAt?: Date | null;
  scope?: string | null;
};

// Stores tokens from a Google sign-in. The refresh token is only written when Google returned one,
// so an existing refresh token is never overwritten with null.
export async function saveGoogleTokens(grant: GoogleTokenGrant, db: Database = getDb()): Promise<void> {
  const access = grant.accessToken
    ? { accessTokenEnc: encrypt(grant.accessToken, accessAad(grant.userId)), accessTokenExpiresAt: grant.expiresAt ?? null }
    : {};
  const scope = grant.scope ? { scope: grant.scope } : {};

  if (grant.refreshToken) {
    const refreshTokenEnc = encrypt(grant.refreshToken, refreshAad(grant.userId));
    await db
      .insert(googleTokens)
      .values({ userId: grant.userId, refreshTokenEnc, ...access, ...scope })
      .onConflictDoUpdate({
        target: googleTokens.userId,
        set: { refreshTokenEnc, ...access, ...scope, updatedAt: sql`now()` },
      });
    return;
  }

  // No refresh token: only refresh the stored access token, and only if a row already exists.
  if (grant.accessToken) {
    await db
      .update(googleTokens)
      .set({ ...access, ...scope, updatedAt: sql`now()` })
      .where(eq(googleTokens.userId, grant.userId));
  }
}

export class GoogleReconnectRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleReconnectRequired";
  }
}

const EXPIRY_MARGIN_MS = 60_000;

type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string };

// Returns a usable Google access token, exchanging the stored refresh token when the cached access
// token is missing, close to expiry, or forceRefresh is set.
export async function getGoogleAccessToken(
  userId: string,
  options: { forceRefresh?: boolean; db?: Database; fetchImpl?: typeof fetch; now?: () => Date } = {},
): Promise<{ accessToken: string; refreshedAt: Date | null }> {
  const db = options.db ?? getDb();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  const [row] = await db.select().from(googleTokens).where(eq(googleTokens.userId, userId));
  if (!row) throw new GoogleReconnectRequired("No Google connection is stored.");

  const stillValid =
    row.accessTokenEnc && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() - now().getTime() > EXPIRY_MARGIN_MS;
  if (!options.forceRefresh && stillValid && row.accessTokenEnc) {
    return { accessToken: decrypt(row.accessTokenEnc, accessAad(userId)), refreshedAt: null };
  }

  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("AUTH_GOOGLE_ID"),
      client_secret: requireEnv("AUTH_GOOGLE_SECRET"),
      grant_type: "refresh_token",
      refresh_token: decrypt(row.refreshTokenEnc, refreshAad(userId)),
    }),
  });
  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      throw new GoogleReconnectRequired("Google no longer accepts the stored connection.");
    }
    throw new Error(`Google token refresh failed with status ${response.status}${body.error ? ` (${body.error})` : ""}.`);
  }

  const refreshedAt = now();
  await saveGoogleTokens(
    {
      userId,
      accessToken: body.access_token,
      expiresAt: new Date(refreshedAt.getTime() + (body.expires_in ?? 3600) * 1000),
      scope: body.scope ?? null,
    },
    db,
  );
  return { accessToken: body.access_token, refreshedAt };
}
