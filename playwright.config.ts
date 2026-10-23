import { defineConfig, devices } from "@playwright/test";

const port = 3100;
// The local stand-in for the Trigger.dev API (e2e/trigger-standin.mjs).
const triggerPort = 3199;
// The local stand-in for Google's token and Drive APIs (e2e/google-standin.mjs).
const googlePort = 3198;
// The local stand-in for the Wix REST API (e2e/wix-standin.mjs).
const wixPort = 3197;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  reporter: "list",
  // Specs share the local test database and some reset its tables, so they run one file at a time.
  workers: 1,
  use: { baseURL: `http://localhost:${port}`, ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, locale: "en-GB", timezoneId: "Europe/London" },
  webServer: [
    { command: "node e2e/trigger-standin.mjs", url: `http://localhost:${triggerPort}`, reuseExistingServer: false, env: { PORT: String(triggerPort) } },
    { command: "node e2e/google-standin.mjs", url: `http://localhost:${googlePort}`, reuseExistingServer: false, env: { PORT: String(googlePort) } },
    { command: "node e2e/wix-standin.mjs", url: `http://localhost:${wixPort}`, reuseExistingServer: false, env: { PORT: String(wixPort) } },
    {
      command: `pnpm build && pnpm start --port ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
      timeout: 240_000,
      // Local test values only. The database is the local Postgres used by the Vitest integration tests.
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5433/bfm_test",
        AUTH_SECRET: "playwright-local-secret-not-used-anywhere-else",
        AUTH_TRUST_HOST: "true",
        AUTH_GOOGLE_ID: "playwright-client-id",
        AUTH_GOOGLE_SECRET: "playwright-client-secret",
        ALLOWED_EMAIL: "hello@brandfactorylondon.com",
        APP_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        // Never the real Trigger.dev.
        TRIGGER_API_URL: `http://localhost:${triggerPort}`,
        TRIGGER_SECRET_KEY: "tr_dev_playwright_standin",
        // Never the real Google.
        GOOGLE_API_URL: `http://localhost:${googlePort}`,
        // Never the real Wix.
        WIX_API_URL: `http://localhost:${wixPort}`,
      },
    },
  ],
});
