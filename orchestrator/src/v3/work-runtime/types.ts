/**
 * V5-M01 — Persistent Work Runtime domain types (Work-first projections).
 * Reuses existing work_id; does not invent a parallel entity.
 */

import type { AgentRole, AgentState } from "../agent-registry/types.js";
import type { WorkState } from "../goal-contract/types.js";
import type { OrchestrationTask } from "../task-graph/types.js";
import type {
  AttemptExecutionModeRow,
  AttemptStatusRow,
} from "../state-db/types.js";

/** Dual-label: infrastructure Work + V4 product Task UX (ADR Q2 + ADR-001). */
export interface WorkUxDualLabel {
  infrastructure: "Work";
  product_v4: "Task";
}

/**
 * Distinguishes durable aggregate on disk from live OS/coordinator processes.
 * Closing TUI / REPLACED agent must not imply Work absence.
 */
export interface WorkLiveness {
  /** Aggregate readable from durable stores (ledger / coordinator / StateDb). */
  durable: boolean;
  /** Coordinator state claims running AND recorded pid is alive. */
  coordinator_process_alive: boolean;
  /** At least one ProcessSession for this work reports a live OS process. */
  has_live_process_session: boolean;
}

export interface WorkAgentRef {
  agent_id: string;
  role: AgentRole;
  state: AgentState;
  task_id?: string;
  replaced_by?: string;
}

/**
 * Canonical Work aggregate (read model) — âncora persistente V5.
 * Identity = existing work_id (CoordinatorWorkRecord / ledger / TaskGraph).
 */
export interface Work {
  kind: "Work";
  work_id: string;
  objective: string;
  work_state: WorkState;
  workspace_root: string;
  goal_contract_id?: string;
  goal_contract_version?: number;
  task_ids: string[];
  agent_refs: WorkAgentRef[];
  evidence_ids: string[];
  attempt_ids: string[];
  created_at: string;
  updated_at: string;
  pause_reason?: string;
  ux_dual_label: WorkUxDualLabel;
  liveness: WorkLiveness;
}

/** TaskGraph exposed as units under Work — not a second graph engine. */
export interface WorkGraphView {
  kind: "WorkGraphView";
  work_id: string;
  goal_contract_id: string;
  goal_contract_version: number;
  tasks: OrchestrationTask[];
  updated_at: string;
  /** Honest provenance: existing TaskGraphStore (JSON under v3 data dir). */
  source: "TaskGraphStore";
}

export type AttemptExecutionMode = AttemptExecutionModeRow;
export type AttemptStatus = AttemptStatusRow;

/**
 * Domain Attempt (M01 núcleo + M02 binding ProcessSession / ExecutionRunnerResult).
 * @see docs/v5/M02/README.md
 */
export interface Attempt {
  kind: "Attempt";
  attempt_id: string;
  work_id: string;
  task_id: string;
  agent_id?: string;
  /** Executor selected for this attempt (agent_id or native run handle). */
  executor_id?: string;
  /** Adapter bridge when known (cursor | claude-code | …). */
  adapter_id?: string;
  process_session_id?: string;
  run_id?: string;
  execution_mode: AttemptExecutionMode;
  status: AttemptStatus;
  idempotency_key?: string;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown>;
}

export interface WorkOpenInput {
  work_id: string;
  objective: string;
  goal_contract_id?: string;
  criteria?: Array<{
    id: string;
    description: string;
    mandatory?: boolean;
    evidence_required?: string[];
  }>;
  /** Optional seed tasks under the Work graph. */
  tasks?: Array<{
    task_id: string;
    title: string;
    depends_on?: string[];
    task_kind?: OrchestrationTask["task_kind"];
  }>;
}

export interface AttemptCreateInput {
  work_id: string;
  task_id: string;
  agent_id?: string;
  executor_id?: string;
  adapter_id?: string;
  process_session_id?: string;
  run_id?: string;
  execution_mode?: AttemptExecutionMode;
  status?: AttemptStatus;
  idempotency_key?: string;
  payload?: Record<string, unknown>;
}

/** Bind Attempt → owned ProcessSession (harness path). */
export interface AttemptBindSessionInput {
  attempt_id: string;
  process_session_id: string;
  /** Defaults to harness when binding a ProcessSession. */
  execution_mode?: AttemptExecutionMode;
  executor_id?: string;
  adapter_id?: string;
  agent_id?: string;
  status?: AttemptStatus;
}

/**
 * Close Attempt from ExecutionRunnerResult (native path).
 * Does NOT change Work.work_state — Attempt failure ≠ Work failure.
 */
export interface AttemptBindRunnerResultInput {
  attempt_id: string;
  result: {
    status: "ok" | "timeout" | "failed" | "cancelled" | "blocked";
    exit_code: number | null;
    code: string;
    duration_ms: number;
    pid?: number;
    limitations?: string[];
  };
  run_id?: string;
  executor_id?: string;
  adapter_id?: string;
  execution_mode?: AttemptExecutionMode;
}

export interface WorkPauseInput {
  work_id: string;
  reason: string;
}

/** Compact row for `evolve work list` (M07). */
export interface WorkListItem {
  kind: "WorkListItem";
  work_id: string;
  objective: string;
  work_state: WorkState;
  attempt_count: number;
  task_count: number;
  durable: boolean;
  updated_at: string;
}

/**
 * Status summary — workspace-wide or single Work (M07).
 * Same projection source as CLI/TUI bridge (work-runtime).
 */
export interface WorkStatusSummary {
  kind: "WorkStatusSummary";
  workspace_root: string;
  work_id?: string;
  total_works: number;
  by_state: Record<string, number>;
  total_attempts: number;
  works_with_live_session: number;
  works: WorkListItem[];
  generated_at: string;
}
