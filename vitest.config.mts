import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": root("./src"),
      "server-only": root("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
