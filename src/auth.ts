import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db/client";
import { accounts, sessions, users } from "@/db/schema";
import { withoutStoredTokens } from "@/lib/auth-adapter";
import { checkGoogleSignIn, storeGoogleGrant, type SignInDeps } from "@/lib/google-sign-in";
import { findGoogleUserId, hasGoogleTokens, saveGoogleTokens } from "@/lib/google-tokens";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

function signInDeps(): SignInDeps {
  return {
    allowedEmail: process.env.ALLOWED_EMAIL,
    encryptionKey: process.env.APP_ENCRYPTION_KEY,
    findUserId: (providerAccountId) => findGoogleUserId(providerAccountId),
    saveTokens: (grant) => saveGoogleTokens(grant),
    hasTokens: (userId) => hasGoogleTokens(userId),
    logError: (message, error) => console.error(message, error ?? ""),
  };
}

// The config is built per request so that importing this module (for example during a build)
// does not need DATABASE_URL.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  // On a first sign-in the token is stored right after the account row is linked. A failure there
  // aborts the sign-in (Auth.js sends the visitor to /signin?error=Configuration).
  adapter: withoutStoredTokens(
    DrizzleAdapter(getDb(), { usersTable: users, accountsTable: accounts, sessionsTable: sessions }),
    async (account) => {
      if (account.provider !== "google") return;
      try {
        await storeGoogleGrant(account.userId, account, signInDeps());
      } catch (error) {
        console.error("Sign-in refused: the Google connection could not be saved on first sign-in.", error);
        throw error;
      }
    },
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
    // Runs before Auth.js writes anything: allowlist, encryption key, and (for a returning account)
    // storing the Google token. Token storage is deliberately not in events: Auth.js logs and
    // swallows errors thrown from events, which let sign-in succeed without a stored token.
    signIn: ({ profile, account }) => checkGoogleSignIn(profile, account, signInDeps()),
  },
}));
