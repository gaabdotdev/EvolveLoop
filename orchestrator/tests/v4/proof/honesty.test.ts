import { describe, expect, it } from "vitest";
import {
  DEFAULT_TENANT_ID,
  EVIDENCE_SCHEMA_VERSION,
  isIndependent,
  type Evidence,
} from "../../../src/v4/contracts/index.js";
import { InvalidEvidenceError } from "../../../src/v4/proof/index.js";
import {
  CODE_SHA,
  NOW,
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

function independentEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    kind: "Evidence",
    schema_version: EVIDENCE_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    evidence_id: "evd_abc123def",
    work_id: WORK_ID,
    subject: { kind: "CRITERION", ref: "crit_tests" },
    criterion_ref: { goal_contract_id: "goal_abc123def", goal_contract_version: 1, criterion_id: "crit_tests" },
    evidence_kind: "unit_test",
    method: { kind: "AUTOMATED_TEST", description: "vitest" },
    result: "PASS",
    produced_by: { executor_id: VERIFIER_ID, executor_version: "1.0.0" },
    subject_executor_ref: { executor_id: WORKER_ID, executor_version: "1.0.0" },
    tested_artifacts: [{ sha256: CODE_SHA }],
    environment: { runtime: "node" },
    provenance: "OBSERVED",
    observed_at: NOW,
    limitations: ["does not prove production behaviour"],
    ...overrides,
  };
}

describe("M06 honesty — self-declaration, staleness, version, secrets, F16", () => {
  it("executor self-report never yields PROVEN even when the executor claims DONE", async () => {
    const world = seededWorld();
    const goal = validGoal();
    world.seedGoal(goal);
    world.executions = [validExecution({ result_claim: { claimed_status: "DONE", summary: "ship it" } })];
    const builder = world.builder({ runVerifiersOnBuild: false });
    const self = await builder.recordSelfReport({
      work_id: WORK_ID,
      goal_contract: goal,
      criterion_id: "crit_tests",
      subject_executor: { executor_id: WORKER_ID, executor_version: "1.0.0" },
      summary: "I ran the tests and they passed",
      evidence_kind: "unit_test",
      tested_artifacts: [{ sha256: CODE_SHA }],
    });
    expect(self.method.kind).toBe("SELF_REPORTED");
    expect(isIndependent(self)).toBe(false);
    const proof = await builder.build(WORK_ID);
    expect(proof.final_status).toBe("UNVERIFIED");
    expect(proof.limitations.some((l) => l.includes("result_claim"))).toBe(true);
    expect(proof.requirements[0]!.gaps.some((g) => g.startsWith("not_independent:"))).toBe(true);
  });

  it("stale artifact hashes cannot reach PROVEN", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    world.executions = [validExecution()];
    world.putArtifact(validArtifact());
    const builder = world.builder({ runVerifiersOnBuild: false });
    const staleHash = "aa".repeat(32);
    await builder.recordEvidence(
      independentEvidence({
        evidence_id: "evd_stalehash1",
        tested_artifacts: [{ sha256: staleHash }],
      }),
    );
    const proof = await builder.build(WORK_ID);
    expect(proof.final_status).not.toBe("PROVEN");
    expect(proof.requirements[0]!.gaps.some((g) => g.startsWith("stale_artifact:"))).toBe(true);
  });

  it("evidence bound to the wrong Goal Contract version cannot reach PROVEN (D15)", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal({ version: 2, supersedes_version: 1 }));
    world.work = { ...world.work, goal_contract_ref: { id: "goal_abc123def", version: 2 } };
    world.executions = [validExecution()];
    const builder = world.builder({ runVerifiersOnBuild: false });
    await builder.recordEvidence(
      independentEvidence({
        evidence_id: "evd_wrongvers1",
        criterion_ref: { goal_contract_id: "goal_abc123def", goal_contract_version: 1, criterion_id: "crit_tests" },
      }),
    );
    const proof = await builder.build(WORK_ID);
    expect(proof.final_status).not.toBe("PROVEN");
    expect(proof.requirements[0]!.gaps.some((g) => g.startsWith("wrong_goal_contract_version:"))).toBe(true);
  });

  it("refuses evidence that embeds a confidence constant (TM-V4-F16)", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    const builder = world.builder({ runVerifiersOnBuild: false });
    await expect(
      builder.recordEvidence({ ...independentEvidence(), confidence: 0.99 } as Evidence),
    ).rejects.toBeInstanceOf(InvalidEvidenceError);
  });

  it("refuses evidence that self-labels trust (TM-V4-F09)", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    const builder = world.builder({ runVerifiersOnBuild: false });
    await expect(
      builder.recordEvidence({ ...independentEvidence(), trust: "trusted_fixture" } as Evidence),
    ).rejects.toBeInstanceOf(InvalidEvidenceError);
  });

  it("refuses secret material in evidence (TM-V4-F11)", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    const builder = world.builder({ runVerifiersOnBuild: false });
    await expect(
      builder.recordEvidence(
        independentEvidence({
          limitations: ["token sk-abcdefghijklmnopqrstuvwxyz0123"],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidEvidenceError);
  });

  it("independent passing tests still become PROVEN (control: honesty does not block real proof)", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    world.executions = [validExecution()];
    world.putArtifact(validArtifact());
    const { artifact, bytes } = reportArtifact(passingReport());
    world.putArtifact(artifact, bytes);
    const proof = await world.builder().build(WORK_ID);
    expect(proof.final_status).toBe("PROVEN");
    expect(JSON.stringify(proof)).not.toMatch(/confidence/);
  });
});
