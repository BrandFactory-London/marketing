// Applies generated migrations, then runs an independent check against the database (methodology D.4.2, D.4.4).
// Usage: pnpm db:migrate [--remote] [--check-only]. Refuses any database not on localhost unless --remote
// is passed, so nothing reaches Neon by accident. Neon targets run over HTTPS (port 443).
import { resolveTarget, runMigrations } from "./migrate-lib";

async function main() {
  const target = resolveTarget(process.env.DATABASE_URL, process.argv);
  await runMigrations(target, { checkOnly: process.argv.includes("--check-only") });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
