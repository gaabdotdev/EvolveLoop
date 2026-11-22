/**
 * V0-ORCH-05 — Boot Reconciler: inspect pgid + git diff of worktrees.
 * Tasks with UNKNOWN (partial effect) must NEVER be blindly retried.
 */

import { existsSync } from "node:fs";
import type { StateDb } from "../state-db/store.js";
import { defaultExecutionRunner } from "../execution-runner/index.js";
import { mayAutoRetryTask, type MsoTaskState } from "./task-states.js";

export interface ReconcileTaskInput {
  work_id: string;
  task_id: string;
  state: string;
  payload: Record<string, unknown>;
}

export interface ReconcileDecision {
  task_id: string;
  previous_state: string;
  next_state: MsoTaskState;
  reason: string;
  pgid_alive: boolean | null;
  worktree_dirty: boolean | null;
  /** Explicit: false when UNKNOWN / CIRCUIT_OPEN / CANCELLED. */
  auto_retry_allowed: boolean;
}

export interface BootReconcileReport {
  kind: "BootReconcileReport";
  work_id: string;
  examined: number;
  decisions: ReconcileDecision[];
  unknown_tasks: string[];
  notes: string[];
}

export function isPgidAlive(pgid: number): boolean {
  if (!Number.isFinite(pgid) || pgid <= 0) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // EPERM means the process group exists but we lack permission — treat as alive.
    if (code === "EPERM") return true;
    return false;
  }
}

export function worktreeHasDiff(worktreePath: string): boolean {
  if (!existsSync(worktreePath)) return false;
  const r = defaultExecutionRunner.runSync({
    argv: ["git", "status", "--porcelain"],
    cwd: worktreePath,
    workspace_root: worktreePath,
    timeout_ms: 30_000,
  });
  if (r.status !== "ok" || r.exit_code !== 0) {
    // Unreadable / broken worktree → treat as dirty (partial / unsafe).
    return true;
  }
  return r.stdout.trim().length > 0;
}

function payloadPgid(payload: Record<string, unknown>): number | null {
  const v = payload.pgid;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function payloadWorktree(payload: Record<string, unknown>): string | null {
  const v = payload.worktree_path;
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Decide next state for a single task without mutating storage.
 * IN_PROGRESS + dead pgid + dirty worktree → UNKNOWN (never auto-retry).
 */
export function decideReconcile(task: ReconcileTaskInput): ReconcileDecision {
  const prev = task.state;
  if (prev === "UNKNOWN") {
    return {
      task_id: task.task_id,
      previous_state: prev,
      next_state: "UNKNOWN",
      reason: "already_unknown_partial_effect",
      pgid_alive: null,
      worktree_dirty: null,
      auto_retry_allowed: false,
    };
  }
  if (prev === "CIRCUIT_OPEN" || prev === "CANCELLED" || prev === "TRUE_PASS") {
    return {
      task_id: task.task_id,
      previous_state: prev,
      next_state: prev as MsoTaskState,
      reason: "terminal_or_open_circuit",
      pgid_alive: null,
      worktree_dirty: null,
      auto_retry_allowed: mayAutoRetryTask(prev),
    };
  }

  if (prev !== "IN_PROGRESS") {
    return {
      task_id: task.task_id,
      previous_state: prev,
      next_state: (prev as MsoTaskState) || "PENDING",
      reason: "not_in_progress",
      pgid_alive: null,
      worktree_dirty: null,
      auto_retry_allowed: mayAutoRetryTask(prev),
    };
  }

  const pgid = payloadPgid(task.payload);
  const wt = payloadWorktree(task.payload);
  const alive = pgid != null ? isPgidAlive(pgid) : false;
  const dirty = wt != null ? worktreeHasDiff(wt) : false;

  if (alive) {
    return {
      task_id: task.task_id,
      previous_state: prev,
      next_state: "IN_PROGRESS",
      reason: "pgid_still_alive",
      pgid_alive: true,
      worktree_dirty: dirty,
      auto_retry_allowed: false,
    };
  }

  if (dirty) {
    return {
      task_id: task.task_id,
      previous_state: prev,
      next_state: "UNKNOWN",
      reason: "partial_effect_dead_pgid_dirty_worktree",
      pgid_alive: false,
      worktree_dirty: true,
      auto_retry_allowed: false,
    };
  }

  // Dead process, clean tree — safe to mark FAILED (retry may be allowed by circuit).
  return {
    task_id: task.task_id,
    previous_state: prev,
    next_state: "FAILED",
    reason: "dead_pgid_clean_worktree",
    pgid_alive: false,
    worktree_dirty: false,
    auto_retry_allowed: true,
  };
}

export function reconcileWorkOnBoot(db: StateDb, workId: string): BootReconcileReport {
  const nodes = db.listTaskGraphNodes(workId);
  const decisions: ReconcileDecision[] = [];
  const notes: string[] = [];
  const unknown_tasks: string[] = [];

  for (const node of nodes) {
    const decision = decideReconcile({
      work_id: node.work_id,
      task_id: node.task_id,
      state: node.state,
      payload: node.payload,
    });
    decisions.push(decision);

    if (decision.next_state !== decision.previous_state) {
      db.upsertTaskGraphNode({
        work_id: workId,
        task_id: node.task_id,
        state: decision.next_state,
        payload: {
          ...node.payload,
          reconcile_reason: decision.reason,
          reconcile_at: new Date().toISOString(),
          auto_retry_allowed: decision.auto_retry_allowed,
        },
      });
      notes.push(`${node.task_id}: ${decision.previous_state}→${decision.next_state} (${decision.reason})`);
    }

    if (decision.next_state === "UNKNOWN" || decision.previous_state === "UNKNOWN") {
      unknown_tasks.push(node.task_id);
      // Hard invariant: never flip UNKNOWN → PENDING/IN_PROGRESS here.
      if (!decision.auto_retry_allowed) {
        notes.push(`${node.task_id}: UNKNOWN — auto-retry forbidden`);
      }
    }
  }

  return {
    kind: "BootReconcileReport",
    work_id: workId,
    examined: nodes.length,
    decisions,
    unknown_tasks: [...new Set(unknown_tasks)],
    notes,
  };
}

/**
 * Scheduler helper: refuse to enqueue auto-retry for UNKNOWN / CIRCUIT_OPEN.
 */
export function assertNotBlindRetry(state: string, taskId: string): void {
  if (!mayAutoRetryTask(state)) {
    throw new Error(
      `BLIND_RETRY_FORBIDDEN: task '${taskId}' state=${state} must not be auto-retried`,
    );
  }
}
