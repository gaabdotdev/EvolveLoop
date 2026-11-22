/**
 * V3-ORCH-04 — Competitive Speculative Execution (Best-of-N).
 *
 * Controlled trigger for **critically blocked** tasks only. Spawns N competing
 * executors in parallel; promotes the **first** whose artifact passes a
 * **deterministic** validator; cancels the rest via AbortSignal.
 *
 * Distinct from V1-TOK-13 `speculative-pipeline` (local draft → tests →
 * optional cloud escalate). This module is a parallel race / promote plane,
 * not a layered model-escalation pipeline.
 *
 * Default: **disabled** (gate.armed must be true). No LLM on the gate or
 * validation path.
 */

export const BEST_OF_N_SCHEMA_VERSION = "1" as const;

export type BestOfNRejectCode =
  | "GATE_NOT_ARMED"
  | "NOT_BLOCKED"
  | "NOT_CRITICALLY_BLOCKED"
  | "INVALID_N"
  | "N_EXCEEDS_MAX"
  | "COST_CAP_EXCEEDED"
  | "MISSING_HOOKS"
  | "INVALID_TASK";

export type BestOfNStatus =
  | "promoted"
  | "all_failed"
  | "rejected"
  | "cancelled_external";

export type BlockedTaskCriticality = "critical" | "normal" | "low";

/**
 * Task snapshot admitted into Best-of-N. Must be BLOCKED + critically blocked
 * (unless gate.require_critical === false).
 */
export interface BlockedTask {
  task_id: string;
  work_id?: string;
  state: string;
  /** Preferred explicit flag for critical blockage. */
  critically_blocked?: boolean;
  criticality?: BlockedTaskCriticality;
  block_reason?: string;
  /** Prior failed attempts (informational / audit). */
  attempt_count?: number;
}

/**
 * Admission control. Best-of-N is opt-in — `armed` must be true.
 */
export interface BestOfNGate {
  armed: boolean;
  /**
   * When true (default), task must be critically blocked.
   * Set false only for explicit non-critical experiments.
   */
  require_critical?: boolean;
  /** Hard ceiling on N (default 8). */
  max_n?: number;
  /**
   * Optional cost units budget for the whole race
   * (sum of per-executor estimates must be ≤ this when provided).
   */
  max_cost_units?: number;
  /** Estimated cost units charged per executor (default 1). */
  cost_units_per_executor?: number;
  armed_by?: string;
  reason?: string;
}

export interface BestOfNExecutorContext {
  executor_id: string;
  index: number;
  n: number;
  task: BlockedTask;
  signal: AbortSignal;
}

export interface BestOfNExecutorResult {
  executor_id: string;
  ok: boolean;
  artifact?: unknown;
  error?: string;
  cost_units?: number;
  /** Optional fingerprint for deterministic validation. */
  fingerprint?: string;
}

export type BestOfNValidateResult =
  | { ok: true }
  | { ok: false; reason: string };

export type BestOfNValidator = (
  result: BestOfNExecutorResult,
  task: BlockedTask,
) => BestOfNValidateResult | Promise<BestOfNValidateResult>;

export interface BestOfNHooks {
  /**
   * Invoked once per competitor (index 0..N-1). Must honour `signal` abort
   * (throw or return early) so losers can be cancelled.
   */
  runExecutor: (
    ctx: BestOfNExecutorContext,
  ) => BestOfNExecutorResult | Promise<BestOfNExecutorResult>;
  /** Deterministic validator — first ok promotes; no LLM. */
  validate: BestOfNValidator;
  /** Injectable clock for deterministic timestamps. */
  clock?: () => Date;
  /**
   * Optional external AbortSignal — aborts the whole race
   * (status cancelled_external).
   */
  signal?: AbortSignal;
}

export interface BestOfNExecutorTrace {
  executor_id: string;
  index: number;
  outcome: "promoted" | "failed" | "cancelled" | "invalid";
  validate_ok?: boolean;
  validate_reason?: string;
  error?: string;
  aborted: boolean;
}

export interface BestOfNReport {
  kind: "BestOfNReport";
  schema_version: typeof BEST_OF_N_SCHEMA_VERSION;
  task_id: string;
  work_id?: string;
  n: number;
  status: BestOfNStatus;
  triggered: boolean;
  winner_executor_id: string | null;
  promoted: BestOfNExecutorResult | null;
  cancelled_executor_ids: string[];
  failed_executor_ids: string[];
  traces: BestOfNExecutorTrace[];
  reject_code?: BestOfNRejectCode;
  reject_reason?: string;
  gate: {
    armed: boolean;
    armed_by?: string;
    reason?: string;
    max_n: number;
  };
  started_at: string;
  finished_at: string;
}

export class BestOfNError extends Error {
  constructor(
    readonly rejectCode: BestOfNRejectCode,
    message: string,
  ) {
    super(message);
    this.name = "BestOfNError";
  }
}

const DEFAULT_MAX_N = 8;

function nowIso(clock?: () => Date): string {
  return (clock?.() ?? new Date()).toISOString();
}

