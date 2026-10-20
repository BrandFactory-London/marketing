import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GoogleTokenNotSaved, SIGN_IN_ERRORS, checkGoogleSignIn, storeGoogleGrant, type SignInDeps } from "./google-sign-in";

const allowed = "hello@brandfactorylondon.com";
const profile = { email: allowed, email_verified: true };
const account = {
  provider: "google",
  providerAccountId: "g-123",
  refresh_token: "1//refresh",
  access_token: "ya29.access",
  expires_at: 1_800_000_000,
  scope: "openid email",
};

function deps(overrides: Partial<SignInDeps> = {}): SignInDeps {
  return {
    allowedEmail: allowed,
    encryptionKey: randomBytes(32).toString("base64"),
    findUserId: vi.fn(async () => "user-1"),
    saveTokens: vi.fn(async () => {}),
    hasTokens: vi.fn(async () => true),
    logError: vi.fn(),
    ...overrides,
  };
}

describe("Google sign-in checks", () => {
  it("refuses an address that is not allowed, before anything else", async () => {
    const d = deps();
    expect(await checkGoogleSignIn({ email: "someone@gmail.com", email_verified: true }, account, d)).toBe(false);
    expect(d.findUserId).not.toHaveBeenCalled();
  });

  it("refuses with a configuration error when APP_ENCRYPTION_KEY is missing, and stores nothing", async () => {
    const d = deps({ encryptionKey: undefined });
    expect(await checkGoogleSignIn(profile, account, d)).toBe(SIGN_IN_ERRORS.encryptionKey);
    expect(d.logError).toHaveBeenCalledWith(expect.stringContaining("APP_ENCRYPTION_KEY is not set"));
    expect(d.findUserId).not.toHaveBeenCalled();
    expect(d.saveTokens).not.toHaveBeenCalled();
  });

  it("refuses with a configuration error when APP_ENCRYPTION_KEY is not 32 bytes", async () => {
    const d = deps({ encryptionKey: randomBytes(16).toString("base64") });
    expect(await checkGoogleSignIn(profile, account, d)).toBe(SIGN_IN_ERRORS.encryptionKey);
    expect(d.logError).toHaveBeenCalledWith(expect.stringContaining("decodes to 16 bytes"));
  });

  it("lets a first sign-in continue, leaving storage to the adapter's after-link step", async () => {
    const d = deps({ findUserId: vi.fn(async () => null) });
    expect(await checkGoogleSignIn(profile, account, d)).toBe(true);
    expect(d.saveTokens).not.toHaveBeenCalled();
  });

  it("stores the token for a returning account and continues", async () => {
    const d = deps();
    expect(await checkGoogleSignIn(profile, account, d)).toBe(true);
    expect(d.saveTokens).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", refreshToken: "1//refresh", expiresAt: new Date(1_800_000_000_000) }),
    );
    expect(d.hasTokens).toHaveBeenCalledWith("user-1");
  });

  it("refuses sign-in when saving the token throws", async () => {
    const d = deps({ saveTokens: vi.fn(async () => Promise.reject(new Error("database down"))) });
    expect(await checkGoogleSignIn(profile, account, d)).toBe(SIGN_IN_ERRORS.tokenNotSaved);
    expect(d.logError).toHaveBeenCalledWith(expect.stringContaining("could not be saved"), expect.any(GoogleTokenNotSaved));
  });

  it("refuses sign-in when no token is stored afterwards", async () => {
    const d = deps({ hasTokens: vi.fn(async () => false) });
    expect(await checkGoogleSignIn(profile, { ...account, refresh_token: null }, d)).toBe(SIGN_IN_ERRORS.tokenNotSaved);
  });

  it("refuses a provider other than Google", async () => {
    expect(await checkGoogleSignIn(profile, { ...account, provider: "github" }, deps())).toBe(false);
  });
});

describe("storeGoogleGrant", () => {
  it("throws GoogleTokenNotSaved when the save fails or nothing is stored", async () => {
    await expect(
      storeGoogleGrant("u", account, { saveTokens: async () => Promise.reject(new Error("x")), hasTokens: async () => true }),
    ).rejects.toBeInstanceOf(GoogleTokenNotSaved);
    await expect(storeGoogleGrant("u", account, { saveTokens: async () => {}, hasTokens: async () => false })).rejects.toBeInstanceOf(
      GoogleTokenNotSaved,
    );
  });
});
