import { defineConfig } from "vitest/config";

/** Vite strips the `node:` prefix and then fails to resolve `sqlite`. Keep it external. */
function nodeSqliteExternal() {
  return {
    name: "node-sqlite-external",
    enforce: "pre" as const,
    resolveId(id: string) {
      if (id === "node:sqlite" || id === "sqlite") {
        return { id: "node:sqlite", external: true };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [nodeSqliteExternal()],
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.bench.test.ts", "tests/quarantine/**"],
    globals: false,
    testTimeout: 30000,
    setupFiles: ["tests/setup-checkpoint-key.ts"],
    pool: "forks",
  },
});
