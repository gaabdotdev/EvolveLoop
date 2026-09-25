import { describe, it, expect } from "vitest";
import {
  V3_API_VERSION,
  V3_SCHEMA_VERSION,
  GoalStore,
  SilentDeleteForbiddenError,
  InvalidGoalTransitionError,
  SuccessOracle,
  evaluateCriterion,
  evaluateGoal,
  isEligibleEvidenceRef,
  GOAL_LIFECYCLE_STATES,
  type SuccessOracleCriterion,
} from "../../../src/v3/index.js";

function criterion(
  id: string,
  method: string,
  required = true,
): SuccessOracleCriterion {
  return {
    apiVersion: V3_API_VERSION,
    kind: "SuccessOracleCriterion",
    metadata: { schema_version: V3_SCHEMA_VERSION },
    spec: {
      criterion_id: id,
      type: "functional",
      required,
      measurement: "stub",
      threshold: id === "cb1" ? "ext-cb-1" : "ok",
      evidence_source: "test",
      verification_method: method,
      status: "pending",
    },
  };
}

/** proposed → accepted → active (operational path §176). */
function activateGoal(store: GoalStore, id: string): void {
  store.accept(id, { reason: "accept", actor: "test" });
  store.activate(id, { reason: "activate", actor: "test" });
}

describe("V3 GoalStore", () => {
  it("creates proposed goals and accepts then activates", () => {
    const store = new GoalStore();
    const created = store.create({
      id: "g1",
      desired_outcome: "Ship demo",
      success_criteria_refs: ["c1"],
      parent_goal_id: "g-root",
    });
    expect(created.spec.lifecycle_state).toBe("proposed");
    expect(created.metadata.parent_goal_id).toBe("g-root");
    expect(created.spec.goal_version.revision).toBe(1);

    const accepted = store.accept("g1", { reason: "operator accept", actor: "test" });
    expect(accepted.spec.lifecycle_state).toBe("accepted");
    expect(accepted.spec.goal_version.revision).toBe(2);

    const active = store.activate("g1", {
      reason: "start work",
      actor: "test",
      evidence: ["ev/accept"],
      policy_snapshot: "pol-1",
    });
    expect(active.spec.lifecycle_state).toBe("active");
    expect(active.spec.goal_version.revision).toBe(3);

    const hist = store.mutationHistory("g1");
    expect(hist).toHaveLength(2);
    expect(hist[1]).toMatchObject({
      goal_id: "g1",
      parent_goal_id: "g-root",
      from_state: "accepted",
      to_state: "active",
      reason: "start work",
      evidence: ["ev/accept"],
      policy_snapshot: "pol-1",
      actor: "test",
    });
    expect(hist[1]!.version.revision).toBe(3);
    expect(hist[1]!.timestamp).toBeTruthy();
  });

  it("refuses silent delete", () => {
    const store = new GoalStore();
    store.create({ id: "g-del", desired_outcome: "x" });
    expect(() => store.delete("g-del")).toThrow(SilentDeleteForbiddenError);
    expect(() => store.delete()).toThrow(SilentDeleteForbiddenError);
    expect(store.get("g-del")).toBeTruthy();
  });

  it("supersedes with version bump and marks previous superseded", () => {
    const store = new GoalStore();
    store.create({ id: "g-old", desired_outcome: "v1 outcome" });
    activateGoal(store, "g-old");
    const { previous, next } = store.supersede(
      "g-old",
      { id: "g-new", desired_outcome: "v2 outcome" },
      { reason: "scope change", actor: "test" },
    );
    expect(previous.spec.lifecycle_state).toBe("superseded");
    expect(next.metadata.id).toBe("g-new");
    expect(next.spec.lifecycle_state).toBe("proposed");
    expect(next.spec.goal_version.minor).toBe(previous.spec.goal_version.minor + 1);
    expect(next.spec.goal_version.revision).toBe(1);
  });

  it("bumps revision on mutateSpec and rejects invalid transitions", () => {
    const store = new GoalStore();
    store.create({ id: "g2", desired_outcome: "a" });
    const mutated = store.mutateSpec(
      "g2",
      { desired_outcome: "b" },
      { reason: "clarify", actor: "test" },
    );
    expect(mutated.spec.desired_outcome).toBe("b");
    expect(mutated.spec.goal_version.revision).toBe(2);

    expect(() => store.transition("g2", "completed", { reason: "too soon" })).toThrow(
      InvalidGoalTransitionError,
    );
  });

  it("supports active↔blocked/paused/replanning and verifying→completed", () => {
    const store = new GoalStore();
    store.create({ id: "g-flow", desired_outcome: "flow" });
    activateGoal(store, "g-flow");
    store.transition("g-flow", "blocked", { reason: "dep missing", actor: "test" });
    store.transition("g-flow", "active", { reason: "dep ready", actor: "test" });
    store.transition("g-flow", "paused", { reason: "hold", actor: "test" });
    store.transition("g-flow", "replanning", { reason: "new plan", actor: "test" });
    store.transition("g-flow", "verifying", { reason: "check oracle", actor: "test" });
    const done = store.transition("g-flow", "completed", {
      reason: "oracle pass",
      actor: "test",
      evidence: ["ev/proof"],
    });
    expect(done.spec.lifecycle_state).toBe("completed");
  });

  it("abandons via explicit transition (not delete)", () => {
    const store = new GoalStore();
    store.create({ id: "g3", desired_outcome: "x" });
    const abandoned = store.transition("g3", "abandoned", {
      reason: "cancelled by operator",
      actor: "test",
    });
    expect(abandoned.spec.lifecycle_state).toBe("abandoned");
  });

  it("exposes §176 lifecycle enum", () => {
    expect(GOAL_LIFECYCLE_STATES).toEqual([
      "proposed",
      "accepted",
      "active",
      "blocked",
      "paused",
      "replanning",
      "verifying",
      "completed",
      "abandoned",
      "cancelled",
      "expired",
      "failed",
      "superseded",
    ]);
  });
});

