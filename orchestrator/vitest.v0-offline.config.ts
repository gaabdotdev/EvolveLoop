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

/**
 * V0-EXIT-01 aggregated offline deterministic suite:
 * all v0-*.test.ts unit files + security adversarial.
 */
export default defineConfig({
  plugins: [nodeSqliteExternal()],
  test: {
    include: ["tests/unit/v0-*.test.ts", "tests/unit/security/audit-adversarial.test.ts"],
    exclude: ["tests/**/*.bench.test.ts", "tests/quarantine/**"],
    globals: false,
    testTimeout: 30_000,
    setupFiles: ["tests/setup-checkpoint-key.ts"],
    pool: "forks",
  },
});
