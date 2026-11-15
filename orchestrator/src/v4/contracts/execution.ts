/**
 * Execution v1 — one concrete attempt by one executor (constitution §5, §4.5).
 * Producer: M13 Execution Gateway (dispatch over V3.7 fabric); M04 records handoffs.
 * The executor's own result claim is recorded but never authoritative (INV-EXEC-04).
 */

import {
  type ContractHeader,
  type ContentRef,
  type CostRecord,
  type ExecutorRef,
  type IsoTimestamp,
  PROVENANCE_KINDS,
  validateWith,
  type ValidationResult,
} from "./common.js";

export const EXECUTION_SCHEMA_VERSION = "1.0.0";

export type ExecutionState =
  | "SCHEDULED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "LOST"
  | "HANDED_OFF";

export const EXECUTION_STATES: readonly ExecutionState[] = [
  "SCHEDULED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
  "LOST",
  "HANDED_OFF",
];

export const EXECUTION_TERMINAL_STATES: readonly ExecutionState[] = [
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
  "LOST",
  "HANDED_OFF",
];

/** LOST = executor vanished without terminal report; effects it dispatched may be UNKNOWN (ADR-V4-0008). */
export const EXECUTION_TRANSITIONS: Readonly<Record<ExecutionState, readonly ExecutionState[]>> = {
  SCHEDULED: ["RUNNING", "CANCELLED", "LOST"],
  RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "LOST", "HANDED_OFF"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  TIMED_OUT: [],
  LOST: [],
  HANDED_OFF: [],
};

/** Failure taxonomy driving cause-oriented recovery (constitution §4.5, §7.2). */
export type FailureClass =
  | "CONTEXT_LIMIT"
  | "RATE_LIMIT"
  | "PROCESS_EXIT"
  | "WORKER_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_RESULT"
  | "DEPENDENCY_UNAVAILABLE"
  | "SECURITY_VIOLATION"
  | "POLICY_DENIED"
  | "TIMEOUT"
  | "FENCED"
  | "CANCELLED"
  | "UNKNOWN";

export const FAILURE_CLASSES: readonly FailureClass[] = [
  "CONTEXT_LIMIT",
  "RATE_LIMIT",
  "PROCESS_EXIT",
  "WORKER_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "INVALID_RESULT",
  "DEPENDENCY_UNAVAILABLE",
  "SECURITY_VIOLATION",
  "POLICY_DENIED",
  "TIMEOUT",
  "FENCED",
  "CANCELLED",
  "UNKNOWN",
];

export interface Execution extends ContractHeader<"Execution"> {
  execution_id: string;
  work_id: string;
  task_id: string;
  attempt: number;
  executor_ref: ExecutorRef;
  state: ExecutionState;
  /** Capsule the executor was started from (handoff/recovery), if any. */
  capsule_id?: string;
  /** V3.7 lease/fencing binding (ADR-V4-0002); writes with a stale epoch are rejected. */
  lease?: { lease_id: string; fencing_epoch: number };
  context_ref?: ContentRef;
  environment: { runtime: string; host_ref?: string; versions?: Record<string, string> };
  cost: CostRecord;
  failure?: { failure_class: FailureClass; detail: string };
  /** Executor's self-report, kept for audit only. */
  result_claim?: { claimed_status: "DONE" | "PARTIAL" | "FAILED"; summary: string };
  started_at?: IsoTimestamp;
  ended_at?: IsoTimestamp;
}

export function validateExecution(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("Execution");
    c.id("execution_id", "execution");
    c.id("work_id", "work");
    c.id("task_id", "task");
    c.integer("attempt", 1);
    c.executorRef("executor_ref");
    const state = c.oneOf("state", EXECUTION_STATES);
    c.id("capsule_id", "capsule", { optional: true });
    c.nested(
      "lease",
      (cc) => {
        cc.string("lease_id");
        cc.integer("fencing_epoch", 0);
      },
      { optional: true },
    );
    c.contentRef("context_ref", { optional: true });
    c.nested("environment", (cc) => cc.string("runtime"));
    c.nested("cost", (cc) => {
      cc.string("currency");
      cc.ensure(
        (PROVENANCE_KINDS as readonly unknown[]).includes(cc.get("provenance")),
        "INV-EXEC-03",
        "provenance",
        "cost provenance is mandatory",
      );
      const amount = cc.get("amount");
      cc.ensure(amount === null || (typeof amount === "number" && amount >= 0), "STRUCT", "amount", "amount must be null or >= 0");
      if (cc.get("provenance") === "UNAVAILABLE") {
        cc.ensure(amount === null, "INV-EXEC-03", "amount", "UNAVAILABLE cost must have null amount (no invented costs)");
      }
    });
    c.nested(
      "failure",
      (cc) => {
        cc.oneOf("failure_class", FAILURE_CLASSES);
        cc.string("detail");
      },
      { optional: true },
    );
    c.timestamp("started_at", { optional: true });
    const ended = c.timestamp("ended_at", { optional: true });
    if (state && (EXECUTION_TERMINAL_STATES as readonly string[]).includes(state)) {
      c.ensure(ended !== undefined, "INV-EXEC-02", "ended_at", "terminal execution requires ended_at");
    }
    if (state === "FAILED" || state === "TIMED_OUT" || state === "LOST") {
      c.ensure(c.get("failure") !== undefined, "INV-EXEC-05", "failure", "failed/lost execution requires a classified failure");
    }
  });
}
