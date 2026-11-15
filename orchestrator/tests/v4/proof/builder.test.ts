import { describe, expect, it } from "vitest";
import { assertConforms, isValidId, validateWorkProof } from "../../../src/v4/contracts/index.js";
import { ImmutableProofError, traceProof } from "../../../src/v4/proof/index.js";
import {
  WORK_ID,
  committedEffect,
  goalWithIntegrity,
  passingReport,
  reportArtifact,
  validArtifact,
  validExecution,
  validGoal,
  validTask,
} from "./fixtures.js";
import { seededWorld } from "./world.js";

describe("M06 WorkProof builder", () => {
  it("links Goal → requirement → artifact → execution → validation → evidence and yields PROVEN", async () => {
    const world = seededWorld();
    const goal = goalWithIntegrity();
    world.seedGoal(goal);
    world.executions = [validExecution()];
    world.tasks = [validTask()];
    world.effects = [committedEffect()];
    world.putArtifact(validArtifact());
    const { artifact, bytes } = reportArtifact(passingReport());
    world.putArtifact(artifact, bytes);

    const proof = await world.builder().build(WORK_ID);
    expect(validateWorkProof(proof).valid).toBe(true);
    expect(assertConforms(proof).valid).toBe(true);
    expect(isValidId("proof", proof.proof_id)).toBe(true);
    expect(proof.goal_contract_ref).toEqual({ id: goal.goal_contract_id, version: 1 });
    expect(proof.final_status).toBe("PROVEN");
    expect(proof.requirements.every((r) => r.status === "PROVEN")).toBe(true);
    expect(proof.artifact_ids.length).toBeGreaterThanOrEqual(2);
    expect(proof.execution_ids).toContain(validExecution().execution_id);

    const evidence = await world.evidence.listByWork(WORK_ID);
    const trace = traceProof({ proof, evidence, artifacts: await world.listArtifacts(WORK_ID), executions: world.executions });
    const tests = trace.links.find((l) => l.criterion_id === "crit_tests")!;
    expect(tests.evidence_ids.length).toBeGreaterThan(0);
    expect(tests.validations.some((v) => v.method === "AUTOMATED_TEST" && v.result === "PASS")).toBe(true);
    expect(tests.artifacts.some((a) => a.sha256 === validArtifact().content.sha256)).toBe(true);
    expect(tests.execution_ids).toContain(validExecution().execution_id);
    const integrity = trace.links.find((l) => l.criterion_id === "crit_integrity")!;
    expect(integrity.validations.some((v) => v.method === "DETERMINISTIC_RULE")).toBe(true);

    const issued = world.events.filter((e) => e.type === "proof.issued");
    expect(issued).toHaveLength(1);
    expect(issued[0]!.payload.proof_id).toBe(proof.proof_id);
    expect(issued[0]!.actor.kind).toBe("VERIFIER");
    expect(world.events.some((e) => e.type === "evidence.recorded")).toBe(true);
  });

  it("caps PROVEN at PARTIAL when an effect is still open (UNKNOWN)", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    world.executions = [validExecution()];
    world.effects = [committedEffect({ state: "UNKNOWN" })];
    const { artifact, bytes } = reportArtifact(passingReport());
    world.putArtifact(validArtifact());
    world.putArtifact(artifact, bytes);
    const proof = await world.builder().build(WORK_ID);
    expect(proof.final_status).toBe("PARTIAL");
    expect(proof.requirements[0]!.status).toBe("PROVEN");
  });

  it("FAILED when independent tests fail", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    world.executions = [validExecution()];
    world.effects = [committedEffect()];
    world.putArtifact(validArtifact());
    const { artifact, bytes } = reportArtifact({
      ...passingReport(),
      tests: [{ name: "boom", passed: false }],
    });
    world.putArtifact(artifact, bytes);
    const proof = await world.builder().build(WORK_ID);
    expect(proof.final_status).toBe("FAILED");
  });

  it("UNVERIFIED when there is no qualifying evidence", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    world.executions = [validExecution()];
    const proof = await world.builder({ runVerifiersOnBuild: false }).build(WORK_ID);
    expect(proof.final_status).toBe("UNVERIFIED");
    expect(proof.requirements[0]!.gaps.length).toBeGreaterThan(0);
  });

  it("PARTIAL when a required evidence kind is missing", async () => {
    const world = seededWorld();
    world.seedGoal(
      validGoal({
        acceptance_criteria: [
          {
            criterion_id: "crit_tests",
            statement: "tests + integrity",
            mandatory: true,
            origin: "USER_STATED",
            verification_methods: ["AUTOMATED_TEST"],
            evidence_required: ["unit_test", "artifact_integrity"],
          },
        ],
      }),
    );
    world.executions = [validExecution()];
    world.effects = [committedEffect()];
    const { artifact, bytes } = reportArtifact(passingReport());
    world.putArtifact(validArtifact());
    world.putArtifact(artifact, bytes);
    const proof = await world.builder().build(WORK_ID);
    expect(proof.final_status).toBe("PARTIAL");
    expect(proof.requirements[0]!.gaps.some((g) => g.startsWith("missing_evidence_kind:"))).toBe(true);
  });

  it("emits a successor proof with supersedes_proof_id and refuses in-place mutation", async () => {
    const world = seededWorld();
    world.seedGoal(validGoal());
    world.executions = [validExecution()];
    const first = await world.builder({ runVerifiersOnBuild: false, idsTag: "one" }).build(WORK_ID);
    const second = await world.builder({ runVerifiersOnBuild: false, idsTag: "two" }).build(WORK_ID);
    expect(second.supersedes_proof_id).toBe(first.proof_id);
    expect(second.proof_id).not.toBe(first.proof_id);
    await expect(world.proofs.put(first)).rejects.toBeInstanceOf(ImmutableProofError);
  });
});
