/**
 * V1-GATE-TOK — comparator + ceiling criteria (offline).
 * Full evidence is produced by scripts/v1-gate-tok.mjs / .sh.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  compareTokenTotals,
  evaluateV1GateTok,
  V1_GATE_TOK_TARGET_MIN_PCT,
  V1_GATE_TOK_O1_MIN_ITERATIONS,
} from "../fixtures/v1-gate-tok-comparator.js";
import {
  CrystallizerRegistry,
  buildStatelessWorkerSnapshot,
} from "../../src/v3/token-economy/index.js";

const REPO = path.resolve(__dirname, "../../..");
const V0_BASELINE = path.join(
  REPO,
  "docs/v0/evidence/latest/04-token-compare.json",
);

describe("V1-GATE-TOK comparator", () => {
  it("loads V0 baseline reference file", () => {
    expect(existsSync(V0_BASELINE), V0_BASELINE).toBe(true);
    const v0 = JSON.parse(readFileSync(V0_BASELINE, "utf-8"));
    expect(v0.kind).toBe("V0LiveTokenCompareReport");
    expect(v0.combined_compare.baseline_total).toBeGreaterThan(0);
  });

  it("compareTokenTotals computes reduction honestly", () => {
    const c = compareTokenTotals(1000, 200, { honesty: "estimated" });
    expect(c.reduction_pct).toBe(80);
    expect(c.meets_target).toBe(true);
    expect(c.target_min_pct).toBe(V1_GATE_TOK_TARGET_MIN_PCT);
    expect(c.honesty).toBe("estimated");
  });

  it("FAIL when reduction below 75 even if other proofs ok", () => {
    const v = evaluateV1GateTok({
      combined_reduction_pct: 58.35,
      crystallizer_zero_token_proven: true,
      o1_snapshot_proven: true,
      o1_iterations: 5,
    });
    expect(v.pass).toBe(false);
    expect(v.label).toContain("FAIL");
    expect(v.reasons.some((r) => r.startsWith("FAIL_REDUCTION"))).toBe(true);
  });

  it("PASS only when reduction + crystallizer + O(1) all hold", () => {
    const v = evaluateV1GateTok({
      combined_reduction_pct: 78,
      crystallizer_zero_token_proven: true,
      o1_snapshot_proven: true,
      o1_iterations: V1_GATE_TOK_O1_MIN_ITERATIONS,
    });
    expect(v.pass).toBe(true);
    expect(v.label).toContain("PASS");
  });

  it("FAIL without crystallizer 0-token proof", () => {
    const v = evaluateV1GateTok({
      combined_reduction_pct: 90,
      crystallizer_zero_token_proven: false,
      o1_snapshot_proven: true,
      o1_iterations: 5,
    });
    expect(v.pass).toBe(false);
  });

  it("proves crystallizer 3 then 0-token 4th in-process", async () => {
    const reg = new CrystallizerRegistry({ tokensPerLiveRun: 10 });
    await reg.run({ pattern_id: "g", success: true });
    await reg.run({ pattern_id: "g", success: true });
    await reg.run({
      pattern_id: "g",
      success: true,
      script: "crystallized:g",
      validate: () => true,
    });
    const r4 = await reg.run({ pattern_id: "g", success: true });
    expect(r4.status).toBe("zero_token_script");
    expect(r4.tokens_used).toBe(0);
  });

  it("proves O(1) snapshot size across ≥5 iterations", () => {
    const sizes: number[] = [];
    for (let i = 0; i < V1_GATE_TOK_O1_MIN_ITERATIONS; i++) {
      const snap = buildStatelessWorkerSnapshot({
        goal: "gate",
        git_diff: "diff --git a/x b/x\n+1",
        last_filtered_error: "Error: e",
      });
      sizes.push(snap.byte_length);
    }
    expect(new Set(sizes).size).toBe(1);
  });
});
