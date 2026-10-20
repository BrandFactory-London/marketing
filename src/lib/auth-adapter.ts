import type { Adapter, AdapterAccount } from "next-auth/adapters";

// The Drizzle adapter writes OAuth tokens to the accounts table in plain text. This wrapper drops
// them before the adapter sees the account; the refresh token is stored encrypted elsewhere.
export function withoutStoredTokens(adapter: Adapter): Adapter {
  return {
    ...adapter,
    linkAccount: (account: AdapterAccount) => adapter.linkAccount!(stripTokens(account)),
  };
}

export function stripTokens(account: AdapterAccount): AdapterAccount {
  return { ...account, refresh_token: undefined, access_token: undefined, id_token: undefined };
}
