import { describe, it, expect } from "vitest";
import {
  GoalStore,
  AgencyLoop,
  AutonomyGovernor,
  selectGovernorAction,
  proposalToCapabilityIR,
  decideAutonomy,
} from "../../../src/v3/index.js";

function seededPortfolio() {
  const store = new GoalStore();
  store.create({
    id: "goal-low",
    desired_outcome: "Generate report",
    risk_policy: "low capability=documentation",
    non_goals: ["capability:documentation"],
  });
  store.accept("goal-low", { reason: "accept" });
  store.activate("goal-low", { reason: "activate" });

  store.create({
    id: "goal-high",
    desired_outcome: "Deploy production",
    risk_policy: "high",
    constraints: ["no-prod-without-gate"],
  });
  store.accept("goal-high", { reason: "accept" });
  store.activate("goal-high", { reason: "activate" });

  store.create({
    id: "goal-proposed",
    desired_outcome: "Should be ignored",
  });

  store.create({
    id: "goal-verifying",
    desired_outcome: "Verify report",
    risk_policy: "low capability=documentation",
    non_goals: ["capability:documentation"],
  });
  store.accept("goal-verifying", { reason: "accept" });
  store.activate("goal-verifying", { reason: "activate" });
  store.transition("goal-verifying", "verifying", { reason: "oracle check" });

  return store.portfolio("pf-1", {
    "goal-high": 10,
    "goal-low": 1,
    "goal-verifying": 5,
  });
}

describe("V3 AgencyLoop", () => {
  it("emits proposals for active/verifying goals only and does not execute", () => {
    const loop = new AgencyLoop();
    const result = loop.step({
      portfolio: seededPortfolio(),
      world: { snapshot_id: "w1", observed_at: "2026-09-24T00:00:00.000Z" },
      policy: {
        snapshot_id: "p1",
        policy_ref: "high-reliability",
        captured_at: "2026-09-24T00:00:00.000Z",
      },
    });

    expect(result.proposals).toHaveLength(3);
    expect(result.proposals.map((p) => p.goal_id)).toEqual([
      "goal-high",
      "goal-verifying",
      "goal-low",
    ]);
    expect(result.proposals.every((p) => p.intent.startsWith("pursue:"))).toBe(true);
    expect(result.world_snapshot_id).toBe("w1");
    // Agency proposes only — no provider / engine side effects in result shape.
    expect(result.proposals[2]!.capability_hint).toBe("documentation");
    // AR-H01: world/policy consumed into rationale (never void-ignored)
    expect(result.proposals.every((p) => p.rationale?.includes("policy_ref="))).toBe(true);
  });

  it("AR-H01: contradiction open_signals bump risk and appear in rationale", () => {
    const loop = new AgencyLoop();
    const result = loop.step({
      portfolio: seededPortfolio(),
      world: {
        snapshot_id: "w-contra",
        observed_at: "2026-09-24T00:00:00.000Z",
        open_signals: [
          "contradictory:b1:contradicts edge from b1 while both beliefs are active",
        ],
        belief_ids: ["b1", "b2"],
      },
      policy: {
        snapshot_id: "p1",
        policy_ref: "high-reliability",
        captured_at: "2026-09-24T00:00:00.000Z",
      },
    });

    const low = result.proposals.find((p) => p.goal_id === "goal-low");
    expect(low).toBeTruthy();
    // low → medium after contradiction bump
    expect(low!.risk).toBe("medium");
    expect(low!.rationale).toMatch(/open_signals/);
    expect(low!.rationale).toMatch(/belief_ids=b1,b2/);
    expect(low!.rationale).toMatch(/world_contradiction/);
    expect(low!.governor_required).toBe(true);
  });
});

describe("V3 AutonomyGovernor", () => {
  const governor = new AutonomyGovernor();

  it("allows low risk under NORMAL safety", () => {
    expect(selectGovernorAction("low", "NORMAL")).toBe("allow");
    const decided = governor.decide({
      proposal: {
        proposal_id: "prop-1",
        goal_id: "g",
        intent: "pursue:x",
        risk: "low",
        governor_required: false,
        capability_hint: "documentation",
      },
      safety_state: "NORMAL",
    });
    expect(decided.action).toBe("allow");
    expect(decided.level).toBe("AUTONOMOUS");
    expect(decided.decision.spec.level).toBe("AUTONOMOUS");
    expect(decided.decision.spec.policy_ref).toBeTruthy();
    expect(decided.decision.spec.inputs.safety_state).toBe("NORMAL");
  });

  it("denies critical risk and quarantined safety", () => {
    expect(selectGovernorAction("critical", "NORMAL")).toBe("deny");
    expect(selectGovernorAction("low", "QUARANTINED")).toBe("deny");

    const denied = decideAutonomy({
      proposal: {
        proposal_id: "prop-deny",
        goal_id: "g",
        intent: "pursue:danger",
        risk: "critical",
        governor_required: true,
      },
      safety_state: "NORMAL",
    });
    expect(denied.action).toBe("deny");
    expect(denied.level).toBe("BLOCK");
  });

  it("confirms high risk and degrades under RESTRICTED", () => {
    expect(selectGovernorAction("high", "NORMAL")).toBe("confirm");
    expect(selectGovernorAction("medium", "RESTRICTED")).toBe("degrade");
  });

  it("FW-H01 limits actions under degraded safety states", () => {
    expect(selectGovernorAction("low", "RECOVERING")).toBe("degrade");
    expect(selectGovernorAction("medium", "RECOVERING")).toBe("confirm");
    expect(selectGovernorAction("high", "RECOVERING")).toBe("deny");
    expect(selectGovernorAction("critical", "SUSPECT")).toBe("deny");
    expect(selectGovernorAction("low", "SUSPECT")).toBe("degrade");

    // critical never stamped AUTONOMOUS
    const critical = decideAutonomy({
      proposal: {
        proposal_id: "prop-crit",
        goal_id: "g",
        intent: "pursue:crit",
        risk: "critical",
        governor_required: true,
      },
      safety_state: "NORMAL",
    });
    expect(critical.decision.spec.level).not.toBe("AUTONOMOUS");
    expect(critical.decision.spec.level).toBe("BLOCK");
  });
});

describe("V3 proposalToCapabilityIR bridge", () => {
  const proposal = {
    proposal_id: "prop-bridge",
    goal_id: "goal-low",
    intent: "pursue:Generate report",
    capability_hint: "documentation",
    risk: "low" as const,
    governor_required: false,
  };

  it("maps allow + hint to CapabilityIR skeleton without executing", () => {
    const result = proposalToCapabilityIR(proposal, "allow");
    expect(result.status).toBe("ir");
    expect(result.executed).toBe(false);
    if (result.status === "ir") {
      expect(result.ir.apiVersion).toBe("capability-orchestrator.io/v2");
      expect(result.ir.kind).toBe("CapabilityGraph");
      expect(result.ir.spec.nodes[0]!.capability).toBe("documentation");
      expect(result.ir.spec.assumptions).toContain("MUST NOT be executed by Agency Layer");
    }
  });

  it("returns needs_planner on deny and on missing hint", () => {
    const denied = proposalToCapabilityIR(proposal, "deny");
    expect(denied.status).toBe("needs_planner");
    expect(denied.executed).toBe(false);

    const noHint = proposalToCapabilityIR(
      { ...proposal, capability_hint: undefined },
      "allow",
    );
    expect(noHint.status).toBe("needs_planner");
  });

  it("returns needs_planner on confirm (human gate)", () => {
    const confirmed = proposalToCapabilityIR(proposal, "confirm");
    expect(confirmed.status).toBe("needs_planner");
  });
});
