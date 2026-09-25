/**
 * AutonomyGovernor — deterministic allow|deny|confirm|degrade over proposal.risk + safety_state.
 * Emits AutonomyGovernorDecision contract records; does not replace Policy Engine.
 * FW-H01: decisions must satisfy AUTONOMY_GOVERNOR_DECISION_MATRIX.
 */

import { V3_API_VERSION, V3_SCHEMA_VERSION } from "../contracts/common.js";
import {
  assertAutonomyGovernorDecisionConstraints,
  degradedModeForSafetyState,
} from "../contracts/enforcement.js";
import type {
  AutonomyGovernorDecision,
  AutonomyGovernorLevel,
  SafetyState,
} from "../contracts/types.js";
import { validateAutonomyGovernorDecision } from "../contracts/validators.js";
import { isSafetyState } from "../failure/safety-transitions.js";
import type { AgencyProposal, GovernorAction, GovernorDecideInput } from "./types.js";

export interface GovernorDecisionResult {
  action: GovernorAction;
  level: AutonomyGovernorLevel;
  decision: AutonomyGovernorDecision;
}

const ACTION_TO_LEVEL: Record<GovernorAction, AutonomyGovernorLevel> = {
  allow: "AUTONOMOUS",
  confirm: "HUMAN_GATE",
  degrade: "AUTONOMOUS_WITH_REVIEW",
  deny: "BLOCK",
};

/**
 * Normalize + validate safety_state at the governor boundary (SEC-009).
 * Trim + exact enum match. Unknown / casing variants → null (caller denies).
 * Whitespace-padded valid enums coerce to the canonical SafetyState.
 */
export function coerceSafetyState(raw: unknown): SafetyState | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!isSafetyState(trimmed)) return null;
  return trimmed;
}

/**
 * Deterministic rules aligned to AUTONOMY_GOVERNOR_DECISION_MATRIX (FW-H01):
 * - invalid / unknown safety_state → deny (fail-closed)
 * - QUARANTINED → deny
 * - RESTRICTED + critical/high → deny; else degrade
 * - SUSPECT + critical → deny; high → confirm; else degrade
 * - RECOVERING → degraded: high/critical deny; medium confirm; low degrade
 * - critical → deny (even NORMAL) — irreversible path; never AUTONOMOUS
 * - high → confirm
 * - medium → allow if NORMAL/RESTORED else confirm
 * - low → allow (degrade if SUSPECT/RESTRICTED/RECOVERING handled above)
 */
export function selectGovernorAction(
  risk: AgencyProposal["risk"],
  safety_state: SafetyState | string,
): GovernorAction {
  const state = coerceSafetyState(safety_state);
  if (!state) return "deny";

  if (state === "QUARANTINED") return "deny";

  if (state === "RESTRICTED") {
    if (risk === "critical" || risk === "high") return "deny";
    return "degrade";
  }

  if (state === "SUSPECT") {
    if (risk === "critical") return "deny";
    if (risk === "high") return "confirm";
    return "degrade";
  }

  if (state === "RECOVERING") {
    if (risk === "critical" || risk === "high") return "deny";
    if (risk === "medium") return "confirm";
    return "degrade";
  }

  // NORMAL | RESTORED
  if (risk === "critical") return "deny";
  if (risk === "high") return "confirm";
  if (risk === "medium") {
    return state === "NORMAL" || state === "RESTORED" ? "allow" : "confirm";
  }
  return "allow";
}

function buildDecision(
  input: GovernorDecideInput,
  action: GovernorAction,
): AutonomyGovernorDecision {
  const level = ACTION_TO_LEVEL[action];
  const decided_at = input.decided_at ?? new Date().toISOString();
  const proposal = input.proposal;
  const reversibility =
    proposal.risk === "critical" || proposal.risk === "high"
      ? "irreversible"
      : proposal.risk === "medium"
        ? "conditionally_reversible"
        : "reversible";

  const decision: AutonomyGovernorDecision = {
    apiVersion: V3_API_VERSION,
    kind: "AutonomyGovernorDecision",
    metadata: {
      schema_version: V3_SCHEMA_VERSION,
      decision_id: `gov-${proposal.proposal_id}`,
    },
    spec: {
      inputs: {
        risk: proposal.risk,
        reversibility,
        authority: input.authority ?? "agency-layer",
        confidence: input.confidence ?? 0.8,
        impact:
          proposal.risk === "critical"
            ? "global"
            : proposal.risk === "high"
              ? "external"
              : proposal.risk === "medium"
                ? "subsystem"
                : "local",
        cost: proposal.risk === "low" ? "low" : proposal.risk === "medium" ? "medium" : "high",
        environment: input.environment ?? "stub",
        safety_state: input.safety_state,
      },
      level,
      rationale: `governor action=${action} risk=${proposal.risk} safety=${input.safety_state}`,
      decided_at,
      degraded_mode: degradedModeForSafetyState(input.safety_state),
      // Policy Engine remains authority; required when not BLOCK (FW-H01).
      ...(level !== "BLOCK"
        ? { policy_ref: input.policy_ref ?? "agency-default-policy" }
        : input.policy_ref
          ? { policy_ref: input.policy_ref }
          : {}),
    },
  };

  const matrix = assertAutonomyGovernorDecisionConstraints(decision);
  if (!matrix.valid) {
    throw new Error(`AutonomyGovernorDecision matrix violation: ${matrix.errors.join("; ")}`);
  }

  const validation = validateAutonomyGovernorDecision(decision);
  if (!validation.valid) {
    throw new Error(`AutonomyGovernorDecision invalid: ${validation.errors.join("; ")}`);
  }
  return decision;
}

export function decideAutonomy(input: GovernorDecideInput): GovernorDecisionResult {
  const coerced = coerceSafetyState(input.safety_state);
  // Fail-closed: unknown safety stamps as QUARANTINED for the decision record.
  const safety_state: SafetyState = coerced ?? "QUARANTINED";
  const action = selectGovernorAction(input.proposal.risk, safety_state);
  const decision = buildDecision({ ...input, safety_state }, action);
  return {
    action,
    level: ACTION_TO_LEVEL[action],
    decision,
  };
}

export class AutonomyGovernor {
  decide(input: GovernorDecideInput): GovernorDecisionResult {
    return decideAutonomy(input);
  }
}
