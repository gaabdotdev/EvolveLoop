/**
 * Persistent Work Runtime (V5-M01) — minimal but real Work-first façade.
 *
 * Reuses Coordinator / WorkLedger / TaskGraph / AgentRegistry / StateDb.
 * Does not rewrite StateDb, invent a second SQLite, or remove Task UX.
 */

import { resolve } from "node:path";
import { ProcessSessionStore } from "../adapters/drivers/process-sessions.js";
import { defaultWorkspaceV3DataDir } from "../agent-handles/list-view.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { CoordinatorService } from "../coordinator/service.js";
import { ContinuityEngine } from "../continuity/engine.js";
import { GoalContractStore } from "../goal-contract/store.js";
import type { WorkState } from "../goal-contract/types.js";
import { resolveV3DataPaths, type V3DataPaths } from "../paths.js";
import { isPidAlive } from "../state-db/process-alive.js";
import {
  StateDb,
  defaultStateDbPath,
  type AttemptRow,
} from "../state-db/index.js";
import { TaskGraphStore } from "../task-graph/store.js";
import type {
  Attempt,
  AttemptBindRunnerResultInput,
  AttemptBindSessionInput,
  AttemptCreateInput,
  AttemptStatus,
  Work,
  WorkGraphView,
  WorkListItem,
  WorkOpenInput,
  WorkPauseInput,
  WorkStatusSummary,
} from "./types.js";
import type { ProcessSessionRecord } from "../adapters/drivers/process-sessions.js";

export class WorkRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkRuntimeError";
  }
}

export interface PersistentWorkRuntimeOpts {
  /** Absolute or relative workspace root (isolation boundary). */
  workspaceRoot: string;
  /** Override V3 data dir (default: `<workspace>/.evolveloop/v3`). */
  dataDir?: string;
  /** Override StateDb path (default: `<workspace>/.evolveloop/state.db`). */
  stateDbPath?: string;
}

const UX_DUAL = { infrastructure: "Work" as const, product_v4: "Task" as const };

function rowToAttempt(row: AttemptRow): Attempt {
  return {
    kind: "Attempt",
    attempt_id: row.attempt_id,
    work_id: row.work_id,
    task_id: row.task_id,
    agent_id: row.agent_id,
    executor_id: row.executor_id,
    adapter_id: row.adapter_id,
    process_session_id: row.process_session_id,
    run_id: row.run_id,
    execution_mode: row.execution_mode,
    status: row.status,
    idempotency_key: row.idempotency_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
    payload: row.payload,
  };
}

/** Map ExecutionRunnerResult.status → AttemptStatus (honest; blocked ≠ succeeded). */
export function attemptStatusFromRunnerResult(
  status: AttemptBindRunnerResultInput["result"]["status"],
): AttemptStatus {
  switch (status) {
    case "ok":
      return "succeeded";
    case "cancelled":
      return "cancelled";
    case "timeout":
    case "failed":
    case "blocked":
      return "failed";
    default:
      return "failed";
  }
}

/**
 * Persistent Work Runtime — open/read Work, expose TaskGraph, record Attempts.
 */
export class PersistentWorkRuntime {
  readonly workspaceRoot: string;
  readonly paths: V3DataPaths;
  readonly stateDbPath: string;
  readonly coordinator: CoordinatorService;
  readonly goals: GoalContractStore;
  readonly tasks: TaskGraphStore;
  readonly agents: AgentRegistryStore;
  readonly continuity: ContinuityEngine;
  readonly processSessions: ProcessSessionStore;
  private db: StateDb | undefined;

