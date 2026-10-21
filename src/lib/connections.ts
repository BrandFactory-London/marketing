import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Database } from "@/db/client";
import { googleTokens, users } from "@/db/schema";

export type GoogleConnection = { email: string | null; scopes: string[]; lastRefresh: Date };

// The signed-in user's Google connection for the Connections tab. last refresh is google_tokens.updated_at,
// which every sign-in and every access-token refresh updates.
export async function getGoogleConnection(userId: string, db: Database = getDb()): Promise<GoogleConnection | null> {
  const [row] = await db
    .select({ email: users.email, scope: googleTokens.scope, updatedAt: googleTokens.updatedAt })
    .from(googleTokens)
    .innerJoin(users, eq(users.id, googleTokens.userId))
    .where(eq(googleTokens.userId, userId));
  if (!row) return null;
  return { email: row.email, scopes: (row.scope ?? "").split(/\s+/).filter(Boolean), lastRefresh: row.updatedAt };
}

// Plain names for the scopes the app asks for.
export function describeScope(scope: string): string {
  const names: Record<string, string> = {
    openid: "Sign-in",
    email: "Email address",
    profile: "Name and photo",
    "https://www.googleapis.com/auth/userinfo.email": "Email address",
    "https://www.googleapis.com/auth/userinfo.profile": "Name and photo",
    "https://www.googleapis.com/auth/drive.readonly": "Google Drive, read only",
  };
  return names[scope] ?? scope;
}
