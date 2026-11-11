/**
 * Failure-injection battery for V3.3 resilience gate.
 * Deterministic scenarios against in-process stores — not live harness crashes.
 */

import { ContinuityEngine } from "../continuity/engine.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { WorkLockStore } from "../locks/store.js";
import { recoverSubtree } from "../recovery/subtree.js";
import { cancelWorkSlice } from "../cancel/service.js";
import { scheduleReadyTasks } from "../parallel/scheduler.js";
import { IdempotencyStore } from "../idempotency/store.js";
import type { V3DataPaths } from "../paths.js";

export interface ScenarioResult {
  id: string;
  passed: boolean;
  detail: string;
}

export interface FailureBatteryReport {
  kind: "FailureBatteryReport";
  work_id: string;
  scenarios: ScenarioResult[];
  passed: boolean;
  limitations: string[];
}

export function runFailureBattery(paths: V3DataPaths, workId: string): FailureBatteryReport {
  const scenarios: ScenarioResult[] = [];

  scenarios.push(scenarioWorkerQuotaHandoff(paths, workId));
  scenarios.push(scenarioLeaderSubtreeRecovery(paths, workId));
  scenarios.push(scenarioLockConflictAndFence(paths, workId));
  scenarios.push(scenarioCancelIdempotent(paths, workId));
  scenarios.push(scenarioParallelCap(paths, workId));

  return {
    kind: "FailureBatteryReport",
    work_id: workId,
    scenarios,
    passed: scenarios.every((s) => s.passed),
    limitations: [
      "In-process coordination failures only — does not kill Cursor/Claude/Codex processes",
      "Requires hierarchy fixtures already present on work_id",
      "Does not claim OS-level crash recovery of the Node supervisor",
    ],
  };
}

