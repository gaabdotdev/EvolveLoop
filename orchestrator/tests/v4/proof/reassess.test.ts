import { describe, expect, it } from "vitest";
import { reassessProof } from "../../../src/v4/proof/index.js";
import {
  NOW,
  WORK_ID,
  committedEffect,
  passingReport,
  reportArtifact,
  validArtifact,
  validExecution,
  validGoal,
} from "./fixtures.js";
import { seededWorld } from "./world.js";

describe("M06 third-party reassessment", () => {
  it("agrees with an honest PROVEN proof", async () => {
    const world = seededWorld();
    const goal = validGoal();
    world.seedGoal(goal);
    world.executions = [validExecution()];
    world.effects = [committedEffect()];
    world.putArtifact(validArtifact());
    const { artifact, bytes } = reportArtifact(passingReport());
    world.putArtifact(artifact, bytes);
    const proof = await world.builder().build(WORK_ID);
    const evidence = await world.evidence.listByWork(WORK_ID);
    const hashes = new Set((await world.listArtifacts(WORK_ID)).map((a) => a.content.sha256));
    const assessment = reassessProof({ proof, goal, evidence, now: NOW, current_artifact_hashes: hashes });
    expect(assessment.honest).toBe(true);
    expect(assessment.derived_final).toBe("PROVEN");
    expect(assessment.declared_final).toBe("PROVEN");
    expect(assessment.coverage).toEqual([]);
  });

  it("detects a forged PROVEN that is more optimistic than the evidence", async () => {
    const world = seededWorld();
    const goal = validGoal();
    world.seedGoal(goal);
    world.executions = [validExecution()];
    const proof = await world.builder({ runVerifiersOnBuild: false }).build(WORK_ID);
    expect(proof.final_status).toBe("UNVERIFIED");
    const forged = {
      ...proof,
      requirements: proof.requirements.map((r) => ({ ...r, status: "PROVEN" as const, gaps: [], evidence_ids: ["evd_forgedxxxx"] })),
      final_status: "PROVEN" as const,
    };
    const assessment = reassessProof({
      proof: forged,
      goal,
      evidence: await world.evidence.listByWork(WORK_ID),
      now: NOW,
      current_artifact_hashes: new Set(),
    });
    expect(assessment.honest).toBe(false);
    expect(assessment.derived_final).toBe("UNVERIFIED");
    expect(assessment.declared_final).toBe("PROVEN");
  });
});