  constructor(opts: PersistentWorkRuntimeOpts) {
    this.workspaceRoot = resolve(opts.workspaceRoot);
    const dataRoot = opts.dataDir
      ? resolve(opts.dataDir)
      : defaultWorkspaceV3DataDir(this.workspaceRoot);
    this.paths = resolveV3DataPaths(dataRoot);
    this.stateDbPath = opts.stateDbPath
      ? resolve(opts.stateDbPath)
      : defaultStateDbPath(this.workspaceRoot);
    this.coordinator = new CoordinatorService(this.paths);
    this.goals = new GoalContractStore(this.paths.goalContractsDir);
    this.tasks = new TaskGraphStore(this.paths.taskGraphsDir);
    this.agents = new AgentRegistryStore(this.paths.agentsDir);
    this.continuity = new ContinuityEngine(this.paths);
    this.processSessions = new ProcessSessionStore(this.paths.processSessionsDir);
  }

  /** Lazy StateDb — same disk SQLite as the rest of the product. */
  stateDb(): StateDb {
    if (!this.db) this.db = new StateDb(this.stateDbPath);
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  /**
   * Open (or re-open idempotently) a Work by stable work_id.
   * Creates GoalContract + CoordinatorWorkRecord + ledger + empty TaskGraph when new.
   */
  open(input: WorkOpenInput): Work {
    const workId = input.work_id.trim();
    if (!workId) throw new WorkRuntimeError("INVALID", "work_id required");

    const existing = this.tryRead(workId);
    if (existing) return existing;

    const goalContractId = (input.goal_contract_id ?? `gc-${workId}`).trim();
    const criteria = (input.criteria ?? [
      {
        id: "c-default",
        description: "Acceptance criterion placeholder for Work open",
        mandatory: true,
        evidence_required: ["e1"],
      },
    ]).map((c) => ({
      id: c.id,
      description: c.description,
      mandatory: c.mandatory ?? true,
      verification: [{ id: `v-${c.id}`, kind: "manual" as const, description: "manual" }],
      evidence_required: c.evidence_required ?? [],
    }));

    let contract;
    try {
      contract = this.goals.loadLatest(goalContractId);
    } catch {
      contract = this.goals.create({
        goal_contract_id: goalContractId,
        objective: input.objective,
        work_id: workId,
        criteria,
      });
    }
    this.coordinator.registerWork(workId, goalContractId, contract.version);

    const db = this.stateDb();
    db.saveGoalContract(contract, { validated: false });
    db.appendWorkLedgerEntry({
      work_id: workId,
      type: "work_opened",
      payload: {
        work_state: "IN_PROGRESS" satisfies WorkState,
        goal_contract_id: goalContractId,
        objective: input.objective,
        origin: "PersistentWorkRuntime.open",
      },
    });

    for (const t of input.tasks ?? []) {
      this.tasks.addTask(workId, {
        task_id: t.task_id,
        goal_contract_id: goalContractId,
        goal_contract_version: contract.version,
        title: t.title,
        depends_on: t.depends_on ?? [],
        task_kind: t.task_kind,
      });
      db.upsertTaskGraphNode({
        work_id: workId,
        task_id: t.task_id,
        state: "PENDING",
        payload: { title: t.title },
      });
    }

    return this.read(workId);
  }

  /** Aggregate read — fails if work_id unknown in this workspace. */
  read(workId: string): Work {
    const work = this.tryRead(workId);
    if (!work) throw new WorkRuntimeError("WORK_NOT_FOUND", workId);
    return work;
  }

  tryRead(workId: string): Work | undefined {
    const state = this.coordinator.loadState();
    const record = state.works.find((w) => w.work_id === workId);
    if (!record) {
      try {
        const snap = this.coordinator.ledger.snapshot(workId);
        return this.projectWork(workId, {
          work_state: snap.work_state,
          goal_contract_id: snap.goal_contract_id,
          goal_contract_version: undefined,
          created_at: snap.updated_at,
          updated_at: snap.updated_at,
        });
      } catch {
        const dbEntries = this.stateDb().listWorkLedgerEntries(workId);
        if (dbEntries.length === 0) return undefined;
        const opened = dbEntries.find((e) => e.type === "work_opened");
        const payload = opened?.payload ?? {};
        return this.projectWork(workId, {
          work_state: (typeof payload.work_state === "string"
            ? payload.work_state
            : "NOT_PASS") as WorkState,
          goal_contract_id:
            typeof payload.goal_contract_id === "string"
              ? payload.goal_contract_id
              : undefined,
          goal_contract_version: undefined,
          created_at: opened?.created_at ?? dbEntries[0]!.created_at,
          updated_at: dbEntries[dbEntries.length - 1]!.created_at,
        });
      }
    }
    return this.projectWork(workId, {
      work_state: record.work_state,
      goal_contract_id: record.goal_contract_id,
      goal_contract_version: record.goal_contract_version,
      created_at: record.created_at,
      updated_at: record.updated_at,
      pause_reason: record.pause_reason,
    });
  }

  /** Expose existing TaskGraph as Work graph units (read-only projection). */
  graph(workId: string): WorkGraphView {
    this.read(workId);
    try {
      const snap = this.tasks.load(workId);
      return {
        kind: "WorkGraphView",
        work_id: workId,
        goal_contract_id: snap.goal_contract_id,
        goal_contract_version: snap.goal_contract_version,
        tasks: snap.tasks,
        updated_at: snap.updated_at,
        source: "TaskGraphStore",
      };
    } catch {
      throw new WorkRuntimeError("GRAPH_NOT_FOUND", workId);
    }
  }

  listTasks(workId: string) {
    return this.graph(workId).tasks;
  }

  /**
   * Attempt create — persist in StateDb; optional links to agent/session/run/executor.
   * M02: bindProcessSession / bindExecutionResult close the session/runner loop.
   */
  createAttempt(input: AttemptCreateInput): Attempt {
    this.read(input.work_id);
    const tasks = this.listTasks(input.work_id);
    if (tasks.length > 0 && !tasks.some((t) => t.task_id === input.task_id)) {
      throw new WorkRuntimeError(
        "TASK_NOT_FOUND",
        `task '${input.task_id}' not under work '${input.work_id}'`,
      );
    }
    const row = this.stateDb().createAttempt({
      work_id: input.work_id,
      task_id: input.task_id,
      agent_id: input.agent_id,
      executor_id: input.executor_id,
      adapter_id: input.adapter_id,
      process_session_id: input.process_session_id,
      run_id: input.run_id,
      execution_mode: input.execution_mode,
      status: input.status,
      idempotency_key: input.idempotency_key,
      payload: input.payload,
    });
    try {
      this.coordinator.ledger.append({
        work_id: input.work_id,
        type: "attempt_recorded",
        origin: "PersistentWorkRuntime.createAttempt",
        task_id: input.task_id,
        agent_id: input.agent_id,
        payload: {
          attempt_id: row.attempt_id,
          status: row.status,
          execution_mode: row.execution_mode,
          executor_id: row.executor_id,
          adapter_id: row.adapter_id,
        },
        provenance: { source: "work-runtime", refs: [row.attempt_id] },
      });
    } catch {
      /* ledger optional if meta missing in exotic recovery paths */
    }
    this.stateDb().appendWorkLedgerEntry({
      work_id: input.work_id,
      type: "attempt_recorded",
      payload: {
        attempt_id: row.attempt_id,
        task_id: input.task_id,
        status: row.status,
        executor_id: row.executor_id,
      },
    });
    return rowToAttempt(row);
  }

  getAttempt(attemptId: string): Attempt {
    const row = this.stateDb().getAttempt(attemptId);
    if (!row) throw new WorkRuntimeError("ATTEMPT_NOT_FOUND", attemptId);
    this.read(row.work_id);
    return rowToAttempt(row);
  }

  listAttempts(workId: string, filter?: { task_id?: string }): Attempt[] {
    this.read(workId);
    return this.stateDb()
      .listAttempts(workId, filter)
      .map(rowToAttempt);
  }

  /**
   * Bind Attempt ↔ ProcessSession when the session exists in this workspace store.
   * Sets execution_mode=harness by default; status → running unless overridden.
   */
  bindProcessSession(input: AttemptBindSessionInput): Attempt {
    const existing = this.getAttempt(input.attempt_id);
    const sessions = this.processSessions.load(existing.work_id);
    const session = sessions.find((s) => s.session_id === input.process_session_id);
    if (!session) {
      throw new WorkRuntimeError(
        "SESSION_NOT_FOUND",
        `process_session '${input.process_session_id}' not under work '${existing.work_id}'`,
      );
    }
    if (session.task_id && session.task_id !== existing.task_id) {
      throw new WorkRuntimeError(
        "SESSION_TASK_MISMATCH",
        `session task '${session.task_id}' ≠ attempt task '${existing.task_id}'`,
      );
    }
    const row = this.stateDb().updateAttemptStatus(
      input.attempt_id,
      input.status ?? (session.status === "exited" || session.status === "cancelled"
        ? session.status === "cancelled"
          ? "cancelled"
          : "succeeded"
        : "running"),
      {
        process_session_id: session.session_id,
        agent_id: input.agent_id ?? session.agent_id ?? existing.agent_id,
        executor_id:
          input.executor_id ??
          session.agent_id ??
          existing.executor_id ??
          existing.agent_id,
        adapter_id: input.adapter_id ?? session.adapter_id,
        execution_mode: input.execution_mode ?? "harness",
        payload: {
          binding: "process_session",
          session_status: session.status,
          session_pid: session.pid ?? null,
          adapter_id: session.adapter_id,
        },
      },
    );
    this.appendAttemptLedger(row.work_id, row.attempt_id, "attempt_bound_session", {
      process_session_id: session.session_id,
      status: row.status,
      execution_mode: row.execution_mode,
    });
    return rowToAttempt(row);
  }

  /**
   * Create Attempt and immediately bind an existing ProcessSession (harness).
   */
  createAttemptForSession(
    session: ProcessSessionRecord,
    opts?: {
      idempotency_key?: string;
      execution_mode?: AttemptCreateInput["execution_mode"];
      status?: AttemptStatus;
      payload?: Record<string, unknown>;
    },
  ): Attempt {
    const attempt = this.createAttempt({
      work_id: session.work_id,
      task_id: session.task_id,
      agent_id: session.agent_id,
      executor_id: session.agent_id,
      adapter_id: session.adapter_id,
      process_session_id: session.session_id,
      execution_mode: opts?.execution_mode ?? "harness",
      status: opts?.status ?? "running",
      idempotency_key: opts?.idempotency_key,
      payload: {
        ...(opts?.payload ?? {}),
        binding: "process_session",
        session_status: session.status,
      },
    });
    if (attempt.process_session_id === session.session_id) return attempt;
    return this.bindProcessSession({
      attempt_id: attempt.attempt_id,
      process_session_id: session.session_id,
      execution_mode: opts?.execution_mode ?? "harness",
      adapter_id: session.adapter_id,
      agent_id: session.agent_id,
      status: opts?.status ?? "running",
    });
  }

  /**
   * Close Attempt from ExecutionRunnerResult. Never mutates Work.work_state.
   */
  bindExecutionResult(input: AttemptBindRunnerResultInput): Attempt {
    const existing = this.getAttempt(input.attempt_id);
    const workBefore = this.read(existing.work_id);
    const attemptStatus = attemptStatusFromRunnerResult(input.result.status);
    const row = this.stateDb().updateAttemptStatus(input.attempt_id, attemptStatus, {
      run_id: input.run_id,
      executor_id: input.executor_id ?? existing.executor_id,
      adapter_id: input.adapter_id ?? existing.adapter_id,
      execution_mode:
        input.execution_mode ??
        (existing.execution_mode === "unknown" ? "native" : existing.execution_mode),
      payload: {
        binding: "execution_runner_result",
        runner_status: input.result.status,
        runner_code: input.result.code,
        exit_code: input.result.exit_code,
        duration_ms: input.result.duration_ms,
        pid: input.result.pid ?? null,
        limitations: input.result.limitations ?? [],
      },
    });
    this.appendAttemptLedger(row.work_id, row.attempt_id, "attempt_bound_runner", {
      status: row.status,
      runner_status: input.result.status,
      work_state_unchanged: workBefore.work_state,
    });
    const workAfter = this.read(existing.work_id);
    if (workAfter.work_state !== workBefore.work_state) {
      throw new WorkRuntimeError(
        "WORK_STATE_DRIFT",
        "bindExecutionResult must not change Work.work_state",
      );
    }
    return rowToAttempt(row);
  }

  /**
   * Mark Attempt failed without failing Work (explicit contract).
   */
  failAttempt(
    attemptId: string,
    reason: string,
    patch?: { payload?: Record<string, unknown> },
  ): { attempt: Attempt; work: Work } {
    const existing = this.getAttempt(attemptId);
    const workBefore = this.read(existing.work_id);
    const row = this.stateDb().updateAttemptStatus(attemptId, "failed", {
      payload: { ...(patch?.payload ?? {}), fail_reason: reason },
    });
    this.appendAttemptLedger(row.work_id, row.attempt_id, "attempt_failed", {
      reason,
      work_state: workBefore.work_state,
    });
    const work = this.read(existing.work_id);
    if (work.work_state !== workBefore.work_state) {
      throw new WorkRuntimeError(
        "WORK_STATE_DRIFT",
        "failAttempt must not change Work.work_state",
      );
    }
    return { attempt: rowToAttempt(row), work };
  }

  /** Supersede Attempt (e.g. after Agent REPLACED) — Work stays durable. */
  supersedeAttempt(attemptId: string, reason: string): Attempt {
    this.getAttempt(attemptId); // validate + workspace isolation
    const row = this.stateDb().updateAttemptStatus(attemptId, "superseded", {
      payload: { superseded_reason: reason },
    });
    this.appendAttemptLedger(row.work_id, row.attempt_id, "attempt_superseded", {
      reason,
    });
    return rowToAttempt(row);
  }

  private appendAttemptLedger(
    workId: string,
    attemptId: string,
    type: string,
    payload: Record<string, unknown>,
  ): void {
    this.stateDb().appendWorkLedgerEntry({
      work_id: workId,
      type,
      payload: { attempt_id: attemptId, ...payload },
    });
  }

  /** Pause metadata — Work stays durable; dual-label Task UX unchanged. */
  pause(input: WorkPauseInput): Work {
    this.coordinator.pauseWork(input.work_id, input.reason);
    this.stateDb().appendWorkLedgerEntry({
      work_id: input.work_id,
      type: "work_state_changed",
      payload: { work_state: "BLOCKED", pause_reason: input.reason },
    });
    return this.read(input.work_id);
  }

  /**
   * List Works known to the coordinator in this workspace (M07).
   * Does not invent Works — only registered / open aggregates.
   */
  listWorks(): WorkListItem[] {
    const state = this.coordinator.loadState();
    const items: WorkListItem[] = [];
    for (const rec of state.works) {
      const work = this.tryRead(rec.work_id);
      if (!work) continue;
      items.push(this.toListItem(work));
    }
    items.sort((a, b) => a.work_id.localeCompare(b.work_id));
    return items;
  }

  /**
   * Status summary for workspace or one Work — shared by CLI + TUI bridge.
   */
  statusSummary(workId?: string): WorkStatusSummary {
    const generated_at = new Date().toISOString();
    if (workId) {
      const work = this.read(workId);
      const item = this.toListItem(work);
      return {
        kind: "WorkStatusSummary",
        workspace_root: this.workspaceRoot,
        work_id: workId,
        total_works: 1,
        by_state: { [work.work_state]: 1 },
        total_attempts: work.attempt_ids.length,
        works_with_live_session: work.liveness.has_live_process_session ? 1 : 0,
        works: [item],
        generated_at,
      };
    }
    const works = this.listWorks();
    const by_state: Record<string, number> = {};
    let total_attempts = 0;
    let works_with_live_session = 0;
    for (const w of works) {
      by_state[w.work_state] = (by_state[w.work_state] ?? 0) + 1;
      total_attempts += w.attempt_count;
      if (w.durable) {
        const full = this.tryRead(w.work_id);
        if (full?.liveness.has_live_process_session) works_with_live_session += 1;
      }
    }
    return {
      kind: "WorkStatusSummary",
      workspace_root: this.workspaceRoot,
      total_works: works.length,
      by_state,
      total_attempts,
      works_with_live_session,
      works,
      generated_at,
    };
  }

  private toListItem(work: Work): WorkListItem {
    return {
      kind: "WorkListItem",
      work_id: work.work_id,
      objective: work.objective,
      work_state: work.work_state,
      attempt_count: work.attempt_ids.length,
      task_count: work.task_ids.length,
      durable: work.liveness.durable,
      updated_at: work.updated_at,
    };
  }

  /**
   * Simulate TUI exit: stop coordinator process bookkeeping without deleting Works.
   * Work remains durable and readable; liveness.coordinator_process_alive → false.
   */
  simulateTuiExit(reason = "tui_exit"): void {
    this.coordinator.stop(reason);
  }

  private projectWork(
    workId: string,
    meta: {
      work_state: WorkState;
      goal_contract_id?: string;
      goal_contract_version?: number;
      created_at: string;
      updated_at: string;
      pause_reason?: string;
    },
  ): Work {
    let objective = workId;
    if (meta.goal_contract_id) {
      try {
        objective = this.goals.loadLatest(meta.goal_contract_id).objective;
      } catch {
        const dbContract = this.stateDb().loadLatestGoalContract(meta.goal_contract_id);
        if (dbContract) objective = dbContract.objective;
      }
    }

    let task_ids: string[] = [];
    try {
      task_ids = this.tasks.load(workId).tasks.map((t) => t.task_id);
    } catch {
      task_ids = this.stateDb()
        .listTaskGraphNodes(workId)
        .map((n) => n.task_id);
    }

    let agent_refs: Work["agent_refs"] = [];
    try {
      agent_refs = this.agents.load(workId).agents.map((a) => ({
        agent_id: a.agent_id,
        role: a.role,
        state: a.state,
        task_id: a.task_id,
        replaced_by: a.replaced_by,
      }));
    } catch {
      agent_refs = [];
    }

    const evidence_ids = this.stateDb()
      .listEvidence(workId)
      .map((e) => e.evidence_id);
    const attempt_ids = this.stateDb()
      .listAttempts(workId)
      .map((a) => a.attempt_id);

    const coord = this.coordinator.loadState();
    const coordAlive =
      coord.process_state === "running" &&
      typeof coord.pid === "number" &&
      isPidAlive(coord.pid);

    let hasLiveSession = false;
    try {
      const sessions = this.processSessions.load(workId);
      hasLiveSession = sessions.some(
        (s) =>
          (s.status === "running" || s.status === "paused") &&
          typeof s.pid === "number" &&
          isPidAlive(s.pid),
      );
    } catch {
      hasLiveSession = false;
    }

    return {
      kind: "Work",
      work_id: workId,
      objective,
      work_state: meta.work_state,
      workspace_root: this.workspaceRoot,
      goal_contract_id: meta.goal_contract_id,
      goal_contract_version: meta.goal_contract_version,
      task_ids,
      agent_refs,
      evidence_ids,
      attempt_ids,
      created_at: meta.created_at,
      updated_at: meta.updated_at,
      pause_reason: meta.pause_reason,
      ux_dual_label: UX_DUAL,
      liveness: {
        durable: true,
        coordinator_process_alive: coordAlive,
        has_live_process_session: hasLiveSession,
      },
    };
  }
}
