import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";

// Load test against the cloud DB (creates and deletes test shops). Run: npm run test:load
export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/load/**/*.load.test.ts"],
    env: loadEnv(mode, process.cwd(), ""),
    testTimeout: 1_800_000,
    hookTimeout: 600_000,
  },
}));
