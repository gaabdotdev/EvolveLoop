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
 * V1-GATE-COMPAT — FreeLLMAPI + ≥2 agent adapters + fault injection
 * (metas V1 §4.3 / plano mestre §3.3–3.4).
 */
export default defineConfig({
  plugins: [nodeSqliteExternal()],
  test: {
    include: [
      "tests/unit/v1-gate-compat.test.ts",
      "tests/unit/v1-gate-compat-fault.test.ts",
      "tests/unit/v1-prod-02-freellmapi.test.ts",
      "tests/unit/v1-prod-03-protocols-failover.test.ts",
    ],
    exclude: ["tests/**/*.bench.test.ts", "tests/quarantine/**"],
    globals: false,
    testTimeout: 30_000,
    setupFiles: ["tests/setup-checkpoint-key.ts"],
    pool: "forks",
  },
});
