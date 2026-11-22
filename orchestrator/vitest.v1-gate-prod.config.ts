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
 * V1-GATE-PROD — release gate aggregate (plano mestre §3.2–3.3):
 * multi-terminal daemon + bwrap + SSRF 100% + cgroups/unshare-net + taint + holdout.
 */
export default defineConfig({
  plugins: [nodeSqliteExternal()],
  test: {
    include: [
      "tests/unit/v1-gate-prod.test.ts",
      "tests/unit/v1-orch-01-daemon-uds.test.ts",
      "tests/unit/v1-sec-01-bwrap-wrapper.test.ts",
      "tests/unit/v1-sec-02-credential-proxy.test.ts",
      "tests/unit/v1-sec-03-phase-isolation.test.ts",
      "tests/unit/v1-sec-04-taint.test.ts",
      "tests/unit/v1-sec-05-holdout.test.ts",
    ],
    exclude: ["tests/**/*.bench.test.ts", "tests/quarantine/**"],
    globals: false,
    testTimeout: 30_000,
    setupFiles: ["tests/setup-checkpoint-key.ts"],
    pool: "forks",
  },
});
