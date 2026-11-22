/**
 * V1-ORCH-03 — Delta Grill-Me.
 * Immutable Goal Contract versioning v1→v2; reactive TaskGraph propagation;
 * selective SIGTERM of obsolete tasks; mark affected evidence STALE.
 */

import type { GoalContract } from "../goal-contract/types.js";
import { StateDb } from "../state-db/store.js";
import type { EvidenceRecordRow, TaskGraphNodeRow } from "../state-db/types.js";

export interface RunningTaskProcess {
  task_id: string;
  pid: number;
  work_id: string;
}

export type KillFn = (pid: number, signal?: NodeJS.Signals) => boolean;

export interface DeltaGrillMeInput {
  db: StateDb;
  /** Previous immutable contract (vN). */
  previous: GoalContract;
  /** Next contract revision (vN+1) — must set supersedes_version. */
  next: GoalContract;
  /** Currently running task processes (selective terminate). */
  running?: RunningTaskProcess[];
  /** Injectable kill for tests (default process.kill). */
  killFn?: KillFn;
  /** Task ids that become obsolete after delta (default: heuristic from scope/criteria change). */
  obsolete_task_ids?: string[];
}

export interface DeltaGrillMeResult {
  kind: "DeltaGrillMeResult";
  from_version: number;
  to_version: number;
  goal_contract_id: string;
  obsolete_task_ids: string[];
  propagated_tasks: TaskGraphNodeRow[];
  signalled: Array<{ task_id: string; pid: number; signalled: boolean; reason: string }>;
  stale_evidence_ids: string[];
  contract_persisted: boolean;
}

function deriveObsoleteTasks(
  previous: GoalContract,
  next: GoalContract,
  existing: TaskGraphNodeRow[],
): string[] {
  const prevCrit = new Set(previous.criteria.map((c) => c.id));
  const nextCrit = new Set(next.criteria.map((c) => c.id));
  const removedCriteria = [...prevCrit].filter((id) => !nextCrit.has(id));
  const scopeChanged =
    JSON.stringify(previous.scope) !== JSON.stringify(next.scope) ||
    previous.objective !== next.objective;

  const obsolete: string[] = [];
  for (const node of existing) {
    const linked = String((node.payload as { criterion_id?: string }).criterion_id ?? "");
    if (linked && removedCriteria.includes(linked)) {
      obsolete.push(node.task_id);
      continue;
    }
    if (scopeChanged && (node.state === "IN_PROGRESS" || node.state === "PENDING")) {
      // Re-plan in-flight work when objective/scope shifts
      if (!obsolete.includes(node.task_id)) obsolete.push(node.task_id);
    }
  }
  return obsolete;
}

/**
 * Apply a delta Grill-Me revision: persist v2, cancel obsolete tasks, STALE evidence.
 */
export function applyDeltaGrillMe(input: DeltaGrillMeInput): DeltaGrillMeResult {
  const { previous, next, db } = input;
  if (next.goal_contract_id !== previous.goal_contract_id) {
    throw new Error("delta grill-me requires same goal_contract_id");
  }
  if (next.version !== previous.version + 1) {
    throw new Error(`expected version ${previous.version + 1}, got ${next.version}`);
  }
  if (next.supersedes_version !== previous.version) {
    throw new Error("next.supersedes_version must equal previous.version");
  }

  const work_id = next.work_id ?? previous.work_id ?? next.goal_contract_id;
  const existing = db.listTaskGraphNodes(work_id);
  const obsolete_task_ids =
    input.obsolete_task_ids ?? deriveObsoleteTasks(previous, next, existing);

  // Persist immutable next version
  db.saveGoalContract(next, { validated: true });

  const killFn: KillFn =
    input.killFn ??
    ((pid, signal = "SIGTERM") => {
      try {
        process.kill(pid, signal);
        return true;
      } catch {
        return false;
      }
    });

  const signalled: DeltaGrillMeResult["signalled"] = [];
  for (const proc of input.running ?? []) {
    if (!obsolete_task_ids.includes(proc.task_id)) continue;
    const ok = killFn(proc.pid, "SIGTERM");
    signalled.push({
      task_id: proc.task_id,
      pid: proc.pid,
      signalled: ok,
      reason: ok ? "SIGTERM_obsolete" : "kill_failed",
    });
  }

  const propagated_tasks: TaskGraphNodeRow[] = [];
  for (const task_id of obsolete_task_ids) {
    const { event: _e } = db.appendEventAndProject({
      stream_id: `work:${work_id}`,
      event_type: "task.obsolete_cancelled",
      work_id,
      task_id,
      payload: {
        from_version: previous.version,
        to_version: next.version,
        reason: "delta_grill_me",
      },
      substate: {
        machine: "task_lifecycle",
        state: "CANCELLED",
        payload: { obsolete: true, goal_contract_version: next.version },
      },
      task_graph: {
        state: "CANCELLED",
        payload: {
          obsolete: true,
          superseded_by_version: next.version,
          previous_version: previous.version,
        },
      },
    });
    const node = db.listTaskGraphNodes(work_id).find((n) => n.task_id === task_id);
    if (node) propagated_tasks.push(node);
  }

  const stale_evidence_ids = db.markEvidenceStale({
    work_id,
    goal_contract_id: next.goal_contract_id,
    before_version: next.version,
    task_ids: obsolete_task_ids.length > 0 ? obsolete_task_ids : undefined,
  });

  // Also mark all evidence for this contract below next.version when scope changed
  if (obsolete_task_ids.length === 0) {
    const extra = db.markEvidenceStale({
      work_id,
      goal_contract_id: next.goal_contract_id,
      before_version: next.version,
    });
    for (const id of extra) {
      if (!stale_evidence_ids.includes(id)) stale_evidence_ids.push(id);
    }
  }

  return {
    kind: "DeltaGrillMeResult",
    from_version: previous.version,
    to_version: next.version,
    goal_contract_id: next.goal_contract_id,
    obsolete_task_ids,
    propagated_tasks,
    signalled,
    stale_evidence_ids,
    contract_persisted: true,
  };
}

export function listStaleEvidence(db: StateDb, workId: string): EvidenceRecordRow[] {
  return db.listEvidence(workId).filter((e) => e.status === "STALE");
}
