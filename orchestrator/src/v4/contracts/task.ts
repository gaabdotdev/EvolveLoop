/**
 * Task v1 — unit of work with dependencies and expected result (constitution §5).
 * Producers: M01 (initial graph), M07 (replanning). Executors never set VERIFIED.
 */

import { type ContractHeader, type IsoTimestamp, type VersionedRef, validateWith, type ValidationResult } from "./common.js";
import { PROGRESS_STATUSES, type ProgressStatus } from "./work.js";

export const TASK_SCHEMA_VERSION = "1.0.0";

export type TaskState =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "BLOCKED"
  | "SUSPENDED"
  | "SUCCEEDED_UNVERIFIED"
  | "VERIFIED"
  | "FAILED"
  | "CANCELLED"
  | "OBSOLETE";

export const TASK_STATES: readonly TaskState[] = [
  "PENDING",
  "READY",
  "RUNNING",
  "BLOCKED",
  "SUSPENDED",
  "SUCCEEDED_UNVERIFIED",
  "VERIFIED",
  "FAILED",
  "CANCELLED",
  "OBSOLETE",
];

/**
 * SUCCEEDED_UNVERIFIED = the executor reports success; only independent evidence
 * moves a task to VERIFIED (INV-TASK-03). OBSOLETE = superseded by replanning (M07).
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  PENDING: ["READY", "BLOCKED", "CANCELLED", "OBSOLETE"],
  READY: ["RUNNING", "BLOCKED", "SUSPENDED", "CANCELLED", "OBSOLETE"],
  RUNNING: ["SUCCEEDED_UNVERIFIED", "FAILED", "BLOCKED", "SUSPENDED", "READY", "CANCELLED"],
  BLOCKED: ["READY", "FAILED", "CANCELLED", "OBSOLETE"],
  SUSPENDED: ["READY", "CANCELLED", "OBSOLETE"],
  SUCCEEDED_UNVERIFIED: ["VERIFIED", "FAILED", "READY", "OBSOLETE"],
  VERIFIED: ["OBSOLETE"],
  FAILED: ["READY", "OBSOLETE", "CANCELLED"],
  CANCELLED: [],
  OBSOLETE: [],
};

export type TaskKind = "PLAN" | "IMPLEMENT" | "VERIFY" | "RESEARCH" | "COORDINATE" | "OPERATE";
export const TASK_KINDS: readonly TaskKind[] = ["PLAN", "IMPLEMENT", "VERIFY", "RESEARCH", "COORDINATE", "OPERATE"];

export interface Task extends ContractHeader<"Task"> {
  task_id: string;
  work_id: string;
  goal_contract_ref: VersionedRef;
  title: string;
  task_kind: TaskKind;
  state: TaskState;
  progress_status: ProgressStatus;
  depends_on: string[];
  /** Goal-contract criteria this task contributes to (traceability). */
  criterion_refs: string[];
  expected_result: string;
  execution_ids: string[];
  evidence_ids: string[];
  plan_version: number;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export function validateTask(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("Task");
    const taskId = c.id("task_id", "task");
    c.id("work_id", "work");
    c.versionedRef("goal_contract_ref", "goal_contract");
    c.string("title");
    c.oneOf("task_kind", TASK_KINDS);
    const state = c.oneOf("state", TASK_STATES);
    const progress = c.oneOf("progress_status", PROGRESS_STATUSES);
    const deps = c.stringArray("depends_on");
    c.stringArray("criterion_refs");
    c.string("expected_result");
    c.stringArray("execution_ids");
    const evidence = c.stringArray("evidence_ids");
    c.integer("plan_version", 1);
    c.timestamp("created_at");
    c.timestamp("updated_at");

    if (taskId && deps) {
      c.ensure(!deps.includes(taskId), "INV-TASK-01", "depends_on", "a task cannot depend on itself");
    }
    if (state === "VERIFIED") {
      c.ensure((evidence?.length ?? 0) > 0, "INV-TASK-03", "evidence_ids", "VERIFIED requires evidence");
      c.ensure(progress === "CONFIRMED", "INV-TASK-04", "progress_status", "VERIFIED task progress must be CONFIRMED");
    }
    if (progress === "CONFIRMED") {
      c.ensure(state === "VERIFIED" || state === "OBSOLETE", "INV-TASK-04", "progress_status", "only VERIFIED progress is CONFIRMED");
    }
  });
}

export interface TaskGraphIssue {
  code: "INV-TASK-02" | "INV-TASK-05";
  task_id: string;
  message: string;
}

/** Graph-level invariants: dependencies exist in the same work (INV-TASK-02) and are acyclic (INV-TASK-05). */
export function validateTaskGraph(tasks: Pick<Task, "task_id" | "work_id" | "depends_on">[]): TaskGraphIssue[] {
  const issues: TaskGraphIssue[] = [];
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  for (const t of tasks) {
    for (const dep of t.depends_on) {
      const d = byId.get(dep);
      if (!d || d.work_id !== t.work_id) {
        issues.push({ code: "INV-TASK-02", task_id: t.task_id, message: `dependency ${dep} not in same work` });
      }
    }
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const cyclic = (byId.get(id)?.depends_on ?? []).some((dep) => byId.has(dep) && visit(dep));
    visiting.delete(id);
    done.add(id);
    return cyclic;
  };
  for (const t of tasks) {
    if (!done.has(t.task_id) && visit(t.task_id)) {
      issues.push({ code: "INV-TASK-05", task_id: t.task_id, message: "dependency cycle detected" });
    }
  }
  return issues;
}
