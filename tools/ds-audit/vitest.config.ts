import { defineConfig } from "vitest/config";

/** Separate from the product's vitest config: `npm run ds:audit:test`. Tests drive a real Chromium on HTML fixtures. */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
