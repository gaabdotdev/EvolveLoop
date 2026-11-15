import { describe, expect, it } from "vitest";
import { validateWorkProof } from "../../../src/v4/contracts/index.js";
import {
  EMPTY_AUTHORIZATION_FOR_GAP_PREFIX,
  GENERATED_BY_EQUALS_SUBJECT_GAP,
  UNAUTHORIZED_EXTERNAL_GAP_PREFIX,
  isCiteableAuthzRef,
  reassessProof,
  refsFromLedgerPolicyDecided,
} from "../../../src/v4/proof/index.js";
import {
  NOW,
  WORKER_ID,
  WORK_ID,
  committedEffect,
  externalEffect,
  passingReport,
  policyDecidedEvent,
  reportArtifact,
  validArtifact,
  validExecution,
  validGoal,
} from "./fixtures.js";
import { seededWorld } from "./world.js";

async function provenReadyWorld() {
  const world = seededWorld();
  world.seedGoal(validGoal());
  world.executions = [validExecution()];
  world.putArtifact(validArtifact());
  const { artifact, bytes } = reportArtifact(passingReport());
  world.putArtifact(artifact, bytes);
  return world;
}

describe("M06 authz / origin (D13, RR-W5-05, RR-W5-02 honesty)", () => {
  it("INTERNAL committed effects still reach PROVEN (control: authz cap is EXTERNAL-only)", async () => {
    const world = await provenReadyWorld();
    world.effects = [committedEffect()];
    const proof = await world.builder().build(WORK_ID);
    expect(validateWorkProof(proof).valid).toBe(true);
    expect(proof.final_status).toBe("PROVEN");
  });

  it("caps open-effect PARTIAL and does not regress that frozen rule", async () => {
    const world = await provenReadyWorld();
    world.effects = [committedEffect({ state: "UNKNOWN" })];
    const proof = await world.builder().build(WORK_ID);
    expect(proof.final_status).toBe("PARTIAL");
    expect(proof.requirements[0]!.status).toBe("PROVEN");
  });

  it("EXTERNAL without verifiable authorization refs cannot be PROVEN", async () => {
    const world = await provenReadyWorld();
    world.effects = [externalEffect()];
    const proof = await world.builder().build(WORK_ID);
    expect(proof.final_status).not.toBe("PROVEN");
    expect(proof.final_status).toBe("PARTIAL");
    expect(proof.requirements[0]!.status).toBe("PARTIAL");
    expect(proof.requirements[0]!.gaps.some((g) => g.startsWith(UNAUTHORIZED_EXTERNAL_GAP_PREFIX))).toBe(true);
    expect(proof.provenance_refs.every((id) => isCiteableAuthzRef(id))).toBe(true);
  });

  it("empty authorizationFor is not authorized even when the effect carries a policy_decision_id claim", async () => {
    const world = await provenReadyWorld();
    world.effects = [externalEffect({ authorization: { policy_decision_id: "pdec_abc123def" } })];
    const proof = await world.builder({
      provenance: {
        authorizationFor: async () => [],
      },
    }).build(WORK_ID);
    expect(proof.final_status).not.toBe("PROVEN");
    expect(proof.final_status).toBe("PARTIAL");
    expect(proof.requirements[0]!.gaps.some((g) => g.startsWith(EMPTY_AUTHORIZATION_FOR_GAP_PREFIX))).toBe(true);
    expect(proof.provenance_refs.some((id) => id === "pdec_abc123def")).toBe(false);
  });

  it("does not invent grant ids when authorizationFor is empty", async () => {
    const world = await provenReadyWorld();
    world.effects = [externalEffect()];
    const proof = await world.builder({
      provenance: {
        authorizationFor: async () => ["", "chat:memory", "not-a-grant"],
      },
    }).build(WORK_ID);
    expect(proof.final_status).not.toBe("PROVEN");
    expect(JSON.stringify(proof)).not.toMatch(/grn/);
    expect(proof.provenance_refs.every((id) => isCiteableAuthzRef(id))).toBe(true);
  });

  it("EXTERNAL with citeable authorizationFor refs can be PROVEN", async () => {
    const world = await provenReadyWorld();
    world.effects = [externalEffect()];
    const proof = await world.builder({
      provenance: {
        authorizationFor: async () => ["pdec_abc123def", "evt_policydec01", "pol_abc123def"],
      },
    }).build(WORK_ID);
    expect(proof.final_status).toBe("PROVEN");
    expect(proof.provenance_refs).toEqual(expect.arrayContaining(["pdec_abc123def", "evt_policydec01"]));
  });

  it("ledger policy.decided (M11 unwired) authorizes EXTERNAL; DENY cannot", async () => {
    const allowWorld = await provenReadyWorld();
    allowWorld.effects = [externalEffect()];
    allowWorld.events.push(policyDecidedEvent({ decision: "ALLOW" }));
    const allowed = await allowWorld.builder().build(WORK_ID);
    expect(allowed.final_status).toBe("PROVEN");
    expect(allowed.provenance_refs).toEqual(expect.arrayContaining(["pdec_abc123def", "evt_policydec01"]));

    const denyWorld = await provenReadyWorld();
    denyWorld.effects = [externalEffect()];
    denyWorld.events.push(policyDecidedEvent({ decision: "DENY" }));
    const denied = await denyWorld.builder().build(WORK_ID);
    expect(denied.final_status).not.toBe("PROVEN");
    expect(denied.requirements[0]!.gaps.some((g) => g.startsWith(UNAUTHORIZED_EXTERNAL_GAP_PREFIX))).toBe(true);
  });

  it("caps PROVEN when generated_by.verifier_id equals the subject executor (RR-W5-05)", async () => {
    const world = await provenReadyWorld();
    world.effects = [committedEffect()];
    const proof = await world.builder({ builderId: WORKER_ID }).build(WORK_ID);
    expect(proof.generated_by.verifier_id).toBe(WORKER_ID);
    expect(proof.final_status).not.toBe("PROVEN");
    expect(proof.final_status).toBe("PARTIAL");
    expect(proof.requirements[0]!.gaps).toContain(GENERATED_BY_EQUALS_SUBJECT_GAP);
    expect(proof.limitations.some((l) => l.includes("RR-W5-05"))).toBe(true);
  });

  it("third-party reassess caps a self-generated PROVEN proof (RR-W5-05)", async () => {
    const world = await provenReadyWorld();
    world.effects = [committedEffect()];
    const proof = await world.builder().build(WORK_ID);
    expect(proof.final_status).toBe("PROVEN");
    const poisoned = {
      ...proof,
      generated_by: { verifier_id: WORKER_ID, verifier_version: proof.generated_by.verifier_version },
    };
    const evidence = await world.evidence.listByWork(WORK_ID);
    const hashes = new Set((await world.listArtifacts(WORK_ID)).map((a) => a.content.sha256));
    const assessment = reassessProof({
      proof: poisoned,
      goal: validGoal(),
      evidence,
      now: NOW,
      current_artifact_hashes: hashes,
      subject_executor_id: WORKER_ID,
    });
    expect(assessment.derived_final).toBe("PARTIAL");
    expect(assessment.honest).toBe(false);
  });

  it("reassess caps PROVEN when EXTERNAL effects lacked authorization refs", async () => {
    const world = await provenReadyWorld();
    world.effects = [committedEffect()];
    const proof = await world.builder().build(WORK_ID);
    const evidence = await world.evidence.listByWork(WORK_ID);
    const hashes = new Set((await world.listArtifacts(WORK_ID)).map((a) => a.content.sha256));
    const assessment = reassessProof({
      proof,
      goal: validGoal(),
      evidence,
      now: NOW,
      current_artifact_hashes: hashes,
      unauthorized_external_effect_ids: ["eff_external01"],
    });
    expect(assessment.derived_final).toBe("PARTIAL");
    expect(assessment.honest).toBe(false);
  });

  it("refsFromLedgerPolicyDecided never invents ids and rejects DENY", () => {
    const allow = policyDecidedEvent({ decision: "ALLOW" });
    expect(refsFromLedgerPolicyDecided([allow], "pdec_abc123def")).toEqual(
      expect.arrayContaining(["pdec_abc123def", "evt_policydec01", "pol_abc123def"]),
    );
    expect(refsFromLedgerPolicyDecided([policyDecidedEvent({ decision: "DENY" })], "pdec_abc123def")).toEqual([]);
    expect(refsFromLedgerPolicyDecided([], "pdec_abc123def")).toEqual([]);
    expect(refsFromLedgerPolicyDecided([allow], "pdec_doesnotexist1")).toEqual([]);
  });
});
