import { describe, expect, it, vi } from "vitest";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import { stripTokens, withoutStoredTokens } from "./auth-adapter";

const account: AdapterAccount = {
  userId: "u1",
  type: "oidc",
  provider: "google",
  providerAccountId: "123",
  refresh_token: "1//refresh",
  access_token: "ya29.access",
  id_token: "eyJ.id",
  expires_at: 1_800_000_000,
  scope: "openid email",
  token_type: "bearer",
};

describe("adapter wrapper", () => {
  it("drops the three tokens and keeps everything else", () => {
    const stripped = stripTokens(account);
    expect(stripped.refresh_token).toBeUndefined();
    expect(stripped.access_token).toBeUndefined();
    expect(stripped.id_token).toBeUndefined();
    expect(stripped).toMatchObject({ userId: "u1", provider: "google", providerAccountId: "123", scope: "openid email" });
  });

  it("passes the stripped account to the real linkAccount", async () => {
    const linkAccount = vi.fn();
    const wrapped = withoutStoredTokens({ linkAccount } as unknown as Adapter);
    await wrapped.linkAccount!(account);
    const stored = linkAccount.mock.calls[0][0] as AdapterAccount;
    expect(JSON.stringify(stored)).not.toMatch(/1\/\/refresh|ya29|eyJ/);
  });

  it("leaves the other adapter methods untouched", () => {
    const getUser = vi.fn();
    const wrapped = withoutStoredTokens({ getUser, linkAccount: vi.fn() } as unknown as Adapter);
    expect(wrapped.getUser).toBe(getUser);
  });

  it("runs afterLink with the full account once the stripped account is linked", async () => {
    const order: string[] = [];
    const linkAccount = vi.fn(async () => {
      order.push("link");
    });
    const afterLink = vi.fn(async (linked: AdapterAccount) => {
      order.push("after");
      expect(linked.refresh_token).toBe("1//refresh");
    });
    await withoutStoredTokens({ linkAccount } as unknown as Adapter, afterLink).linkAccount!(account);
    expect(order).toEqual(["link", "after"]);
  });

  it("fails linking when afterLink fails, so Auth.js stops the sign-in", async () => {
    const wrapped = withoutStoredTokens({ linkAccount: vi.fn() } as unknown as Adapter, async () => {
      throw new Error("token not saved");
    });
    await expect(wrapped.linkAccount!(account)).rejects.toThrow("token not saved");
  });
});
