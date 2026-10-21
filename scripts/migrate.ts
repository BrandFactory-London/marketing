// Applies generated migrations, then runs an independent check against the database (methodology D.4.2, D.4.4).
// Usage: pnpm db:migrate [--remote] [--check-only] [--rehearse <migration tag>]. Refuses any database not on
// localhost unless --remote is passed, so nothing reaches Neon by accident. Neon targets run over WebSocket
// (port 443). --rehearse runs one migration's SQL inside BEGIN ... ROLLBACK and changes nothing.
import { resolveTarget, runMigrations } from "./migrate-lib";

async function main() {
  const argv = process.argv;
  const target = resolveTarget(process.env.DATABASE_URL, argv);
  const rehearseAt = argv.indexOf("--rehearse");
  const rehearse = rehearseAt === -1 ? undefined : argv[rehearseAt + 1];
  if (rehearseAt !== -1 && !rehearse) throw new Error("--rehearse needs a migration tag, for example 0001_crm_projects_knowledge.");
  await runMigrations(target, { checkOnly: argv.includes("--check-only"), rehearse });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
