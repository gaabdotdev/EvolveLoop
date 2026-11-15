import { describe, expect, it } from "vitest";
import { validateBaselineArtifact } from "../../../src/v4/benchmarks/index.js";
import { executedFixture, expectCode, loadCanonicalArtifact } from "./fixtures.js";

describe("FairBaselineArtifact schema (INV-FBA)", () => {
  it("accepts the canonical declared-UNAVAILABLE artifact from docs", () => {
    const artifact = validateBaselineArtifact(loadCanonicalArtifact());
    expect(artifact.production_scores).toBe("ABSENT");
    expect(artifact.harness.role).toBe("schema_validator");
    expect(artifact.metrics.every((m) => m.quality_proof === false && m.value === null)).toBe(true);
    expect(artifact.methodology_note.this_artifact_stamps_methodology_accepted).toBe(false);
    expect(artifact.methodology_note.m08_methodology_status).toBe("PROVISIONAL");
  });

  it("accepts a labelled workload_executor fixture (not production)", () => {
    const artifact = validateBaselineArtifact(executedFixture());
    expect(artifact.production_scores).toBe("PARTIAL");
    expect(artifact.metrics.some((m) => m.quality_proof)).toBe(true);
  });

  it("INV-FBA-01 refuses SELF_REPORTED as ground truth", () => {
    const raw = executedFixture();
    raw.metrics[0] = {
      ...raw.metrics[0],
      provenance: "SELF_REPORTED" as "HARNESS_REPORTED",
    };
    expectCode(() => validateBaselineArtifact(raw), "INV-FBA-01");
  });

  it("INV-FBA-02 refuses UNAVAILABLE slots that invent a number", () => {
    const raw = loadCanonicalArtifact() as { metrics: Array<Record<string, unknown>> };
    raw.metrics[0] = { ...raw.metrics[0], value: 0.99 };
    expectCode(() => validateBaselineArtifact(raw), "INV-FBA-02");
  });

  it("INV-FBA-03 refuses ranking fields at any depth", () => {
    const raw = executedFixture() as ReturnType<typeof executedFixture> & { global_score?: number };
    raw.global_score = 100;
    expectCode(() => validateBaselineArtifact(raw), "INV-FBA-03");
  });

  it("INV-FBA-04 refuses quality-proof metrics from a schema_validator", () => {
    const raw = executedFixture();
    raw.harness.role = "schema_validator";
    expectCode(() => validateBaselineArtifact(raw), "INV-FBA-04");
  });

  it("INV-FBA-05 refuses quality-proof metrics when cases are DECLARED_NOT_RUN", () => {
    const raw = executedFixture();
    raw.workload.cases = raw.workload.cases.map((c) => ({ ...c, run_status: "DECLARED_NOT_RUN" as const }));
    expectCode(() => validateBaselineArtifact(raw), "INV-FBA-05");
  });

  it("INV-FBA-06 refuses an ACCEPTED methodology stamp", () => {
    const raw = executedFixture();
    (raw.methodology_note as { this_artifact_stamps_methodology_accepted: boolean }).this_artifact_stamps_methodology_accepted =
      true;
    expectCode(() => validateBaselineArtifact(raw), "INV-FBA-06");
  });

  it("INV-FBA-07 refuses verified_completion when verifier equals executor", () => {
    const raw = executedFixture();
    const slot = raw.metrics.find((m) => m.metric === "verified_completion");
    expect(slot?.status).toBe("RECORDED");
    if (slot && slot.status === "RECORDED") {
      slot.executor_id = "executor_same";
      slot.independent_verifier_id = "executor_same";
    }
    expectCode(() => validateBaselineArtifact(raw), "INV-FBA-07");
  });

  it("refuses SELF_REPORTED cost", () => {
    const raw = executedFixture();
    raw.cost.provenance = "SELF_REPORTED";
    expectCode(() => validateBaselineArtifact(raw), "INV-FBA-01");
  });
});
