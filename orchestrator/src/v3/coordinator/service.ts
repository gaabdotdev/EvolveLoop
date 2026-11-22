/**
 * Coordinator Service skeleton — durable work continuity independent of TUI.
 * Does not claim execution while the machine is powered off.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoalContractStore } from "../goal-contract/store.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { CoordinationEventLog } from "../event-log/store.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import { detectStuck, evaluateBudgets } from "../budget/tracker.js";
import { evaluateHierarchicalBudgets } from "../budget/hierarchical.js";
import { WorkLockStore } from "../locks/store.js";
import { planSubtreeRecovery } from "../recovery/subtree.js";
import { scheduleReadyTasks } from "../parallel/scheduler.js";
import type { V3DataPaths } from "../paths.js";
import type { CoordinatorState, CoordinatorWorkRecord } from "./types.js";
import type { WorkState } from "../goal-contract/types.js";
import type { StuckAgentSignal } from "../budget/types.js";
import type { SubtreeRecoveryPlan } from "../recovery/subtree.js";
import type { LockFileSnapshot } from "../locks/store.js";

export class CoordinatorError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CoordinatorError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export interface CoordinatorTickResult {
  work_id: string;
  work_state: WorkState;
  stale_agents: string[];
  orphan_agents: string[];
  stuck_agents: StuckAgentSignal[];
  budget_breaches: number;
  hierarchical_budget_breaches: number;
  held_locks: number;
  parallel_started: string[];
  limit_reached_agents: string[];
  recovery_suggestions: SubtreeRecoveryPlan[];
  true_full_pass_eligible: boolean;
  reasons: string[];
  limitations: string[];
}

export class CoordinatorService {
  private readonly statePath: string;
  readonly goals: GoalContractStore;
  readonly tasks: TaskGraphStore;
  readonly agents: AgentRegistryStore;
  readonly events: CoordinationEventLog;
  readonly ledger: WorkLedgerStore;
  readonly locks: WorkLockStore;

  constructor(private readonly paths: V3DataPaths) {
    mkdirSync(paths.coordinatorDir, { recursive: true });
    this.statePath = join(paths.coordinatorDir, "state.json");
    this.goals = new GoalContractStore(paths.goalContractsDir);
    this.tasks = new TaskGraphStore(paths.taskGraphsDir);
    this.agents = new AgentRegistryStore(paths.agentsDir);
    this.events = new CoordinationEventLog(paths.eventLogDir);
    this.ledger = new WorkLedgerStore(paths.workLedgerDir);
    this.locks = new WorkLockStore(paths.locksDir);
  }

  loadState(): CoordinatorState {
    if (!existsSync(this.statePath)) {
      return {
        kind: "CoordinatorState",
        process_state: "stopped",
        updated_at: nowIso(),
        works: [],
        notes: [
          "State file absent — coordinator not started. Closing a TUI does not create this file.",
        ],
      };
    }
    const parsed = JSON.parse(readFileSync(this.statePath, "utf-8")) as CoordinatorState;
    if (parsed.kind !== "CoordinatorState") {
      throw new CoordinatorError("INVALID_STATE", this.statePath);
    }
    return parsed;
  }

  /**
   * Marks the coordinator process as running and persists pid.
   * Caller must keep the process alive (foreground serve loop or external supervisor).
   */
  start(): CoordinatorState {
    const state = this.loadState();
    state.process_state = "running";
    state.pid = process.pid;
    state.started_at = state.started_at ?? nowIso();
    state.updated_at = nowIso();
    state.notes.push(`start pid=${process.pid} at ${state.updated_at}`);
    this.save(state);
    return state;
  }

  stop(reason = "stopped"): CoordinatorState {
    const state = this.loadState();
    state.process_state = "stopped";
    state.pid = undefined;
    state.updated_at = nowIso();
    state.notes.push(`stop: ${reason}`);
    this.save(state);
    return state;
  }

  registerWork(
    workId: string,
    goalContractId: string,
    goalContractVersion: number,
  ): CoordinatorState {
    const state = this.loadState();
    if (state.works.some((w) => w.work_id === workId)) {
      throw new CoordinatorError("WORK_EXISTS", workId);
    }
    const ts = nowIso();
    const record: CoordinatorWorkRecord = {
      work_id: workId,
      goal_contract_id: goalContractId,
      goal_contract_version: goalContractVersion,
      work_state: "IN_PROGRESS",
      created_at: ts,
      updated_at: ts,
    };
    state.works.push(record);
    state.updated_at = ts;
    this.save(state);

    // Ensure sibling stores exist
    this.agents.ensure(workId);
    if (!existsSync(join(this.paths.taskGraphsDir, `${workId}.json`))) {
      this.tasks.create(workId, goalContractId, goalContractVersion);
    }
    this.ledger.open(workId, goalContractId, "coordinator.registerWork");
    return state;
  }

  /**
   * One reconciliation pass — safe to call after CLI/TUI reconnect.
   */
  tick(workId: string): CoordinatorTickResult {
    const state = this.loadState();
    const work = state.works.find((w) => w.work_id === workId);
    if (!work) throw new CoordinatorError("WORK_NOT_FOUND", workId);

    this.agents.markStale(workId);
    const agentsSnap = this.agents.load(workId);
    const stale = agentsSnap.agents.filter((a) => a.state === "STALE").map((a) => a.agent_id);
    const orphans = agentsSnap.agents.filter((a) => a.state === "ORPHANED").map((a) => a.agent_id);
    const limit_reached_agents = agentsSnap.agents
      .filter((a) => a.state === "LIMIT_REACHED")
      .map((a) => a.agent_id);
    const stuckReport = detectStuck(this.paths, workId);
    const budgetReport = evaluateBudgets(this.paths, workId);
    const hierBudget = evaluateHierarchicalBudgets(this.paths, workId);
    const lockSnap: LockFileSnapshot = this.locks.load(workId);
    const heldLocks = lockSnap.locks.filter((l) => l.status === "held");
    const parallel = scheduleReadyTasks(this.paths, workId, { max_in_progress: 2 });

    const recovery_suggestions: SubtreeRecoveryPlan[] = [];
    for (const agent of agentsSnap.agents) {
      if (!["FAILED", "STALE", "LIMIT_REACHED"].includes(agent.state)) continue;
      if (agent.role !== "leader" && agent.role !== "master" && agent.child_agent_ids.length === 0) {
        continue;
      }
      if (agent.child_agent_ids.length === 0) continue;
      try {
        recovery_suggestions.push(planSubtreeRecovery(this.paths, workId, agent.agent_id));
      } catch {
        /* skip malformed */
      }
    }

    const evaluation = this.goals.evaluate(work.goal_contract_id);
    const previousState = work.work_state;
    let workState = work.work_state;
    const measuredBudgetBreach =
      budgetReport.breaches.some((b) => !b.unmeasured) || hierBudget.breaches.length > 0;
    const unmeasuredBudget = budgetReport.breaches.some((b) => b.unmeasured);

    if (evaluation.eligible) {
      workState = "TRUE_FULL_PASS";
    } else if (measuredBudgetBreach) {
      workState = "BLOCKED";
    } else if (
      orphans.length > 0 ||
      stale.length > 0 ||
      stuckReport.stuck.length > 0 ||
      unmeasuredBudget ||
      limit_reached_agents.length > 0
    ) {
      workState = "RECOVERY";
    } else if (work.work_state === "TRUE_FULL_PASS") {
      workState = "TRUE_FULL_PASS";
    } else {
      workState = "IN_PROGRESS";
    }

    const ts = nowIso();
    work.work_state = workState;
    work.last_tick_at = ts;
    work.updated_at = ts;
    work.goal_contract_version = evaluation.contract.version;
    state.updated_at = ts;
    if (state.process_state === "stopped") {
      // Tick without start is allowed for resume/inspection; does not claim daemon alive.
      state.notes.push(`tick_without_daemon work=${workId} at ${ts}`);
    }
    this.save(state);

    const result: CoordinatorTickResult = {
      work_id: workId,
      work_state: workState,
      stale_agents: stale,
      orphan_agents: orphans,
      stuck_agents: stuckReport.stuck,
      budget_breaches: budgetReport.breaches.length,
      hierarchical_budget_breaches: hierBudget.breaches.length,
      held_locks: heldLocks.length,
      parallel_started: parallel.newly_started,
      limit_reached_agents,
      recovery_suggestions,
      true_full_pass_eligible: evaluation.eligible,
      reasons: [
        ...evaluation.reasons,
        ...stuckReport.stuck.map((s) => `stuck:${s.agent_id}:${s.reason}`),
        ...budgetReport.breaches.map(
          (b) => `budget:${b.agent_id}:${b.dimension}${b.unmeasured ? ":unmeasured" : ""}`,
        ),
        ...hierBudget.breaches.map((b) => `hier_budget:${b.agent_id}:${b.dimension}`),
        ...limit_reached_agents.map((id) => `limit_reached:${id}`),
        ...parallel.newly_started.map((id) => `parallel_started:${id}`),
        ...recovery_suggestions.map(
          (r) => `recovery_suggested:${r.failed_parent_id}:${r.recommended_action}`,
        ),
      ],
      limitations: [
        "Tick does not auto-apply subtree recovery — use evolve recovery apply",
        "Tick schedules TaskGraph slots only (max_in_progress=2); does not spawn harnesses",
        "LIMIT_REACHED agents require evolve limits handoff / continuity apply",
        "Locks are best-effort; no exactly-once claim (ADR-V3-0006)",
      ],
    };
    this.events.append({
      work_id: workId,
      type: "coordinator.tick",
      actor: "coordinator",
      payload: { ...result },
    });

    // Lazy-open ledger for works registered before Work Ledger wiring
    try {
      this.ledger.snapshot(workId);
    } catch {
      this.ledger.open(workId, work.goal_contract_id, "coordinator.tick.lazy_open");
    }

    if (previousState !== workState) {
      this.ledger.recordStateChange(workId, workState, "coordinator.tick", {
        previous_state: previousState,
        stale_agents: stale,
        orphan_agents: orphans,
        true_full_pass_eligible: evaluation.eligible,
      });
    } else {
      this.ledger.append({
        work_id: workId,
        type: "note",
        origin: "coordinator.tick",
        goal_contract_id: work.goal_contract_id,
        payload: {
          kind: "tick",
          work_state: workState,
          stale_agents: stale,
          orphan_agents: orphans,
        },
        provenance: { source: "coordinator.tick" },
      });
    }

    // Project task + agent + criterion summaries into ledger (disposable projections live elsewhere)
    try {
      const graph = this.tasks.load(workId);
      this.ledger.append({
        work_id: workId,
        type: "task_recorded",
        origin: "coordinator.tick",
        goal_contract_id: work.goal_contract_id,
        payload: {
          task_count: graph.tasks.length,
          by_state: graph.tasks.reduce<Record<string, number>>((acc, t) => {
            acc[t.state] = (acc[t.state] ?? 0) + 1;
            return acc;
          }, {}),
        },
        provenance: { source: "task-graph" },
      });
    } catch {
      /* task graph optional during early init */
    }

    this.ledger.append({
      work_id: workId,
      type: "agent_recorded",
      origin: "coordinator.tick",
      goal_contract_id: work.goal_contract_id,
      payload: {
        stale_count: stale.length,
        orphan_count: orphans.length,
        agent_count: agentsSnap.agents.length,
      },
      provenance: { source: "agent-registry" },
    });

    this.ledger.append({
      work_id: workId,
      type: "criterion_recorded",
      origin: "coordinator.tick",
      goal_contract_id: work.goal_contract_id,
      payload: {
        eligible: evaluation.eligible,
        reasons: evaluation.reasons,
        criteria: evaluation.contract.criteria.map((c) => ({
          id: c.id,
          state: c.state,
          mandatory: c.mandatory,
        })),
      },
      provenance: { source: "goal-contract" },
    });

    return result;
  }

  status(): {
    coordinator: CoordinatorState;
    limitation: string;
  } {
    return {
      coordinator: this.loadState(),
      limitation:
        "Process continues only while a supervisor/OS keeps the Node process alive. State on disk survives TUI close and can be resumed; execution does not continue while the machine is off or suspended without an OS-level service.",
    };
  }

  /**
   * V5-M01 — pause Work metadata (BLOCKED + reason). Does not delete Work or agents.
   * Durable on disk; closing TUI does not clear this record.
   */
  pauseWork(workId: string, reason: string): CoordinatorWorkRecord {
    const state = this.loadState();
    const work = state.works.find((w) => w.work_id === workId);
    if (!work) throw new CoordinatorError("WORK_NOT_FOUND", workId);
    const ts = nowIso();
    work.work_state = "BLOCKED";
    work.pause_reason = reason;
    work.updated_at = ts;
    state.updated_at = ts;
    state.notes.push(`pauseWork work=${workId} reason=${reason}`);
    this.save(state);
    try {
      this.ledger.recordStateChange(workId, "BLOCKED", "coordinator.pauseWork", {
        pause_reason: reason,
      });
    } catch {
      /* ledger may be absent in exotic fixtures */
    }
    return work;
  }

  private save(state: CoordinatorState): void {
    atomicWrite(this.statePath, JSON.stringify(state, null, 2));
  }
}
