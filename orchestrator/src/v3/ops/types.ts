/**
 * EvolveLoop V3.6 — Global Operations Plane domain types.
 * Spec: docs/v3.6/EVOLVELOOP_V3.6_GOALS_AND_ARCHITECTURE_v1.0.md
 */

export type ProjectAvailability = "AVAILABLE" | "PAUSED_ADMISSION" | "ARCHIVED" | "UNHEALTHY";

export type WorkflowState =
  | "SUBMITTED"
  | "VALIDATING"
  | "QUEUED"
  | "WAITING_DEPENDENCY"
  | "WAITING_RESOURCE"
  | "ADMITTED"
  | "RUNNING"
  | "PAUSING"
  | "PAUSED"
  | "RECOVERING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "BLOCKED";

export type ServiceClass = "interactive" | "standard" | "batch" | "background";

export type DependencyType = "finish_to_start" | "artifact" | "soft";

export type DependencyState = "PENDING" | "SATISFIED" | "FAILED" | "CANCELLED";

export type ReservationState = "HELD" | "EXPIRED" | "RELEASED" | "RECONCILING";

export type ResourceScopeKind = "host" | "project" | "workflow" | "task" | "agent";

export type ResourceType =
  | "cpu"
  | "memory_mb"
  | "processes"
  | "disk_mb"
  | "workflows"
  | "agents"
  | "harness_sessions"
  | "provider_requests"
  | "time_ms"
  | "tokens"
  | "cost_usd";

export type ProvenanceKind = "measured" | "estimated" | "unavailable" | "policy_limit";

export type GateRequirement = "required" | "optional" | "unavailable" | "not_applicable";

export interface ProjectRecord {
  kind: "ProjectRecord";
  project_id: string;
  name: string;
  description: string;
  canonical_path: string;
  git_remote?: string;
  git_head?: string;
  default_branch: string;
  data_dir: string;
  availability: ProjectAvailability;
  policy: ProjectPolicy;
  created_at: string;
  updated_at: string;
  archived_at?: string;
}

export interface ProjectPolicy {
  version: number;
  quality_gates: QualityGateSpec[];
  sandbox_profile: string;
  max_concurrent_workflows: number;
  max_agents: number;
  allowed_harnesses: string[];
  require_approval_for_integration: boolean;
  protected_branches: string[];
  resource_limits: Partial<Record<ResourceType, number>>;
  allow_cross_project_artifacts: boolean;
}

export interface QualityGateSpec {
  gate_id: string;
  name: string;
  requirement: GateRequirement;
  command?: string;
  cwd?: string;
  timeout_ms: number;
  expected_exit_code: number;
  phase: "pre_integration" | "post_integration" | "both";
  provenance: ProvenanceKind;
}

export interface WorkflowRecord {
  kind: "WorkflowRecord";
  workflow_id: string;
  project_id: string;
  objective: string;
  goal_contract_id?: string;
  priority: number;
  service_class: ServiceClass;
  deadline_at?: string;
  state: WorkflowState;
  wait_reason?: string;
  block_reason?: string;
  dependency_ids: string[];
  budget: WorkflowBudget;
  reservation_ids: string[];
  policy_ref?: string;
  runtime: {
    data_dir?: string;
    work_id?: string;
    coordinator_associated: boolean;
  };
  evidence_refs: string[];
  team_plan_id?: string;
  submitted_at: string;
  updated_at: string;
  admitted_at?: string;
  started_at?: string;
  finished_at?: string;
  history: WorkflowTransition[];
}

export interface WorkflowBudget {
  max_agents?: number;
  max_duration_ms?: number;
  max_cost_usd?: number;
  max_tokens?: number;
  /** When usage is unavailable, only call/time limits may apply. */
  usage_provenance: ProvenanceKind;
}

export interface WorkflowTransition {
  at: string;
  from: WorkflowState;
  to: WorkflowState;
  actor: string;
  reason?: string;
}

export interface WorkflowDependency {
  kind: "WorkflowDependency";
  dependency_id: string;
  predecessor_id: string;
  successor_id: string;
  type: DependencyType;
  release_condition: string;
  state: DependencyState;
  failure_policy: "block_successor" | "cancel_successor" | "continue";
  cross_project: boolean;
  artifact_ref?: string;
  created_at: string;
  updated_at: string;
}

export interface QueueEntry {
  kind: "QueueEntry";
  workflow_id: string;
  project_id: string;
  effective_priority: number;
  base_priority: number;
  service_class: ServiceClass;
  submitted_at: string;
  admission_attempts: number;
  wait_reason?: string;
  aging_boost: number;
  fairness_key: string;
}

export interface ResourceReservation {
  kind: "ResourceReservation";
  reservation_id: string;
  resource_type: ResourceType;
  quantity: number;
  unit: string;
  owner: string;
  scope: ResourceScopeKind;
  scope_id: string;
  lease_expires_at: string;
  state: ReservationState;
  provenance: ProvenanceKind;
  release_policy: "on_success" | "on_terminal" | "manual";
  created_at: string;
  updated_at: string;
  parent_reservation_id?: string;
}

export interface AgentTeamPlan {
  kind: "AgentTeamPlan";
  plan_id: string;
  workflow_id: string;
  roles: Array<{
    role: string;
    count: number;
    capabilities: string[];
    budget?: WorkflowBudget;
  }>;
  justification: string;
  alternatives: string[];
  expected_benefit: string;
  resources_planned: Partial<Record<ResourceType, number>>;
  resources_allocated: Partial<Record<ResourceType, number>>;
  decision_context: Record<string, unknown>;
  created_at: string;
  outcome?: string;
}

export interface SchedulerPolicy {
  kind: "SchedulerPolicy";
  version: number;
  max_global_workflows: number;
  max_per_project: number;
  aging_ms_per_boost: number;
  max_aging_boost: number;
  service_class_weight: Record<ServiceClass, number>;
  fairness_window: number;
  updated_at: string;
}

export interface SchedulerDecision {
  kind: "SchedulerDecision";
  decision_id: string;
  at: string;
  workflow_id: string;
  action: "admit" | "wait" | "block" | "pause" | "resume" | "cancel" | "recover";
  reason: string;
  effective_priority?: number;
  details?: Record<string, unknown>;
}

export interface HostCapacity {
  cpu: number;
  memory_mb: number;
  processes: number;
  disk_mb: number;
  workflows: number;
  agents: number;
  harness_sessions: number;
  provider_requests: number;
}

export interface QualityGateResult {
  kind: "QualityGateResult";
  result_id: string;
  project_id: string;
  workflow_id: string;
  gate_id: string;
  requirement: GateRequirement;
  command?: string;
  cwd?: string;
  exit_code?: number;
  expected_exit_code: number;
  passed: boolean;
  phase: "pre_integration" | "post_integration";
  artifact_hash?: string;
  provenance: ProvenanceKind;
  stdout_tail?: string;
  stderr_tail?: string;
  started_at: string;
  finished_at: string;
}

export interface CrossProjectAccessAttempt {
  kind: "CrossProjectAccessAttempt";
  at: string;
  from_project_id: string;
  to_project_id: string;
  path: string;
  allowed: boolean;
  reason: string;
}
