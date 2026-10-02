import { defineConfig, loadEnv } from "vite";

// Live tests against the real Claude API (cost money). Run: npm run test:ai
export default defineConfig(({ mode }) => ({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.live.test.ts"],
    env: loadEnv(mode, process.cwd(), ""),
    testTimeout: 180_000,
  },
}));
