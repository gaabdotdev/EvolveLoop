/**
 * L0–L3 as *contextual* vocabulary (§4.10, §9.1): combination of policy ceiling,
 * work-scoped autonomy, action, resource, and risk — never a global agent permission.
 * Autonomy does not auto-escalate (D06).
 */

import type { AutonomyLevel, Policy, PolicyEffect, PolicyRule, RiskLevel } from "../contracts/index.js";
import { autonomyPermitsWrite } from "../contracts/index.js";
import { isSensitiveAction, isWriteAction, minAutonomy, RISK_RANK } from "./types.js";

export function effectiveAutonomy(policy: Policy, workAutonomy: AutonomyLevel | undefined): AutonomyLevel {
  if (!workAutonomy) return "L0_OBSERVE";
  return minAutonomy(policy.autonomy_ceiling, workAutonomy);
}

export function l3AllowHasLimits(rule: PolicyRule): boolean {
  return rule.conditions?.max_cost !== undefined && rule.conditions?.valid_until !== undefined;
}

/**
 * Overlay combineRuleEffects with the L0–L3 vocabulary. Combined rule effect is
 * the input; this function may only narrow (ALLOW → REQUIRE_APPROVAL or DENY).
 */
export function applyAutonomyOverlay(
  combined: PolicyEffect,
  input: {
    level: AutonomyLevel;
    action: string;
    risk: RiskLevel;
    matchedAllowRules: readonly PolicyRule[];
  },
): { effect: PolicyEffect; reason?: string } {
  const write = isWriteAction(input.action);
  const sensitive = isSensitiveAction(input.action, input.risk);

  if (!autonomyPermitsWrite(input.level) && write) {
    return { effect: "DENY", reason: "autonomy_L0_forbids_write" };
  }

  if (input.level === "L1_EXECUTE") {
    if (combined !== "ALLOW") return { effect: "DENY", reason: "l1_unlisted_action_denied" };
    if (sensitive || RISK_RANK[input.risk] > RISK_RANK.low) {
      return { effect: "DENY", reason: "l1_no_autonomy_escalation" };
    }
    return { effect: "ALLOW" };
  }

  if (input.level === "L2_SUPERVISED") {
    if (combined === "DENY") return { effect: "DENY" };
    if (combined === "REQUIRE_APPROVAL") return { effect: "REQUIRE_APPROVAL" };
    if (combined === "ALLOW" && sensitive) {
      return { effect: "REQUIRE_APPROVAL", reason: "l2_sensitive_requires_human" };
    }
    return { effect: combined };
  }

  if (input.level === "L3_AUTONOMOUS") {
    if (combined !== "ALLOW") return { effect: combined === "REQUIRE_APPROVAL" ? "REQUIRE_APPROVAL" : "DENY" };
    const unlimited = input.matchedAllowRules.filter((r) => r.effect === "ALLOW" && !l3AllowHasLimits(r));
    if (unlimited.length > 0) {
      return { effect: "DENY", reason: "l3_allow_missing_cost_or_time_limit" };
    }
    return { effect: "ALLOW" };
  }

  return { effect: combined === "ALLOW" && !write ? "ALLOW" : combined };
}
