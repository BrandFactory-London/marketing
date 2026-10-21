import type { NextConfig } from "next";
import { DEFAULT_PROJECT_TAB } from "./src/lib/nav";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // A project opens on its default tab (γ2 orientation Q9).
  async redirects() {
    return [{ source: "/projects/:projectId", destination: `/projects/:projectId/${DEFAULT_PROJECT_TAB}`, permanent: false }];
  },
};

export default nextConfig;
