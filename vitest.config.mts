import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside an RSC build; stub it so tests can import server modules.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Live model tests cost money: only via `npm run test:ai` (vitest.live.config.mts).
    exclude: ["**/*.live.test.ts", "**/*.load.test.ts", "**/node_modules/**"],
    // Load .env.local etc. (all keys, not just VITE_*) for DB integration tests.
    env: loadEnv(mode, process.cwd(), ""),
    // DB tests hit the cloud dev project over the network.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
}));
