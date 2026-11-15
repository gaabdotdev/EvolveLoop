import { describe, expect, it } from "vitest";
import { assertConforms, isIndependent, validateEvidence } from "../../../src/v4/contracts/index.js";
import {
  DeterministicVerifier,
  SelfVerificationRefused,
  VerifierIdentityError,
  evaluateTestReport,
  parseTestReport,
} from "../../../src/v4/proof/index.js";
import {
  CODE_SHA,
  VERIFIER_ID,
  WORKER_ID,
  WORK_ID,
  failingReport,
  goalWithIntegrity,
  passingReport,
  reportArtifact,
  validArtifact,
  validGoal,
} from "./fixtures.js";
import { seededWorld } from "./world.js";

describe("M06 deterministic verifier", () => {
  it("emits independent AUTOMATED_TEST PASS from a test-report artifact", async () => {
    const world = seededWorld();
    const { artifact, bytes } = reportArtifact(passingReport());
    world.putArtifact(validArtifact());
    world.putArtifact(artifact, bytes);
    const evidence = await world.verifier().verify({
      work_id: WORK_ID,
      goal_contract: validGoal(),
      criterion_id: "crit_tests",
      artifacts: await world.listArtifacts(WORK_ID),
      subject_executor_id: WORKER_ID,
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.result).toBe("PASS");
    expect(evidence[0]!.method.kind).toBe("AUTOMATED_TEST");
    expect(evidence[0]!.produced_by.executor_id).toBe(VERIFIER_ID);
    expect(evidence[0]!.subject_executor_ref?.executor_id).toBe(WORKER_ID);
    expect(isIndependent(evidence[0]!)).toBe(true);
    expect(validateEvidence(evidence[0]!).valid).toBe(true);
    expect(assertConforms(evidence[0]!).valid).toBe(true);
    expect(evidence[0]!.tested_artifacts.some((a) => a.sha256 === CODE_SHA)).toBe(true);
  });

  it("emits FAIL when the deterministic report contains a failing test", async () => {
    const world = seededWorld();
    const { artifact, bytes } = reportArtifact(failingReport());
    world.putArtifact(artifact, bytes);
    const evidence = await world.verifier().verify({
      work_id: WORK_ID,
      goal_contract: validGoal(),
      criterion_id: "crit_tests",
      artifacts: await world.listArtifacts(WORK_ID),
      subject_executor_id: WORKER_ID,
    });
    expect(evidence[0]!.result).toBe("FAIL");
  });

  it("emits INCONCLUSIVE for an empty test list", () => {
    expect(evaluateTestReport({ ...passingReport(), tests: [] })).toBe("INCONCLUSIVE");
  });

  it("rejects a malformed labeled test report as ERROR, not PASS", async () => {
    const world = seededWorld();
    const { artifact } = reportArtifact(passingReport());
    world.putArtifact(artifact, new TextEncoder().encode("{not-json"));
    const evidence = await world.verifier().verify({
      work_id: WORK_ID,
      goal_contract: validGoal(),
      criterion_id: "crit_tests",
      artifacts: await world.listArtifacts(WORK_ID),
      subject_executor_id: WORKER_ID,
    });
    expect(evidence[0]!.result).toBe("ERROR");
  });

  it("integrity rule PASS/FAIL via ArtifactStorePort.verify", async () => {
    const world = seededWorld();
    world.putArtifact(validArtifact());
    const goal = goalWithIntegrity();
    const pass = await world.verifier().verify({
      work_id: WORK_ID,
      goal_contract: goal,
      criterion_id: "crit_integrity",
      artifacts: await world.listArtifacts(WORK_ID),
      subject_executor_id: WORKER_ID,
    });
    expect(pass[0]!.result).toBe("PASS");
    expect(pass[0]!.evidence_kind).toBe("artifact_integrity");

    world.putArtifact(validArtifact({ integrity_status: "MISMATCH" }));
    const fail = await world.verifier().verify({
      work_id: WORK_ID,
      goal_contract: goal,
      criterion_id: "crit_integrity",
      artifacts: await world.listArtifacts(WORK_ID),
      subject_executor_id: WORKER_ID,
    });
    expect(fail[0]!.result).toBe("FAIL");
  });

  it("refuses to run when verifier_id equals the subject executor", async () => {
    const world = seededWorld();
    await expect(
      world.verifier().verify({
        work_id: WORK_ID,
        goal_contract: validGoal(),
        criterion_id: "crit_tests",
        artifacts: [],
        subject_executor_id: VERIFIER_ID,
      }),
    ).rejects.toBeInstanceOf(SelfVerificationRefused);
  });

  it("rejects a verifier_id that is not an executor id", () => {
    expect(() => new DeterministicVerifier({ verifier_id: "not-an-id" })).toThrow(VerifierIdentityError);
  });

  it("parseTestReport fails closed on wrong kind", () => {
    const parsed = parseTestReport(new TextEncoder().encode(JSON.stringify({ kind: "Nope", tests: [] })));
    expect(parsed.ok).toBe(false);
  });
});
