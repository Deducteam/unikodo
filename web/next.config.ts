import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// This app lives in a sub-directory of a larger repo; pin the workspace root so
// Turbopack doesn't infer it from an unrelated parent lockfile.
const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root },
  // Transform `@phosphor-icons/react` barrel imports into per-icon imports so
  // dev compiles fast and production bundles only the icons we use.
  experimental: {
    optimizePackageImports: [
      "@phosphor-icons/react",
      "@phosphor-icons/react/dist/ssr",
    ],
  },
};

export default nextConfig;
