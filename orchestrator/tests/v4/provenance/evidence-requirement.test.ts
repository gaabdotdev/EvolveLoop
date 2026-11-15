import { describe, expect, it } from "vitest";
import {
  ARTIFACT_BYTES,
  ARTIFACT_SHA,
  EVD,
  GOAL,
  PROOF,
  VERIFIER,
  WORK,
  WORKER,
  appendAll,
  createWorld,
  draft,
  seedWorkCreated,
  validArtifact,
  validEvidence,
  validGoal,
  validWork,
} from "./helpers.js";

async function seedProvingWorld() {
  const world = createWorld();
  world.works.seedGoal(validGoal());
  world.works.seedWork(validWork());
  world.artifacts.seed(validArtifact({ origin: {} }), ARTIFACT_BYTES);
  world.evidence.seed(validEvidence());
  await seedWorkCreated(world.ledger);
  await appendAll(world.ledger, [
    draft("evt_artregis01", "artifact.registered", {
      artifact_id: validArtifact().artifact_id,
      content: { sha256: ARTIFACT_SHA, size_bytes: ARTIFACT_BYTES.byteLength, media_type: "text/plain" },
    }),
    draft("evt_evdrecord1", "evidence.recorded", {
      evidence_id: EVD,
      work_id: WORK,
      criterion_id: "crit_tests",
      goal_contract_id: GOAL,
      goal_contract_version: 1,
      evidence_kind: "unit_test",
      method_kind: "AUTOMATED_TEST",
      result: "PASS",
    }),
  ]);
  return world;
}

describe("evidenceForRequirement", () => {
  it("returns independent PASS evidence and its evidence.recorded event", async () => {
    const world = await seedProvingWorld();
    const refs = await world.graph.evidenceForRequirement(GOAL, 1, "crit_tests");
    expect(refs).toContain(EVD);
    expect(refs).toContain("evt_evdrecord1");
  });

  it("includes a WorkProof id only when it cites the same qualifying evidence", async () => {
    const world = await seedProvingWorld();
    world.proofs.latest = {
      kind: "WorkProof",
      schema_version: "1.0.0",
      tenant_id: "local",
      proof_id: PROOF,
      work_id: WORK,
      goal_contract_ref: { id: GOAL, version: 1 },
      requirements: [
        { criterion_id: "crit_tests", mandatory: true, status: "PROVEN", evidence_ids: [EVD], gaps: [] },
      ],
      artifact_ids: [],
      execution_ids: [],
      effects: [],
      provenance_refs: [],
      limitations: ["unit tests only"],
      final_status: "PROVEN",
      generated_by: { verifier_id: VERIFIER, verifier_version: "1.0.0" },
      generated_at: "2026-11-15T12:00:00.000Z",
    };
    await appendAll(world.ledger, [
      draft("evt_proofissue1", "proof.issued", {
        proof_id: PROOF,
        work_id: WORK,
        final_status: "PROVEN",
        goal_contract_id: GOAL,
        goal_contract_version: 1,
      }),
    ]);

    const refs = await world.graph.evidenceForRequirement(GOAL, 1, "crit_tests");
    expect(refs).toContain(PROOF);
    expect(refs).toContain("evt_proofissue1");
  });

  it("fail-closed: SELF_REPORTED is not independent proof", async () => {
    const world = createWorld();
    world.works.seedGoal(validGoal());
    world.artifacts.seed(validArtifact({ origin: {} }), ARTIFACT_BYTES);
    world.evidence.seed(
      validEvidence({
        method: { kind: "SELF_REPORTED", description: "I tested it" },
        provenance: "SELF_REPORTED",
        produced_by: { executor_id: WORKER, executor_version: "1.0.0" },
      }),
    );
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_evdrecord1", "evidence.recorded", {
        evidence_id: EVD,
        work_id: WORK,
        criterion_id: "crit_tests",
        goal_contract_id: GOAL,
        goal_contract_version: 1,
        evidence_kind: "unit_test",
        method_kind: "SELF_REPORTED",
        result: "PASS",
      }),
    ]);

    const answer = await world.graph.inspectEvidenceForRequirement(GOAL, 1, "crit_tests");
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("self_reported_as_independent");
    expect(answer.refs).not.toContain(EVD);
  });

  it("fail-closed: verifier == subject executor cannot prove the requirement", async () => {
    const world = createWorld();
    world.works.seedGoal(validGoal());
    world.artifacts.seed(validArtifact({ origin: {} }), ARTIFACT_BYTES);
    world.evidence.seed(
      validEvidence({
        produced_by: { executor_id: WORKER, executor_version: "1.0.0" },
        subject_executor_ref: { executor_id: WORKER, executor_version: "1.0.0" },
      }),
    );
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_evdrecord1", "evidence.recorded", {
        evidence_id: EVD,
        work_id: WORK,
        criterion_id: "crit_tests",
        goal_contract_id: GOAL,
        goal_contract_version: 1,
        method_kind: "AUTOMATED_TEST",
        result: "PASS",
        evidence_kind: "unit_test",
      }),
    ]);

    const answer = await world.graph.inspectEvidenceForRequirement(GOAL, 1, "crit_tests");
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("self_reported_as_independent");
  });

  it("fail-closed: wrong Goal Contract version is not proof", async () => {
    const world = await seedProvingWorld();
    world.works.seedGoal(validGoal({ version: 2 }));
    world.evidence.seed(
      validEvidence({
        criterion_ref: { goal_contract_id: GOAL, goal_contract_version: 1, criterion_id: "crit_tests" },
      }),
    );

    const answer = await world.graph.inspectEvidenceForRequirement(GOAL, 2, "crit_tests");
    expect(answer.refs).toEqual([]);
    expect(["wrong_goal_contract_version", "requirement_not_proved", "decision_not_in_ledger"]).toContain(
      answer.closed,
    );
  });

  it("fail-closed: stale / mismatched tested artifact hash", async () => {
    const world = await seedProvingWorld();
    world.artifacts.verifyOverride.set(ARTIFACT_SHA, "MISMATCH");

    const answer = await world.graph.inspectEvidenceForRequirement(GOAL, 1, "crit_tests");
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("hash_mismatch");
  });

  it("fail-closed: missing goal, unknown criterion, evidence not in the log", async () => {
    const world = createWorld();
    expect(await world.graph.inspectEvidenceForRequirement(GOAL, 1, "crit_tests")).toMatchObject({
      refs: [],
      closed: "missing_ref",
    });

    world.works.seedGoal(validGoal());
    expect(await world.graph.inspectEvidenceForRequirement(GOAL, 1, "crit_missing")).toMatchObject({
      refs: [],
      closed: "missing_ref",
    });

    const logged = createWorld();
    logged.works.seedGoal(validGoal());
    logged.artifacts.seed(validArtifact({ origin: {} }), ARTIFACT_BYTES);
    logged.evidence.seed(validEvidence());
    await seedWorkCreated(logged.ledger);
    const notInLog = await logged.graph.inspectEvidenceForRequirement(GOAL, 1, "crit_tests");
    expect(notInLog.refs).toEqual([]);
    expect(notInLog.closed).toBe("decision_not_in_ledger");
  });
});
