import { isAllowedSignIn } from "./allowlist";
import { encryptionKeyProblem } from "./crypto";
import type { GoogleTokenGrant } from "./google-tokens";

// Sign-in rules beyond Auth.js itself. Every failure is loud: a redirect with a specific error and a
// server log line, never a sign-in that looks successful while the Google connection is missing.

export type GoogleAccount = {
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  scope?: string | null;
};

export type SignInDeps = {
  allowedEmail: string | undefined;
  encryptionKey: string | undefined;
  findUserId: (providerAccountId: string) => Promise<string | null>;
  saveTokens: (grant: GoogleTokenGrant) => Promise<void>;
  hasTokens: (userId: string) => Promise<boolean>;
  logError: (message: string, error?: unknown) => void;
};

export const SIGN_IN_ERRORS = {
  encryptionKey: "/signin?error=EncryptionKey",
  tokenNotSaved: "/signin?error=GoogleTokenNotSaved",
} as const;

export class GoogleTokenNotSaved extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GoogleTokenNotSaved";
  }
}

export function grantFromAccount(userId: string, account: GoogleAccount): GoogleTokenGrant {
  return {
    userId,
    refreshToken: account.refresh_token ?? null,
    accessToken: account.access_token ?? null,
    expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
    scope: account.scope ?? null,
  };
}

// Saves the encrypted token, then checks a row really exists. Throws GoogleTokenNotSaved otherwise.
export async function storeGoogleGrant(userId: string, account: GoogleAccount, deps: Pick<SignInDeps, "saveTokens" | "hasTokens">) {
  try {
    await deps.saveTokens(grantFromAccount(userId, account));
  } catch (error) {
    throw new GoogleTokenNotSaved("Saving the Google connection failed.", { cause: error });
  }
  if (!(await deps.hasTokens(userId))) {
    throw new GoogleTokenNotSaved("No Google connection is stored after sign-in (Google returned no refresh token).");
  }
}

// The Auth.js signIn callback. Returns true to continue, false to refuse, or a redirect URL.
export async function checkGoogleSignIn(
  profile: { email?: string | null; email_verified?: boolean | null } | undefined,
  account: GoogleAccount | null | undefined,
  deps: SignInDeps,
): Promise<boolean | string> {
  if (!isAllowedSignIn(profile, deps.allowedEmail)) return false;
  if (account?.provider !== "google") return false;

  const keyProblem = encryptionKeyProblem(deps.encryptionKey);
  if (keyProblem) {
    deps.logError(`Sign-in refused: APP_ENCRYPTION_KEY ${keyProblem}. Set a 32-byte base64 key.`);
    return SIGN_IN_ERRORS.encryptionKey;
  }

  // A first sign-in has no user yet; the adapter wrapper stores the token right after linking.
  const userId = await deps.findUserId(account.providerAccountId);
  if (!userId) return true;

  try {
    await storeGoogleGrant(userId, account, deps);
  } catch (error) {
    deps.logError("Sign-in refused: the Google connection could not be saved.", error);
    return SIGN_IN_ERRORS.tokenNotSaved;
  }
  return true;
}
