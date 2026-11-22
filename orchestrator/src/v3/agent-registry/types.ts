/**
 * Agent Registry — live agent instances (≠ Capability Registry).
 */

export type AgentState =
  | "INITIALIZING"
  | "ACTIVE"
  | "WAITING"
  | "YIELDING"
  | "LIMIT_REACHED"
  | "FAILED"
  | "STALE"
  | "ORPHANED"
  | "REPLACED"
  | "COMPLETED"
  | "CANCELLED";

export type AgentRole =
  | "master"
  | "leader"
  | "planner"
  | "worker"
  | "auxiliary"
  | "verifier"
  | "coordinator";

export interface DelegationContract {
  delegation_id: string;
  parent_agent_id: string;
  child_agent_id: string;
  role: AgentRole;
  objective: string;
  scope: string[];
  out_of_scope: string[];
  task_id: string;
  authorized_inputs: string[];
  deliverables: string[];
  criteria_ids: string[];
  permissions: {
    allowShell?: boolean;
    allowWrite?: boolean;
    allowNetwork?: boolean;
    allowHostInspect?: boolean;
    allowSpawn?: boolean;
  };
  budget: {
    max_tokens?: number;
    max_cost_usd?: number;
    max_duration_ms?: number;
    max_children?: number;
  };
  expected_evidence: string[];
  timeout_ms?: number;
  escalation_agent_id?: string;
  termination_condition: string;
  created_at: string;
}

export interface AgentRecord {
  agent_id: string;
  role: AgentRole;
  domain?: string;
  parent_agent_id?: string;
  child_agent_ids: string[];
  task_id?: string;
  work_id: string;
  provider_id?: string;
  model_id?: string;
  session_id?: string;
  state: AgentState;
  last_heartbeat_at: string;
  last_activity_at: string;
  checkpoint_ref?: string;
  budget_consumed: {
    tokens?: number;
    cost_usd?: number;
    duration_ms?: number;
  };
  permissions: DelegationContract["permissions"];
  delegation_id?: string;
  lease_expires_at?: string;
  created_at: string;
  updated_at: string;
  replace_of?: string;
  replaced_by?: string;
}

export interface AgentRegistrySnapshot {
  kind: "AgentRegistry";
  work_id: string;
  agents: AgentRecord[];
  delegations: DelegationContract[];
  updated_at: string;
}