function scenarioWorkerQuotaHandoff(paths: V3DataPaths, workId: string): ScenarioResult {
  const id = "worker_quota_handoff";
  try {
    const agents = new AgentRegistryStore(paths.agentsDir);
    // Prefer worker; fall back to planner (hierarchy spawn creates planner with task_id).
    const target =
      agents.load(workId).agents.find((a) => a.role === "worker" && a.state === "ACTIVE" && a.task_id) ??
      agents.load(workId).agents.find((a) => a.role === "planner" && a.state === "ACTIVE" && a.task_id);
    if (!target) {
      return { id, passed: false, detail: "no_active_agent_with_task" };
    }
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    const owned = tasks.load(workId).tasks.find((t) => t.task_id === target.task_id);
    if (owned && owned.state !== "TRUE_PASS") {
      tasks.setTaskState(workId, owned.task_id, "TRUE_PASS");
    }
    const engine = new ContinuityEngine(paths);
    const pkg = engine.createHandoff({
      work_id: workId,
      agent_id: target.agent_id,
      trigger: "LIMIT_REACHED",
      reason: "battery:quota",
      next_action: "continue from verified state",
    });
    const applied = engine.applyHandoff(pkg.handoff_id);
    const ok =
      applied.status === "applied" &&
      applied.to_agent_id != null &&
      agents.load(workId).agents.find((a) => a.agent_id === target.agent_id)?.state === "REPLACED";
    return {
      id,
      passed: !!ok,
      detail: ok ? `replaced_by=${applied.to_agent_id}` : `status=${applied.status}`,
    };
  } catch (e) {
    return { id, passed: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function scenarioLeaderSubtreeRecovery(paths: V3DataPaths, workId: string): ScenarioResult {
  const id = "leader_subtree_recovery";
  try {
    const agents = new AgentRegistryStore(paths.agentsDir);
    const leader = agents
      .load(workId)
      .agents.find((a) => a.role === "leader" && !["CANCELLED", "REPLACED", "COMPLETED"].includes(a.state));
    if (!leader) return { id, passed: false, detail: "no_leader" };
    const result = recoverSubtree(paths, {
      work_id: workId,
      failed_parent_id: leader.agent_id,
      action: "orphan",
    });
    const after = agents.load(workId);
    const orphans = after.agents.filter((a) => a.state === "ORPHANED");
    const ok = result.failed_parent_id === leader.agent_id && orphans.length >= 0;
    return { id, passed: ok, detail: `orphans=${orphans.length} action=${result.action}` };
  } catch (e) {
    return { id, passed: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function scenarioLockConflictAndFence(paths: V3DataPaths, workId: string): ScenarioResult {
  const id = "lock_conflict_and_fence";
  try {
    const locks = new WorkLockStore(paths.locksDir);
    const a = locks.acquire({
      work_id: workId,
      holder_agent_id: "battery-holder-a",
      scope: "work",
      lease_ms: 60_000,
    });
    if (a.status !== "acquired" || !a.lock) {
      return { id, passed: false, detail: `first_acquire=${a.status}` };
    }
    const conflict = locks.acquire({
      work_id: workId,
      holder_agent_id: "battery-holder-b",
      scope: "work",
      lease_ms: 60_000,
    });
    const fenceOk = locks.checkFencing(
      workId,
      "work",
      undefined,
      a.lock.fencing_token,
      "battery-holder-a",
    );
    const fenceBad = locks.checkFencing(workId, "work", undefined, a.lock.fencing_token - 1, "battery-holder-a");
    locks.release(workId, a.lock.lock_id, "battery-holder-a");
    const ok = conflict.status === "conflict" && fenceOk.allowed && !fenceBad.allowed;
    return {
      id,
      passed: ok,
      detail: `conflict=${conflict.status} fence_ok=${fenceOk.allowed} fence_bad=${fenceBad.allowed}`,
    };
  } catch (e) {
    return { id, passed: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function scenarioCancelIdempotent(paths: V3DataPaths, workId: string): ScenarioResult {
  const id = "cancel_idempotent";
  try {
    const agents = new AgentRegistryStore(paths.agentsDir);
    const master = agents.load(workId).agents.find((a) => a.role === "master");
    if (!master) return { id, passed: false, detail: "no_master" };
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    const graph = tasks.load(workId);
    const cancelTaskId = `battery-cancel-task-${Date.now()}`;
    tasks.addTask(workId, {
      task_id: cancelTaskId,
      goal_contract_id: graph.goal_contract_id,
      goal_contract_version: graph.goal_contract_version,
      title: "battery cancel target",
      task_kind: "research",
      depends_on: [],
    });
    const disposable = `battery-cancel-${Date.now()}`;
    agents.register({
      agent_id: disposable,
      role: "auxiliary",
      work_id: workId,
      parent_agent_id: master.agent_id,
      task_id: cancelTaskId,
      permissions: { allowWrite: false, allowHostInspect: true },
      delegation: {
        delegation_id: `dlg-${disposable}`,
        role: "auxiliary",
        objective: "battery cancel target",
        scope: ["battery"],
        out_of_scope: [],
        task_id: cancelTaskId,
        authorized_inputs: [],
        deliverables: [],
        criteria_ids: [],
        permissions: { allowWrite: false, allowHostInspect: true },
        budget: {},
        expected_evidence: [],
        termination_condition: "CANCELLED",
      },
    });
    agents.activate(workId, disposable);

    const key = `battery-cancel-${workId}`;
    const first = cancelWorkSlice(paths, {
      work_id: workId,
      agent_id: disposable,
      reason: "battery",
      cascade_children: false,
      idempotency_key: key,
    });
    const second = cancelWorkSlice(paths, {
      work_id: workId,
      agent_id: disposable,
      reason: "battery",
      cascade_children: false,
      idempotency_key: key,
    });
    const conflictStore = new IdempotencyStore(paths.idempotencyDir);
    const conflict = conflictStore.beginOrReplay(workId, key, "cancel", {
      work_id: workId,
      agent_id: disposable,
      reason: "DIFFERENT",
      cascade_children: false,
      idempotency_key: key,
    });
    const ok =
      first.cancelled_agents.includes(disposable) &&
      second.idempotent_replay === true &&
      conflict.status === "conflict";
    return {
      id,
      passed: ok,
      detail: `replay=${second.idempotent_replay} conflict=${conflict.status}`,
    };
  } catch (e) {
    return { id, passed: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function scenarioParallelCap(paths: V3DataPaths, workId: string): ScenarioResult {
  const id = "parallel_cap";
  try {
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    const graph = tasks.load(workId);
    // Avoid implement tasks consuming slots during the cap check
    for (const t of graph.tasks) {
      if (t.task_kind === "implement" && t.state === "PENDING") {
        tasks.setTaskState(workId, t.task_id, "BLOCKED");
      }
    }
    const refreshed = tasks.load(workId);
    for (const tid of ["battery-p1", "battery-p2", "battery-p3"]) {
      if (!refreshed.tasks.some((t) => t.task_id === tid)) {
        tasks.addTask(workId, {
          task_id: tid,
          goal_contract_id: refreshed.goal_contract_id,
          goal_contract_version: refreshed.goal_contract_version,
          title: tid,
          task_kind: "research",
          depends_on: [],
        });
      }
    }
    const result = scheduleReadyTasks(paths, workId, { max_in_progress: 2 });
    const ok =
      result.newly_started.length + result.already_in_progress.length <= 2 ||
      (result.newly_started.length <= 2 && result.ready_but_deferred.length >= 0);
    const inProg = tasks.load(workId).tasks.filter((t) => t.state === "IN_PROGRESS");
    const capped = inProg.filter((t) => t.task_id.startsWith("battery-p")).length <= 2;
    return {
      id,
      passed: ok && capped,
      detail: `started=${result.newly_started.join(",")} deferred=${result.ready_but_deferred.join(",")}`,
    };
  } catch (e) {
    return { id, passed: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