function executorId(index: number): string {
  return `bon-exec-${String(index).padStart(2, "0")}`;
}

/** True when task is in BLOCKED state. */
export function isBlockedTask(task: BlockedTask): boolean {
  return String(task?.state ?? "").toUpperCase() === "BLOCKED";
}

/**
 * Critically blocked = BLOCKED + (critically_blocked === true OR criticality === "critical").
 */
export function isCriticallyBlocked(task: BlockedTask): boolean {
  if (!isBlockedTask(task)) return false;
  if (task.critically_blocked === true) return true;
  if (task.criticality === "critical") return true;
  return false;
}

export interface BestOfNAdmission {
  ok: boolean;
  reject_code?: BestOfNRejectCode;
  reason?: string;
  max_n: number;
  estimated_cost?: number;
}

/**
 * Pure admission check (no side effects). Used by `triggerBestOfN` and tests.
 */
export function admitBestOfN(
  blockedTask: BlockedTask,
  N: number,
  gate: BestOfNGate,
): BestOfNAdmission {
  const max_n = gate.max_n ?? DEFAULT_MAX_N;

  if (!blockedTask || typeof blockedTask.task_id !== "string" || !blockedTask.task_id.trim()) {
    return { ok: false, reject_code: "INVALID_TASK", reason: "task_id required", max_n };
  }

  if (!gate?.armed) {
    return {
      ok: false,
      reject_code: "GATE_NOT_ARMED",
      reason: "Best-of-N gate is not armed (disabled by default)",
      max_n,
    };
  }

  if (!isBlockedTask(blockedTask)) {
    return {
      ok: false,
      reject_code: "NOT_BLOCKED",
      reason: `task state must be BLOCKED (got ${blockedTask.state})`,
      max_n,
    };
  }

  const requireCritical = gate.require_critical !== false;
  if (requireCritical && !isCriticallyBlocked(blockedTask)) {
    return {
      ok: false,
      reject_code: "NOT_CRITICALLY_BLOCKED",
      reason: "Best-of-N requires critically_blocked=true or criticality=critical",
      max_n,
    };
  }

  if (!Number.isInteger(N) || N < 2) {
    return {
      ok: false,
      reject_code: "INVALID_N",
      reason: `N must be an integer >= 2 (got ${N})`,
      max_n,
    };
  }

  if (N > max_n) {
    return {
      ok: false,
      reject_code: "N_EXCEEDS_MAX",
      reason: `N=${N} exceeds gate.max_n=${max_n}`,
      max_n,
    };
  }

  const per = gate.cost_units_per_executor ?? 1;
  const estimated = per * N;
  if (gate.max_cost_units !== undefined && estimated > gate.max_cost_units) {
    return {
      ok: false,
      reject_code: "COST_CAP_EXCEEDED",
      reason: `estimated cost ${estimated} exceeds max_cost_units=${gate.max_cost_units}`,
      max_n,
      estimated_cost: estimated,
    };
  }

  return { ok: true, max_n, estimated_cost: estimated };
}

function rejectedReport(
  blockedTask: BlockedTask,
  N: number,
  gate: BestOfNGate,
  admission: BestOfNAdmission,
  clock?: () => Date,
): BestOfNReport {
  const ts = nowIso(clock);
  return {
    kind: "BestOfNReport",
    schema_version: BEST_OF_N_SCHEMA_VERSION,
    task_id: blockedTask?.task_id ?? "",
    work_id: blockedTask?.work_id,
    n: N,
    status: "rejected",
    triggered: false,
    winner_executor_id: null,
    promoted: null,
    cancelled_executor_ids: [],
    failed_executor_ids: [],
    traces: [],
    reject_code: admission.reject_code,
    reject_reason: admission.reason,
    gate: {
      armed: Boolean(gate?.armed),
      armed_by: gate?.armed_by,
      reason: gate?.reason,
      max_n: admission.max_n,
    },
    started_at: ts,
    finished_at: ts,
  };
}

/**
 * Race N executors; promote first deterministic-validator pass; cancel losers.
 *
 * Signature (core): `triggerBestOfN(blockedTask, N, gate)` — hooks are required
 * as the 4th argument for injectability (tests / MSO wiring).
 */
