/**
 * Typed payload for M07-owned `plan.revised` (freeze R2).
 *
 * F12 names (`next_action`, `objective`, `permissions`, …) are never CONTROL
 * and are dropped by the allowlist. Autonomy is Policy (D06) — not a plan field.
 * Capability ranks/scores are forbidden (ADR-V4-0010).
 */

import { FORBIDDEN_CAPSULE_AUTHORITY_FIELDS, isRecord, type ValidationIssue } from "../contracts/index.js";

export const M07_EVENT_TYPES = ["plan.revised"] as const;
export type M07EventType = (typeof M07_EVENT_TYPES)[number];

export const M07_FORBIDDEN_PAYLOAD_CONTROL_NAMES = [
  ...FORBIDDEN_CAPSULE_AUTHORITY_FIELDS,
  "autonomy",
  "requested_autonomy",
  "global_score",
  "rank",
  "overall_score",
  "ranked_executor_ids",
  "prefer_executor_id",
] as const;

const ALLOWLIST: Record<M07EventType, readonly string[]> = {
  "plan.revised": [
    "plan_version",
    "from_plan_version",
    "work_id",
    "goal_contract_id",
    "goal_contract_version",
    "trigger",
    "justification",
    "obsolete_task_ids",
    "preserved_task_ids",
    "proposed_task_ids",
    "critical_path_task_ids",
    "independent_task_ids",
    "risks",
    "remaining_cost",
    "change_impact",
    "evidence_ids",
    "evidence_from_executor",
    "profiles_requested",
    "profiles_used_for_routing",
    "autonomy_requested",
  ],
};

export type PlanTriggerKind =
  | "INITIAL"
  | "NEW_EVIDENCE"
  | "DEPENDENCY_FAILED"
  | "RESOURCE_CHANGED"
  | "STRATEGY_STALLED"
  | "TASK_BLOCKED"
  | "RECOVERY";

export interface RemainingCostRecord {
  provenance: "UNAVAILABLE" | "DERIVED";
  amount: null;
  currency?: string;
  budget_max?: number;
  remaining_unknown: true;
}

export interface ChangeImpactRecord {
  added: number;
  preserved: number;
  obsoleted: number;
  interrupted: number;
}

export interface PlanRevisedPayload {
  plan_version: number;
  from_plan_version: number;
  work_id: string;
  goal_contract_id: string;
  goal_contract_version: number;
  trigger: PlanTriggerKind;
  justification: string;
  obsolete_task_ids: string[];
  preserved_task_ids: string[];
  proposed_task_ids: string[];
  critical_path_task_ids: string[];
  independent_task_ids: string[];
  risks: string[];
  remaining_cost: RemainingCostRecord;
  change_impact: ChangeImpactRecord;
  evidence_ids: string[];
  evidence_from_executor: boolean;
  profiles_requested: boolean;
  /** Always false until M08 methodology is ACCEPTED (ADR-V4-0010). */
  profiles_used_for_routing: false;
  autonomy_requested: false;
}

export function isM07EventType(type: string): type is M07EventType {
  return (M07_EVENT_TYPES as readonly string[]).includes(type);
}

export function allowlistM07Payload(type: M07EventType, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(ALLOWLIST[type]);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (allowed.has(key)) out[key] = payload[key];
  }
  return out;
}

export function controlFieldIssues(payload: unknown): ValidationIssue[] {
  if (!isRecord(payload)) return [{ code: "STRUCT", path: "payload", message: "must be an object" }];
  const issues: ValidationIssue[] = [];
  for (const name of M07_FORBIDDEN_PAYLOAD_CONTROL_NAMES) {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      issues.push({
        code: "INV-EVT-M07-R2",
        path: `payload.${name}`,
        message: `M07 payload must not carry CONTROL/score field "${name}" (D06 / ADR-V4-0010 / R2)`,
      });
    }
  }
  return issues;
}

export function assertNoControlFields(payload: Record<string, unknown>): void {
  const issues = controlFieldIssues(payload);
  if (issues.length > 0) {
    throw new Error(issues.map((i) => i.message).join("; "));
  }
}
