import type { Adapter, AdapterAccount } from "next-auth/adapters";

// The Drizzle adapter writes OAuth tokens to the accounts table in plain text. This wrapper drops
// them before the adapter sees the account; the refresh token is stored encrypted elsewhere.
// afterLink runs once the account row exists (a first sign-in). If it throws, linking fails and
// Auth.js stops the sign-in before creating a session.
export function withoutStoredTokens(
  adapter: Adapter,
  afterLink?: (account: AdapterAccount) => Promise<void>,
): Adapter {
  return {
    ...adapter,
    linkAccount: async (account: AdapterAccount) => {
      await adapter.linkAccount!(stripTokens(account));
      await afterLink?.(account);
    },
  };
}

export function stripTokens(account: AdapterAccount): AdapterAccount {
  return { ...account, refresh_token: undefined, access_token: undefined, id_token: undefined };
}
