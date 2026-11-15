import { describe, expect, it } from "vitest";
import { evaluateImprovementClaim, NUMERIC_FLOORS } from "../../../src/v4/benchmarks/index.js";
import { executedFixture, loadCanonicalArtifact } from "./fixtures.js";

describe("measurable-improvement bar", () => {
  it("keeps numeric floors UNAVAILABLE", () => {
    expect(NUMERIC_FLOORS.min_relative_improvement).toEqual({ value: null, provenance: "UNAVAILABLE" });
    expect(NUMERIC_FLOORS.min_sample_size_for_claim.value).toBeNull();
  });

  it("returns UNAVAILABLE for the canonical declared-UNAVAILABLE artifact", () => {
    const artifact = loadCanonicalArtifact();
    const verdict = evaluateImprovementClaim(artifact, artifact);
    expect(verdict.kind).toBe("UNAVAILABLE");
    expect(verdict.numeric_floors.min_relative_improvement.provenance).toBe("UNAVAILABLE");
  });

  it("returns INCOMPARABLE when suite identity differs", () => {
    const baseline = executedFixture();
    const candidate = executedFixture({ suite_id: "other-suite", artifact_id: "el-v4-fba-fixture-other" });
    candidate.workload.suite_id = "other-suite";
    const verdict = evaluateImprovementClaim(baseline, candidate);
    expect(verdict.kind).toBe("INCOMPARABLE");
  });

  it("returns IMPROVED on labelled fixtures when all primary axes are Pareto-better (not production)", () => {
    const baseline = executedFixture();
    const candidate = executedFixture({ artifact_id: "el-v4-fba-fixture-candidate" });
    const cost = candidate.metrics.find((m) => m.metric === "cost_per_verified_result");
    const quality = candidate.metrics.find((m) => m.metric === "validated_quality");
    const completion = candidate.metrics.find((m) => m.metric === "verified_completion");
    if (cost && cost.status === "RECORDED") {
      cost.value = 10;
      cost.uncertainty = { method: "point_interval.v0", lower: 10, upper: 10 };
    }
    if (quality && quality.status === "RECORDED") {
      quality.value = 0.8;
      quality.uncertainty = { method: "point_interval.v0", lower: 0.8, upper: 0.8 };
    }
    if (completion && completion.status === "RECORDED") {
      completion.value = 0.7;
      completion.uncertainty = { method: "point_interval.v0", lower: 0.7, upper: 0.7 };
    }
    const verdict = evaluateImprovementClaim(baseline, candidate);
    expect(verdict.kind).toBe("IMPROVED");
    expect(verdict.reasons.some((r) => /numeric floors remain UNAVAILABLE/.test(r))).toBe(true);
  });

  it("returns TRADEOFF_NOT_IMPROVEMENT when primary axes mix better and worse", () => {
    const baseline = executedFixture();
    const candidate = executedFixture({ artifact_id: "el-v4-fba-fixture-tradeoff" });
    const cost = candidate.metrics.find((m) => m.metric === "cost_per_verified_result");
    if (cost && cost.status === "RECORDED") {
      cost.value = 10;
      cost.uncertainty = { method: "point_interval.v0", lower: 10, upper: 10 };
    }
    const quality = candidate.metrics.find((m) => m.metric === "validated_quality");
    if (quality && quality.status === "RECORDED") {
      quality.value = 0.1;
      quality.uncertainty = { method: "point_interval.v0", lower: 0.1, upper: 0.1 };
    }
    const verdict = evaluateImprovementClaim(baseline, candidate);
    expect(verdict.kind).toBe("TRADEOFF_NOT_IMPROVEMENT");
  });

  it("returns INVALID when the candidate invents UNAVAILABLE numbers", () => {
    const baseline = executedFixture();
    const candidate = loadCanonicalArtifact() as { metrics: Array<Record<string, unknown>> };
    candidate.metrics[0] = { ...candidate.metrics[0], value: 0.01 };
    const verdict = evaluateImprovementClaim(baseline, candidate);
    expect(verdict.kind).toBe("INVALID");
  });
});
