import { describe, expect, it } from "vitest";
import { authorizeGoalVersion, compileIntent, markText, type IntentIngest } from "../../../src/v4/goal/index.js";
import type { GoalContract } from "../../../src/v4/contracts/index.js";

const NOW = "2026-11-15T12:00:00.000Z";
const human = { kind: "HUMAN" as const, id: "operator" };
const executor = { kind: "EXECUTOR" as const, id: "executor_worker01" };

function intent(): IntentIngest {
  return {
    objective: markText("Ship a versioned Goal Contract with visible premises", "USER_DIRECT"),
    acceptance_criteria: [
      {
        statement: markText("Mandatory criterion remains explicit", "USER_DIRECT"),
        mandatory: true,
        verification_methods: ["HUMAN_REVIEW"],
        evidence_required: ["review_note"],
      },
    ],
    actor: human,
  };
}

function compiled(actor = human): GoalContract {
  return compileIntent(intent(), {
    work_id: "work_m01ver0001",
    goal_contract_id: "goal_m01ver0001",
    version: 1,
    now: NOW,
    actor,
  }).contract;
}

describe("M01 Goal Contract versioning (D15)", () => {
  it("rejects executor-authored versions", () => {
    const next = compiled(executor);
    const gate = authorizeGoalVersion({ actor: executor, next });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("D15_EXECUTOR_CANNOT_VERSION");
  });

  it("requires policy_decision_id to raise autonomy on an ACCEPTED contract", () => {
    const previous: GoalContract = { ...compiled(), status: "ACCEPTED" };
    const next: GoalContract = {
      ...previous,
      version: 2,
      supersedes_version: 1,
      execution: { ...previous.execution, autonomy: "L3_AUTONOMOUS" },
    };
    const denied = authorizeGoalVersion({ actor: human, previous, next });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.code).toBe("D15_POLICY_REQUIRED");

    const allowed = authorizeGoalVersion({
      actor: human,
      previous,
      next,
      policy_decision_id: "pdec_abc123def",
    });
    expect(allowed.allowed).toBe(true);
  });

  it("requires policy_decision_id to drop a mandatory criterion", () => {
    const previous: GoalContract = { ...compiled(), status: "ACCEPTED" };
    const next: GoalContract = {
      ...previous,
      version: 2,
      supersedes_version: 1,
      acceptance_criteria: previous.acceptance_criteria.map((c) => ({ ...c, mandatory: false })),
    };
    const denied = authorizeGoalVersion({ actor: human, previous, next });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.code).toBe("D15_POLICY_REQUIRED");
  });

  it("enforces INV-GC-05 revision chain", () => {
    const previous = compiled();
    const next: GoalContract = { ...previous, version: 3, supersedes_version: 1 };
    const gate = authorizeGoalVersion({ actor: human, previous, next });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.code).toBe("INV-GC-05");
  });
});