export async function triggerBestOfN(
  blockedTask: BlockedTask,
  N: number,
  gate: BestOfNGate,
  hooks: BestOfNHooks,
): Promise<BestOfNReport> {
  const admission = admitBestOfN(blockedTask, N, gate);
  if (!admission.ok) {
    return rejectedReport(blockedTask, N, gate, admission, hooks?.clock);
  }

  if (!hooks?.runExecutor || !hooks?.validate) {
    return rejectedReport(
      blockedTask,
      N,
      gate,
      {
        ok: false,
        reject_code: "MISSING_HOOKS",
        reason: "hooks.runExecutor and hooks.validate are required",
        max_n: admission.max_n,
      },
      hooks?.clock,
    );
  }

  const started_at = nowIso(hooks.clock);
  const controllers: AbortController[] = Array.from({ length: N }, () => new AbortController());
  const traces: BestOfNExecutorTrace[] = Array.from({ length: N }, (_, index) => ({
    executor_id: executorId(index),
    index,
    outcome: "failed" as const,
    aborted: false,
  }));

  let winnerId: string | null = null;
  let promoted: BestOfNExecutorResult | null = null;
  let externalCancel = false;

  /** Serialize promote attempts (first successful validate wins). */
  let promoteChain: Promise<void> = Promise.resolve();

  const cancelLosers = (exceptIndex: number): void => {
    for (let i = 0; i < N; i++) {
      if (i === exceptIndex) continue;
      if (!controllers[i].signal.aborted) {
        controllers[i].abort();
      }
    }
  };

  const tryPromote = (
    index: number,
    result: BestOfNExecutorResult,
  ): Promise<boolean> => {
    let won = false;
    promoteChain = promoteChain.then(async () => {
      if (winnerId !== null || externalCancel) return;
      if (controllers[index].signal.aborted) return;

      const verdict = await Promise.resolve(hooks.validate(result, blockedTask));
      traces[index].validate_ok = verdict.ok;
      if (!verdict.ok) {
        traces[index].validate_reason = verdict.reason;
        traces[index].outcome = "invalid";
        return;
      }

      if (winnerId !== null) return;

      winnerId = result.executor_id || executorId(index);
      promoted = { ...result, executor_id: winnerId };
      traces[index].outcome = "promoted";
      won = true;
      cancelLosers(index);
    });
    return promoteChain.then(() => won);
  };

  const onExternalAbort = (): void => {
    externalCancel = true;
    for (const c of controllers) {
      if (!c.signal.aborted) c.abort();
    }
  };

  if (hooks.signal?.aborted) {
    onExternalAbort();
  } else if (hooks.signal) {
    hooks.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const runOne = async (index: number): Promise<void> => {
    const executor_id = executorId(index);
    const ctrl = controllers[index];
    const signal = ctrl.signal;

    if (signal.aborted || externalCancel) {
      traces[index].outcome = "cancelled";
      traces[index].aborted = true;
      return;
    }

    try {
      const raw = await Promise.resolve(
        hooks.runExecutor({
          executor_id,
          index,
          n: N,
          task: blockedTask,
          signal,
        }),
      );

      if (signal.aborted || externalCancel || winnerId !== null) {
        traces[index].outcome = "cancelled";
        traces[index].aborted = signal.aborted || externalCancel;
        return;
      }

      const result: BestOfNExecutorResult = {
        ...raw,
        executor_id: raw.executor_id || executor_id,
      };

      if (!result.ok) {
        traces[index].outcome = "failed";
        traces[index].error = result.error ?? "executor returned ok=false";
        return;
      }

      await tryPromote(index, result);

      if (winnerId !== null && winnerId !== traces[index].executor_id && traces[index].outcome !== "promoted") {
        // Lost the race after finishing — treat as cancelled competitor.
        if (traces[index].outcome === "failed") {
          traces[index].outcome = "cancelled";
        }
      }
    } catch (err) {
      const aborted = signal.aborted || externalCancel;
      const message = err instanceof Error ? err.message : String(err);
      traces[index].error = message;
      traces[index].aborted = aborted;
      traces[index].outcome = aborted ? "cancelled" : "failed";
    }
  };

  await Promise.all(Array.from({ length: N }, (_, i) => runOne(i)));
  // Drain any pending promote serialization.
  await promoteChain;

  if (hooks.signal) {
    hooks.signal.removeEventListener("abort", onExternalAbort);
  }

  const cancelled_executor_ids = traces
    .filter((t) => t.outcome === "cancelled")
    .map((t) => t.executor_id);
  const failed_executor_ids = traces
    .filter((t) => t.outcome === "failed" || t.outcome === "invalid")
    .map((t) => t.executor_id);

  let status: BestOfNStatus;
  if (externalCancel && winnerId === null) {
    status = "cancelled_external";
  } else if (winnerId !== null) {
    status = "promoted";
  } else {
    status = "all_failed";
  }

  return {
    kind: "BestOfNReport",
    schema_version: BEST_OF_N_SCHEMA_VERSION,
    task_id: blockedTask.task_id,
    work_id: blockedTask.work_id,
    n: N,
    status,
    triggered: true,
    winner_executor_id: winnerId,
    promoted,
    cancelled_executor_ids,
    failed_executor_ids,
    traces,
    gate: {
      armed: true,
      armed_by: gate.armed_by,
      reason: gate.reason,
      max_n: admission.max_n,
    },
    started_at,
    finished_at: nowIso(hooks.clock),
  };
}

/**
 * Throwing variant of admission — useful for MSO call sites that prefer exceptions.
 */
export function assertBestOfNAdmission(
  blockedTask: BlockedTask,
  N: number,
  gate: BestOfNGate,
): void {
  const a = admitBestOfN(blockedTask, N, gate);
  if (!a.ok) {
    throw new BestOfNError(a.reject_code!, a.reason ?? a.reject_code!);
  }
}
