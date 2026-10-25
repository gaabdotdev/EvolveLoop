import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/observability/**"],
    globals: false,
    testTimeout: 30000,
    setupFiles: ["tests/setup-checkpoint-key.ts"],
  },
});
