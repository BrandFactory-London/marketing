import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db/client";
import { accounts, sessions, users } from "@/db/schema";
import { isAllowedSignIn } from "@/lib/allowlist";
import { withoutStoredTokens } from "@/lib/auth-adapter";
import { saveGoogleTokens } from "@/lib/google-tokens";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

// The config is built per request so that importing this module (for example during a build)
// does not need DATABASE_URL.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: withoutStoredTokens(
    DrizzleAdapter(getDb(), { usersTable: users, accountsTable: accounts, sessionsTable: sessions }),
  ),
  session: { strategy: "database" },
  providers: [
    Google({
      authorization: {
        params: { scope: GOOGLE_SCOPES, access_type: "offline", prompt: "consent" },
      },
    }),
  ],
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // Runs before any user row is created, so a refused account writes nothing.
    signIn: ({ profile }) => isAllowedSignIn(profile, process.env.ALLOWED_EMAIL),
  },
  events: {
    // Runs on every sign-in, not only the first, so a fresh refresh token always gets stored.
    signIn: async ({ user, account }) => {
      if (account?.provider !== "google" || !user.id) return;
      await saveGoogleTokens({
        userId: user.id,
        refreshToken: account.refresh_token ?? null,
        accessToken: account.access_token ?? null,
        expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
        scope: account.scope ?? null,
      });
    },
  },
}));
