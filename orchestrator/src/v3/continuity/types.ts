/**
 * Agent Continuity — Handoff Package (V3).
 * Session limit/failure ≠ task terminal state.
 */

import type { AgentRole, AgentState } from "../agent-registry/types.js";
import type { TaskState } from "../goal-contract/types.js";

export type HandoffTrigger =
  | "LIMIT_REACHED"
  | "FAILED"
  | "STALE"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "MANUAL";

export interface HandoffPackage {
  kind: "HandoffPackage";
  handoff_id: string;
  work_id: string;
  goal_contract_id: string;
  goal_contract_version: number;
  task_id: string;
  from_agent_id: string;
  from_role: AgentRole;
  from_state: AgentState;
  trigger: HandoffTrigger;
  reason: string;
  /** Last verified task state — substitute must not rewind below this without cause. */
  verified_task_state: TaskState;
  verified_progress: {
    plan_approved?: boolean;
    plan_version?: number;
    evidence_ids: string[];
    feature_id?: string;
    ir_id?: string;
    run_id?: string;
    decisions: string[];
    next_action: string;
  };
  delegation_id?: string;
  permissions: {
    allowShell?: boolean;
    allowWrite?: boolean;
    allowNetwork?: boolean;
    allowHostInspect?: boolean;
    allowSpawn?: boolean;
  };
  budget_consumed: {
    tokens?: number;
    cost_usd?: number;
    duration_ms?: number;
  };
  child_agent_ids: string[];
  created_at: string;
  /** Filled when a substitute accepts the handoff. */
  to_agent_id?: string;
  applied_at?: string;
  status: "pending" | "applied" | "paused_no_substitute" | "cancelled";
  pause_reason?: string;
}
