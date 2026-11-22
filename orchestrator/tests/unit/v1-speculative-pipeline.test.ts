/**
 * V1-TOK-13 — Speculative execution: green local path never calls layer 2.
 */

import { describe, it, expect, vi } from "vitest";
import { runSpeculativePipeline } from "../../src/v3/model-providers/index.js";

describe("V1-TOK-13 speculative pipeline", () => {
  it("green local tests skip cloud escalation (layer 2 never invoked)", async () => {
    const escalateCloud = vi.fn(async () => ({
      ok: true,
      layer: 2 as const,
      text: "should-not-run",
      tokens_out: 999,
    }));

    const report = await runSpeculativePipeline({
      draftLocal: async () => ({
        ok: true,
        layer: 0,
        text: "local draft",
        tokens_out: 12,
      }),
      runTests: async () => ({ ok: true, exit_code: 0 }),
      escalateCloud,
    });

    expect(report.kind).toBe("SpeculativePipelineReport");
    expect(report.layer2_invoked).toBe(false);
    expect(escalateCloud).not.toHaveBeenCalled();
    expect(report.escalation.skipped).toBe(true);
    expect(report.stages).toEqual(["local_draft", "deterministic_test"]);
    expect(report.stages).not.toContain("cloud_escalation");
    expect(report.final_ok).toBe(true);
    expect(report.reason).toBe("green_local_path");
  });

  it("failed local tests escalate to layer 2", async () => {
    const escalateCloud = vi.fn(async () => ({
      ok: true,
      layer: 2 as const,
      text: "frontier fix",
      tokens_out: 80,
    }));

    const report = await runSpeculativePipeline({
      draftLocal: async () => ({
        ok: true,
        layer: 0,
        text: "buggy draft",
        tokens_out: 10,
      }),
      runTests: async () => ({ ok: false, exit_code: 1, stderr: "fail" }),
      escalateCloud,
    });

    expect(report.layer2_invoked).toBe(true);
    expect(escalateCloud).toHaveBeenCalledTimes(1);
    expect(report.stages).toContain("cloud_escalation");
    expect(report.final_ok).toBe(true);
    expect(report.tokens_proxy).toBe(90);
  });
});
