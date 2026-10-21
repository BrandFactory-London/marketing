// Runs before `next build` on Vercel (package.json "vercel-build"). See scripts/deploy-migrate-lib.ts.
import { Client as NeonClient } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { deployMigrate, neonApi } from "./deploy-migrate-lib";

async function main() {
  const env = process.env;
  const neon =
    env.NEON_API_KEY && env.NEON_PROJECT_ID && env.NEON_PRODUCTION_BRANCH_ID
      ? neonApi(env.NEON_API_KEY, env.NEON_PROJECT_ID, env.NEON_PRODUCTION_BRANCH_ID)
      : undefined;
  await deployMigrate({
    env,
    neon,
    // Neon's WebSocket driver holds one session, so the lock and the one-transaction migration share it.
    connect: async (url) => {
      const client = new NeonClient({ connectionString: url });
      await client.connect();
      return client;
    },
    migrate: async (client, migrationsFolder) => {
      await migrate(drizzle({ client: client as NeonClient }), { migrationsFolder });
    },
  });
}

main().catch((error: unknown) => {
  console.error(`Production migration failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error("The build stops here, so the version already live stays live.");
  process.exit(1);
});
