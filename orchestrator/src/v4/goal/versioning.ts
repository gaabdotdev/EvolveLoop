/**
 * Goal Contract versioning rules (INV-GC-05, TM-V4-D15).
 *
 * Executors cannot version the contract. Autonomy raises and mandatory-criteria
 * weakening against an ACCEPTED predecessor require a `policy_decision_id`
 * (M10 validates the decision; M01 fail-closes if the id is missing).
 */

import { isValidId, type ActorRef, type GoalContract } from "../contracts/index.js";

const AUTONOMY_RANK: Record<GoalContract["execution"]["autonomy"], number> = {
  L0_OBSERVE: 0,
  L1_EXECUTE: 1,
  L2_SUPERVISED: 2,
  L3_AUTONOMOUS: 3,
};

export type VersioningRejection = {
  allowed: false;
  code: "D15_EXECUTOR_CANNOT_VERSION" | "D15_ACTOR_CANNOT_VERSION" | "D15_POLICY_REQUIRED" | "INV-GC-05";
  message: string;
};

export type VersioningAllowance = { allowed: true };

export function actorMayVersionGoal(actor: ActorRef): VersioningRejection | VersioningAllowance {
  if (actor.kind === "EXECUTOR") {
    return {
      allowed: false,
      code: "D15_EXECUTOR_CANNOT_VERSION",
      message: "Executors cannot version the Goal Contract (TM-V4-D15)",
    };
  }
  if (actor.kind !== "HUMAN" && actor.kind !== "PLATFORM") {
    return {
      allowed: false,
      code: "D15_ACTOR_CANNOT_VERSION",
      message: `Actor kind ${actor.kind} cannot version the Goal Contract`,
    };
  }
  return { allowed: true };
}

export function autonomyRaised(previous: GoalContract, next: GoalContract): boolean {
  return AUTONOMY_RANK[next.execution.autonomy] > AUTONOMY_RANK[previous.execution.autonomy];
}

/** Mandatory criterion removed, demoted, or statement changed (possible weakening). */
export function mandatoryCriteriaWeakened(previous: GoalContract, next: GoalContract): boolean {
  const prevMand = previous.acceptance_criteria.filter((c) => c.mandatory);
  for (const c of prevMand) {
    const n = next.acceptance_criteria.find((x) => x.criterion_id === c.criterion_id);
    if (!n || !n.mandatory || n.statement !== c.statement) return true;
  }
  return false;
}

export function policyGateRequired(previous: GoalContract, next: GoalContract): boolean {
  if (previous.status !== "ACCEPTED") return false;
  return autonomyRaised(previous, next) || mandatoryCriteriaWeakened(previous, next);
}

export function assertRevisionChain(previous: GoalContract, next: GoalContract): VersioningRejection | VersioningAllowance {
  if (next.version !== previous.version + 1) {
    return {
      allowed: false,
      code: "INV-GC-05",
      message: `revision version must be ${previous.version + 1}`,
    };
  }
  if (next.supersedes_version !== previous.version) {
    return {
      allowed: false,
      code: "INV-GC-05",
      message: "supersedes_version must equal the previous version",
    };
  }
  if (next.goal_contract_id !== previous.goal_contract_id) {
    return {
      allowed: false,
      code: "INV-GC-05",
      message: "revisions keep the same goal_contract_id",
    };
  }
  if (next.work_id !== previous.work_id) {
    return {
      allowed: false,
      code: "INV-GC-05",
      message: "revisions stay on the same work_id",
    };
  }
  return { allowed: true };
}

export function authorizeGoalVersion(input: {
  actor: ActorRef;
  previous?: GoalContract;
  next: GoalContract;
  policy_decision_id?: string;
}): VersioningRejection | VersioningAllowance {
  const actorGate = actorMayVersionGoal(input.actor);
  if (!actorGate.allowed) return actorGate;
  if (input.previous) {
    const chain = assertRevisionChain(input.previous, input.next);
    if (!chain.allowed) return chain;
    if (policyGateRequired(input.previous, input.next)) {
      if (!isValidId("policy_decision", input.policy_decision_id)) {
        return {
          allowed: false,
          code: "D15_POLICY_REQUIRED",
          message:
            "Raising autonomy or weakening mandatory criteria on an ACCEPTED contract requires a policy_decision_id (M10)",
        };
      }
    }
  } else if (input.next.version !== 1 || input.next.supersedes_version !== undefined) {
    return { allowed: false, code: "INV-GC-05", message: "version 1 cannot supersede anything" };
  }
  return { allowed: true };
}
