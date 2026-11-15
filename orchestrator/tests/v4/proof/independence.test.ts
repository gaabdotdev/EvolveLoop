import { describe, expect, it } from "vitest";
import { isIndependent } from "../../../src/v4/contracts/index.js";
import { InvalidEvidenceError, SelfVerificationRefused, assertIndependentVerifier } from "../../../src/v4/proof/index.js";
import {
  VERIFIER_ID,
  WORKER_ID,
  WORK_ID,
  passingReport,
  reportArtifact,
  validArtifact,
  validExecution,
  validGoal,
} from "./fixtures.js";
import { seededWorld } from "./world.js";

describe("M06 independence", () => {
  it("assertIndependentVerifier throws on identity equality", () => {
    expect(() => assertIndependentVerifier(WORKER_ID, WORKER_ID)).toThrow(SelfVerificationRefused);
    expect(() => assertIndependentVerifier(VERIFIER_ID, WORKER_ID)).not.toThrow();
  });

  it("builder drops a verifier that shares the subject executor id", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    world.executions = [validExecution()];
    const { artifact, bytes } = reportArtifact(passingReport());
    world.putArtifact(validArtifact());
    world.putArtifact(artifact, bytes);
    const hostile = world.verifier();
    Object.defineProperty(hostile, "verifier_id", { value: WORKER_ID });
    const proof = await world.builder({ verifiers: [hostile] }).build(WORK_ID);
    expect(proof.final_status).toBe("UNVERIFIED");
    expect(proof.limitations.some((l) => l.includes("refused self-verifier"))).toBe(true);
    const recorded = await world.evidence.listByWork(WORK_ID);
    expect(recorded.every((e) => isIndependent(e) || e.method.kind === "SELF_REPORTED")).toBe(true);
    expect(recorded.filter((e) => e.method.kind === "AUTOMATED_TEST")).toHaveLength(0);
  });

  it("missing subject_executor_ref cannot qualify (fail closed)", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    world.executions = [validExecution()];
    const builder = world.builder({ runVerifiersOnBuild: false });
    await expect(
      builder.recordEvidence({
        kind: "Evidence",
        schema_version: "1.0.0",
        tenant_id: "local",
        evidence_id: "evd_nosubject1",
        work_id: WORK_ID,
        subject: { kind: "CRITERION", ref: "crit_tests" },
        criterion_ref: { goal_contract_id: "goal_abc123def", goal_contract_version: 1, criterion_id: "crit_tests" },
        evidence_kind: "unit_test",
        method: { kind: "AUTOMATED_TEST", description: "claimed independent" },
        result: "PASS",
        produced_by: { executor_id: VERIFIER_ID, executor_version: "1.0.0" },
        tested_artifacts: [{ sha256: "aa".repeat(32) }],
        environment: { runtime: "node" },
        provenance: "OBSERVED",
        observed_at: "2026-11-15T12:00:00.000Z",
        limitations: ["missing subject"],
      }),
    ).rejects.toBeInstanceOf(InvalidEvidenceError);
  });
});
