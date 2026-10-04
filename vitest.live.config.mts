import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";

// Live tests against real services (Claude API, Shopify). Run: npm run test:ai / test:shopify
export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.live.test.ts"],
    env: loadEnv(mode, process.cwd(), ""),
    testTimeout: 180_000,
  },
}));
