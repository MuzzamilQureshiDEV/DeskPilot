import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Load .env.local etc. (all keys, not just VITE_*) for DB integration tests.
    env: loadEnv(mode, process.cwd(), ""),
    // DB tests hit the cloud dev project over the network.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
}));
