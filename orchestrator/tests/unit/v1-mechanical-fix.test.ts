/**
 * V1-TOK-14 — Deterministic codemods before LLM (mock runner).
 */

import { describe, it, expect, vi } from "vitest";
import {
  mechanicalFixBeforeLlm,
  type MechanicalFixToolId,
} from "../../src/v3/token-economy/index.js";

describe("V1-TOK-14 mechanicalFixBeforeLlm", () => {
  it("no-ops with reason when binary missing", async () => {
    const report = await mechanicalFixBeforeLlm(["src/a.ts"], {
      resolveBinary: () => null,
      tools: ["eslint", "prettier"],
    });
    expect(report.kind).toBe("MechanicalFixReport");
    expect(report.any_ran).toBe(false);
    expect(report.tokens_used).toBe(0);
    expect(report.hooks).toHaveLength(2);
    expect(report.hooks.every((h) => h.skipped)).toBe(true);
    expect(report.hooks[0]!.reason).toMatch(/^binary_missing:/);
  });

  it("invokes mock runner only for resolved binaries", async () => {
    const runner = vi.fn(async ({ tool }: { tool: MechanicalFixToolId }) => ({
      ok: true,
      exit_code: 0,
      stdout: `fixed:${tool}`,
    }));

    const report = await mechanicalFixBeforeLlm(["src/a.ts", "src/b.ts"], {
      resolveBinary: (tool) => (tool === "eslint" || tool === "prettier" ? `/bin/${tool}` : null),
      runner,
      tools: ["eslint", "prettier", "ruff", "ts_morph"],
    });

    expect(runner).toHaveBeenCalledTimes(2);
    expect(report.any_ran).toBe(true);
    expect(report.all_ok).toBe(true);
    expect(report.attempted_fix).toBe(true);

    const eslint = report.hooks.find((h) => h.tool === "eslint")!;
    expect(eslint.ran).toBe(true);
    expect(eslint.ok).toBe(true);

    const ruff = report.hooks.find((h) => h.tool === "ruff")!;
    expect(ruff.skipped).toBe(true);
    expect(ruff.reason).toBe("binary_missing:ruff");
  });

  it("records hook failure without inventing success", async () => {
    const report = await mechanicalFixBeforeLlm(["x.ts"], {
      resolveBinary: () => "/bin/eslint",
      runner: async () => ({ ok: false, exit_code: 2, stderr: "parse error" }),
      tools: ["eslint"],
    });
    expect(report.all_ok).toBe(false);
    expect(report.hooks[0]!.ok).toBe(false);
    expect(report.hooks[0]!.reason).toBe("hook_failed");
  });
});