describe("V3 SuccessOracle", () => {
  const oracle = new SuccessOracle();

  it("PASS on presence_of_evidence when refs exist", () => {
    const c = criterion("c1", "presence_of_evidence");
    const result = evaluateCriterion(c, { evidence_refs: ["evidence:c1:run"] });
    expect(result.pass).toBe(true);
    expect(result.status).toBe("met");
  });

  it("FAIL on presence_of_evidence when refs empty", () => {
    const c = criterion("c1", "presence_of_evidence");
    const result = evaluateCriterion(c, { evidence_refs: [] });
    expect(result.pass).toBe(false);
    expect(result.status).toBe("unmet");
  });

  it("AR-C01: rejects synthetic run:* refs for presence_of_evidence", () => {
    const c = criterion("c1", "presence_of_evidence");
    const result = evaluateCriterion(c, {
      evidence_refs: ["run:goal:finished", "run:feature:state"],
    });
    expect(result.pass).toBe(false);
    expect(result.status).toBe("unmet");
    expect(result.rationale).toMatch(/run:\*|evidence:/i);
  });

  it("SEC-003: rejects bare paths for presence_of_evidence", () => {
    const c = criterion("c1", "presence_of_evidence");
    const result = evaluateCriterion(c, {
      evidence_refs: ["/tmp/evil.json", "artifacts/out.bin", "provider:mock"],
    });
    expect(result.pass).toBe(false);
    expect(result.status).toBe("unmet");
    expect(isEligibleEvidenceRef("lineage:abc")).toBe(true);
    expect(isEligibleEvidenceRef("check:dod-1")).toBe(true);
    expect(isEligibleEvidenceRef("/tmp/x")).toBe(false);
  });

  it("evaluates boolean_predicate and external_callback_ref", () => {
    const boolOk = evaluateCriterion(criterion("b1", "boolean_predicate"), {
      evidence_refs: ["evidence:b1"],
      boolean_results: { b1: true },
    });
    expect(boolOk.pass).toBe(true);

    const boolFail = evaluateCriterion(criterion("b1", "boolean_predicate"), {
      evidence_refs: ["evidence:b1"],
      boolean_results: { b1: false },
    });
    expect(boolFail.pass).toBe(false);

    const cb = evaluateCriterion(criterion("cb1", "external_callback_ref"), {
      evidence_refs: ["evidence:cb"],
      callback_results: { "ext-cb-1": true },
    });
    expect(cb.pass).toBe(true);
  });

  it("builds GoalSatisfactionProof success/failure for a goal", () => {
    const store = new GoalStore();
    const goal = store.create({
      id: "g-oracle",
      desired_outcome: "done",
      success_criteria_refs: ["c1"],
    });
    activateGoal(store, "g-oracle");
    const map = new Map([["c1", criterion("c1", "presence_of_evidence")]]);

    const pass = oracle.evaluateGoal(store.get("g-oracle")!, map, {
      evidence_refs: ["evidence:pass"],
    });
    expect(pass.decision).toBe("success");
    expect(pass.proof.spec.decision).toBe("success");

    const fail = evaluateGoal(goal, map, { evidence_refs: [] });
    expect(fail.decision).toBe("failure");
  });
});
