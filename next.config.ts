import type { NextConfig } from "next";
import { DEFAULT_PROJECT_TAB, PROJECT_TAB_REDIRECTS } from "./src/lib/nav";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The client's plan link (Phase 2 A3, orientation Q6): never indexed, never cached, and no referrer leaves it.
  async headers() {
    return [
      {
        source: "/plan/:token*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  // A project opens on its default tab (γ2 orientation Q9); the tabs A2 folded in keep working.
  async redirects() {
    return [
      { source: "/projects/:projectId", destination: `/projects/:projectId/${DEFAULT_PROJECT_TAB}`, permanent: false },
      ...PROJECT_TAB_REDIRECTS.map((tab) => ({ source: `/projects/:projectId/${tab.from}`, destination: `/projects/:projectId/${tab.to}`, permanent: false })),
    ];
  },
};

export default nextConfig;
