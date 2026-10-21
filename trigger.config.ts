import { resolve } from "node:path";
import { defineConfig } from "@trigger.dev/sdk";
import type { BuildExtension } from "@trigger.dev/build";

// Trigger.dev runs every model call (γ4 orientation Q1). Development runs from the build session against Neon
// dev; Production deploys with main. There is no Preview environment.

// The app's server modules import "server-only", which throws outside React Server Components. Tasks are
// server code too, so it resolves to an empty module here, as it does in Vitest.
const serverOnly: BuildExtension = {
  name: "server-only",
  onBuildStart(context) {
    context.registerPlugin({
      name: "server-only",
      setup(build) {
        build.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "server-only" }));
        build.onLoad({ filter: /.*/, namespace: "server-only" }, () => ({ contents: "export {};", loader: "js" }));
      },
    });
  },
};

// `trigger.dev dev` from Claude's cloud environment cannot reach Neon on port 5432. With
// DEV_DB_DRIVER=neon-serverless, dev workers only swap the database client for scripts/dev-db-client.ts.
// Deploys never take this branch.
const devDatabaseOverWebSocket: BuildExtension = {
  name: "dev-db-over-websocket",
  onBuildStart(context) {
    if (context.target !== "dev" || process.env.DEV_DB_DRIVER !== "neon-serverless") return;
    const client = resolve(context.workingDir, "scripts/dev-db-client.ts");
    context.registerPlugin({
      name: "dev-db-over-websocket",
      setup(build) {
        build.onResolve({ filter: /^@\/db\/client$/ }, () => ({ path: client }));
      },
    });
  },
};

export default defineConfig({
  project: "proj_ulcdgkjdrupttwnieygs",
  dirs: ["./src/trigger"],
  runtime: "node",
  // 20 minutes per post run (Q6); each API call has its own 10-minute timeout in src/lib/ai/client.ts.
  maxDuration: 20 * 60,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 10_000, maxTimeoutInMs: 60_000, randomize: true },
  },
  build: { extensions: [serverOnly, devDatabaseOverWebSocket] },
});
