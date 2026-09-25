/**
 * Failure Containment + Recovery + Anti-Stagnation types (V3-F5 start).
 * Sources: EVOLVELOOP_V3 Meta 36, 61–64, §243–245, §253–256.
 */

import type { SafetyState } from "../contracts/types.js";

/** Meta 36 — explicit outcome states. NEVER coerce UNKNOWN/null → PASS. */
export const OUTCOME_STATUSES = [
  "PASS",
  "FAIL",
  "BLOCKED",
  "UNCERTAIN",
  "PARTIAL",
  "DEGRADED",
  "NOT_MEASURED",
] as const;

export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

/** Narrowest-safe-boundary containment actions (Meta 61 / §243). */
export const CONTAINMENT_ACTIONS = [
  "quarantine_goal",
  "quarantine_capability",
  "pause_agency",
  "escalate_human",
  "degrade_autonomy",
] as const;

export type ContainmentAction = (typeof CONTAINMENT_ACTIONS)[number];

/** Failure domains ordered from narrow → wide (§243). */
export const CONTAINMENT_DOMAINS = [
  "action",
  "capability",
  "provider",
  "agent",
  "project",
  "workspace",
  "system",
] as const;

export type ContainmentDomain = (typeof CONTAINMENT_DOMAINS)[number];

/**
 * Recovery hierarchy — least intervention first (Briefing V3-F5;
 * aligns Meta 62 progressive escalation → HUMAN GATE).
 */
export const RECOVERY_HIERARCHY_STEPS = [
  "retry",
  "replan",
  "rollback_checkpoint",
  "quarantine",
  "human_gate",
] as const;

export type RecoveryStep = (typeof RECOVERY_HIERARCHY_STEPS)[number];

export type StagnationSignal =
  | "repeated_action"
  | "repeated_hypothesis"
  | "repeated_failure"
  | "no_state_progress"
  | "oscillation";

export interface StagnationEvent {
  action_id?: string;
  hypothesis_id?: string;
  failure_signature?: string;
  /** Opaque fingerprint of goal/world progress; unchanged ⇒ no progress. */
  state_fingerprint?: string;
  at?: string;
}

export interface StagnationReport {
  stagnant: boolean;
  signals: StagnationSignal[];
  window_size: number;
  recommended_action: "change_strategy" | "replan" | "escalate" | "continue";
}

export interface SafetyTransitionResult {
  from: SafetyState;
  to: SafetyState;
  allowed: boolean;
  reason: string;
}

export interface ClassifiedOutcome {
  status: OutcomeStatus;
  /** True only when status === PASS. */
  is_pass: boolean;
  /** True when raw was missing / UNKNOWN / empty — fail-closed path. */
  fail_closed: boolean;
  raw_kind: "nullish" | "empty" | "unknown_token" | "recognized" | "unrecognized" | "non_string";
}
