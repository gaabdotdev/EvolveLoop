/**
 * Agency Layer local types (stubs) — additive over first-wave contracts.
 * Agency PROPOSES only; Runtime/Policy EXECUTES.
 */

import type { SafetyState } from "../contracts/types.js";
import type { GoalPortfolio } from "../goals/goal-store.js";

export type ProposalRisk = "low" | "medium" | "high" | "critical";

/**
 * Operational governor action (Briefing V3-F2).
 * Maps onto AutonomyGovernorDecision.spec.level:
 *   allow → AUTONOMOUS
 *   confirm → HUMAN_GATE
 *   degrade → AUTONOMOUS_WITH_REVIEW
 *   deny → BLOCK
 */
export const GOVERNOR_ACTIONS = ["allow", "deny", "confirm", "degrade"] as const;
export type GovernorAction = (typeof GOVERNOR_ACTIONS)[number];

export interface AgencyProposal {
  proposal_id: string;
  goal_id: string;
  intent: string;
  capability_hint?: string;
  risk: ProposalRisk;
  /** True when governor must decide before any downstream handoff. */
  governor_required: boolean;
  /**
   * World-grounded rationale (open_signals / belief_ids / risk bumps).
   * Empty when WorldSnapshot carries no signals — never silently void-ignored.
   */
  rationale?: string;
}

export interface WorldSnapshot {
  snapshot_id: string;
  observed_at: string;
  notes?: string[];
  open_signals?: string[];
  /** Additive — populated by WorldModelStore.toSnapshot(); optional for stub callers. */
  observation_ids?: string[];
  belief_ids?: string[];
}

export interface PolicySnapshot {
  snapshot_id: string;
  policy_ref: string;
  captured_at: string;
}

export interface AgencyLoopInput {
  portfolio: GoalPortfolio;
  world: WorldSnapshot;
  policy: PolicySnapshot;
  /** Optional risk override per goal_id. */
  risk_by_goal?: Record<string, ProposalRisk>;
}

export interface AgencyLoopResult {
  proposals: AgencyProposal[];
  emitted_at: string;
  world_snapshot_id: string;
  policy_snapshot_id: string;
}

export interface GovernorDecideInput {
  proposal: AgencyProposal;
  safety_state: SafetyState;
  authority?: string;
  environment?: string;
  confidence?: number;
  decided_at?: string;
  /** Policy Engine ref — required on non-BLOCK decisions (FW-H01). */
  policy_ref?: string;
}
