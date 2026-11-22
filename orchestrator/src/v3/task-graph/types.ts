/**
 * Orchestration TaskGraph — engineering tasks (distinct from GraphStore capability DAG).
 */

import type { TaskState } from "../goal-contract/types.js";

export type DomainRole =
  | "master"
  | "leader"
  | "planner"
  | "worker"
  | "auxiliary"
  | "verifier";

export type TaskKind = "plan" | "implement" | "verify" | "research" | "coordinate";

export interface OrchestrationTask {
  task_id: string;
  work_id: string;
  goal_contract_id: string;
  goal_contract_version: number;
  title: string;
  domain?: string;
  task_kind?: TaskKind;
  state: TaskState;
  owner_agent_id?: string;
  parent_task_id?: string;
  depends_on: string[];
  plan_version?: number;
  plan_approved?: boolean;
  /** Links to Capability IR / engine run when execution is delegated downward. */
  feature_id?: string;
  ir_id?: string;
  run_id?: string;
  evidence_ids: string[];
  /**
   * Path prefixes this task may mutate — used by parallel File-Ownership Locking
   * and by MSO strictly-disjoint checks (V0-ORCH-04 / V2-ORCH-01).
   */
  touch_paths?: string[];
  /** Explicit owned paths; merged with touch_paths for scheduler locking. */
  owned_paths?: string[];
  /** Logical modules declaring scope (treated as path-like prefixes for overlap). */
  modules?: string[];
  created_at: string;
  updated_at: string;
}

/** Deduplicated scope paths used for file-ownership locking. */
export function taskScopePaths(task: Pick<OrchestrationTask, "touch_paths" | "owned_paths" | "modules">): string[] {
  const raw = [...(task.touch_paths ?? []), ...(task.owned_paths ?? []), ...(task.modules ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of raw) {
    const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export interface TaskGraphSnapshot {
  kind: "OrchestrationTaskGraph";
  work_id: string;
  goal_contract_id: string;
  goal_contract_version: number;
  tasks: OrchestrationTask[];
  updated_at: string;
}

/**
 * Implementation tasks in a domain cannot start until the domain plan task is PLAN_APPROVED.
 */
export function canStartTask(task: OrchestrationTask, byId: Map<string, OrchestrationTask>): boolean {
  if (task.state !== "PENDING") return false;

  if (task.task_kind === "implement" && task.domain) {
    const planTask = [...byId.values()].find(
      (t) => t.domain === task.domain && t.task_kind === "plan",
    );
    if (!planTask || planTask.plan_approved !== true) return false;
  }

  for (const dep of task.depends_on) {
    const d = byId.get(dep);
    if (!d) return false;
    if (d.state !== "TRUE_PASS" && d.state !== "PARTIAL_PASS") return false;
  }
  return true;
}
