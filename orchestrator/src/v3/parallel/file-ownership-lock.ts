/**
 * V2-ORCH-01 — File-Ownership Locking for the parallel scheduler.
 * Deterministic; reuses OwnershipLedger + pathsOverlap. No LLM.
 */

import { join } from "node:path";
import { pathsOverlap } from "../mso/topo.js";
import type { V3DataPaths } from "../paths.js";
import { taskScopePaths, type OrchestrationTask } from "../task-graph/types.js";
import {
  OwnershipLedger,
  type FileOwnershipRecord,
} from "../workspace/ownership.js";

export function ownershipLedgerDir(paths: V3DataPaths): string {
  return join(paths.workspacesDir, "ownership");
}

export function createOwnershipLedger(paths: V3DataPaths): OwnershipLedger {
  return new OwnershipLedger(ownershipLedgerDir(paths));
}

function lockAgentId(task: OrchestrationTask): string {
  return task.owner_agent_id ?? `task:${task.task_id}`;
}

function isForeignHolder(rec: FileOwnershipRecord, task: OrchestrationTask): boolean {
  if (rec.task_id) return rec.task_id !== task.task_id;
  return rec.agent_id !== lockAgentId(task);
}

/**
 * Try to reserve every path in the task scope. On partial failure, rolls back
 * this task's claims. Empty scope → ok (no lock required).
 */
export function tryReserveTaskScope(
  ledger: OwnershipLedger,
  task: OrchestrationTask,
  workspaceId: string = task.work_id,
): { ok: true } | { ok: false; conflict: FileOwnershipRecord } {
  const scope = taskScopePaths(task);
  if (scope.length === 0) return { ok: true };

  const existing = ledger.load(task.work_id);
  for (const path of scope) {
    const conflict = existing.records.find(
      (r) => isForeignHolder(r, task) && pathsOverlap(r.path, path),
    );
    if (conflict) return { ok: false, conflict };
  }

  const claimedAt = new Date().toISOString();
  for (const path of scope) {
    const result = ledger.claim({
      path,
      work_id: task.work_id,
      agent_id: lockAgentId(task),
      task_id: task.task_id,
      workspace_id: workspaceId,
      claimed_at: claimedAt,
    });
    if (!result.ok) {
      ledger.release(task.work_id, { task_id: task.task_id });
      return result;
    }
  }
  return { ok: true };
}

/** Clear file-ownership locks held by a task (call on complete / cancel). */
export function releaseTaskFileLocks(
  paths: V3DataPaths,
  workId: string,
  taskId: string,
): number {
  return createOwnershipLedger(paths).release(workId, { task_id: taskId });
}

/**
 * Ensure IN_PROGRESS tasks hold their scope locks (scheduler re-entry / recovery).
 * Conflicts are ignored for foreign holders — those stay deferred on next schedule.
 */
export function reconcileInProgressLocks(
  ledger: OwnershipLedger,
  tasks: OrchestrationTask[],
): void {
  for (const task of tasks) {
    if (task.state !== "IN_PROGRESS") continue;
    tryReserveTaskScope(ledger, task);
  }
}

export { taskScopePaths, pathsOverlap };
