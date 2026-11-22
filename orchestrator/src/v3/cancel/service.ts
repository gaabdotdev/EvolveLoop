/**
 * Coordinated cancellation — tasks, agents, locks, pending handoffs.
 * Idempotent when idempotency_key is supplied.
 */

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { WorkLockStore } from "../locks/store.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import { CoordinationEventLog } from "../event-log/store.js";
import { IdempotencyStore } from "../idempotency/store.js";
import type { V3DataPaths } from "../paths.js";
import type { HandoffPackage } from "../continuity/types.js";

export interface CancelRequest {
  work_id: string;
  task_id?: string;
  agent_id?: string;
  reason: string;
  cascade_children?: boolean;
  idempotency_key?: string;
}

export interface CancelResult {
  kind: "CancelResult";
  work_id: string;
  cancelled_tasks: string[];
  cancelled_agents: string[];
  released_locks: string[];
  cancelled_handoffs: string[];
  reason: string;
  idempotent_replay: boolean;
  limitations: string[];
}

const LIMITATIONS = [
  "Cancels Core coordination state — does not kill external harness processes unless adapter supports it",
  "Cascade cancels registry descendants; verified TRUE_PASS tasks are not rewritten to CANCELLED",
];

export function cancelWorkSlice(paths: V3DataPaths, req: CancelRequest): CancelResult {
  const idem = new IdempotencyStore(paths.idempotencyDir);
  if (req.idempotency_key) {
    const gate = idem.beginOrReplay(req.work_id, req.idempotency_key, "cancel", req);
    if (gate.status === "conflict") {
      throw new CancelError("IDEMPOTENCY_CONFLICT", gate.reason);
    }
    if (gate.status === "replay") {
      return { ...(gate.record.result as CancelResult), idempotent_replay: true };
    }
  }

  const agents = new AgentRegistryStore(paths.agentsDir);
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  const locks = new WorkLockStore(paths.locksDir);
  const ledger = new WorkLedgerStore(paths.workLedgerDir);
  const events = new CoordinationEventLog(paths.eventLogDir);

  const cancelled_tasks: string[] = [];
  const cancelled_agents: string[] = [];
  const released_locks: string[] = [];
  const cancelled_handoffs: string[] = [];

  if (req.task_id) {
    const graph = tasks.load(req.work_id);
    const task = graph.tasks.find((t) => t.task_id === req.task_id);
    if (task && task.state !== "TRUE_PASS" && task.state !== "CANCELLED") {
      tasks.setTaskState(req.work_id, req.task_id, "CANCELLED");
      cancelled_tasks.push(req.task_id);
    }
  }

  if (req.agent_id) {
    const snap = agents.load(req.work_id);
    const target = snap.agents.find((a) => a.agent_id === req.agent_id);
    if (target && !["COMPLETED", "CANCELLED", "REPLACED"].includes(target.state)) {
      if (req.cascade_children !== false && target.child_agent_ids.length > 0) {
        agents.reconcileParentFailure(req.work_id, req.agent_id, "cancel");
        // Cancel is intentional: parent must be CANCELLED, not FAILED.
        agents.setState(req.work_id, req.agent_id, "CANCELLED");
        const after = agents.load(req.work_id);
        cancelled_agents.push(
          req.agent_id,
          ...after.agents.filter((a) => a.state === "CANCELLED").map((a) => a.agent_id),
        );
      } else {
        agents.setState(req.work_id, req.agent_id, "CANCELLED");
        cancelled_agents.push(req.agent_id);
      }
    }

    // Cancel IN_PROGRESS tasks owned by cancelled agents (except TRUE_PASS)
    const graph = tasks.load(req.work_id);
    for (const t of graph.tasks) {
      if (t.owner_agent_id && cancelled_agents.includes(t.owner_agent_id)) {
        if (t.state !== "TRUE_PASS" && t.state !== "CANCELLED") {
          tasks.setTaskState(req.work_id, t.task_id, "CANCELLED");
          if (!cancelled_tasks.includes(t.task_id)) cancelled_tasks.push(t.task_id);
        }
      }
    }

    const lockSnap = locks.load(req.work_id);
    for (const lock of lockSnap.locks) {
      if (lock.status === "held" && lock.holder_agent_id === req.agent_id) {
        locks.release(req.work_id, lock.lock_id, req.agent_id);
        released_locks.push(lock.lock_id);
      }
    }
  }

  // Cancel pending handoffs involving cancelled agents
  if (existsSync(paths.handoffsDir)) {
    for (const file of readdirSync(paths.handoffsDir)) {
      if (!file.endsWith(".json")) continue;
      const full = join(paths.handoffsDir, file);
      const pkg = JSON.parse(readFileSync(full, "utf-8")) as HandoffPackage;
      if (pkg.work_id !== req.work_id) continue;
      if (pkg.status !== "pending") continue;
      if (
        (req.agent_id && (pkg.from_agent_id === req.agent_id || pkg.to_agent_id === req.agent_id)) ||
        (req.task_id && pkg.task_id === req.task_id)
      ) {
        pkg.status = "cancelled";
        const tmp = `${full}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify(pkg, null, 2));
        renameSync(tmp, full);
        cancelled_handoffs.push(pkg.handoff_id);
      }
    }
  }

  const result: CancelResult = {
    kind: "CancelResult",
    work_id: req.work_id,
    cancelled_tasks,
    cancelled_agents: [...new Set(cancelled_agents)],
    released_locks,
    cancelled_handoffs,
    reason: req.reason,
    idempotent_replay: false,
    limitations: [...LIMITATIONS],
  };

  events.append({
    work_id: req.work_id,
    type: "cancel.applied",
    actor: "cancel-service",
    payload: { ...result },
  });
  ledger.append({
    work_id: req.work_id,
    type: "note",
    origin: "cancel-service",
    task_id: req.task_id,
    agent_id: req.agent_id,
    payload: {
      event: "cancel",
      cancelled_tasks: result.cancelled_tasks,
      cancelled_agents: result.cancelled_agents,
      released_locks: result.released_locks,
      cancelled_handoffs: result.cancelled_handoffs,
      reason: result.reason,
    },
    provenance: { source: "cancel" },
  });

  if (req.idempotency_key) {
    const pending = idem.beginOrReplay(req.work_id, req.idempotency_key, "cancel", req);
    if (pending.status === "fresh") {
      idem.commit(pending.record, result);
    } else if (pending.status === "replay") {
      return { ...(pending.record.result as CancelResult), idempotent_replay: true };
    }
  }

  return result;
}

export class CancelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "CancelError";
  }
}
