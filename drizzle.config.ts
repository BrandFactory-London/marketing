import { defineConfig } from "drizzle-kit";

// Generate only. Migrations are applied with `pnpm db:migrate` (scripts/migrate.ts), never `drizzle-kit push`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
