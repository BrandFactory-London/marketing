import type { NextConfig } from "next";
import { DEFAULT_PROJECT_TAB, PROJECT_TAB_REDIRECTS } from "./src/lib/nav";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // A project opens on its default tab (γ2 orientation Q9); the tabs A2 folded in keep working.
  async redirects() {
    return [
      { source: "/projects/:projectId", destination: `/projects/:projectId/${DEFAULT_PROJECT_TAB}`, permanent: false },
      ...PROJECT_TAB_REDIRECTS.map((tab) => ({ source: `/projects/:projectId/${tab.from}`, destination: `/projects/:projectId/${tab.to}`, permanent: false })),
    ];
  },
};

export default nextConfig;
