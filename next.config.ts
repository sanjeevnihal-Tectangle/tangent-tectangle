import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second local instance (e.g. a demo-mode server) run with its own build output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Asset uploads and creative PNG exports (10 MB files + multipart overhead).
      bodySizeLimit: "12mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
