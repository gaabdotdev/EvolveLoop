/**
 * Typed payloads for M01-owned event types (R2).
 *
 * `WorkEvent.payload` is untyped in the frozen 1.0.0 contract. Producers MUST
 * allowlist-parse. Top-level F12 names (`next_action`, `objective`, `permissions`)
 * are never treated as CONTROL — they are ignored if present. Nested
 * `goal_contract.objective` is the Goal Contract field (platform-authored CONTROL
 * after compilation), not a capsule/executor instruction.
 */

import {
  FORBIDDEN_SELF_TRUST_FIELDS,
  isRecord,
  type GoalContract,
  type ProgressStatus,
  type Task,
  type TaskState,
  type Work,
  type WorkState,
  validateGoalContract,
  validateTask,
  validateWork,
  type ValidationResult,
} from "../contracts/index.js";

export const M01_EVENT_TYPES = [
  "work.created",
  "work.state_changed",
  "goal_contract.versioned",
  "goal_contract.accepted",
  "task.planned",
  "task.state_changed",
] as const;

export type M01EventType = (typeof M01_EVENT_TYPES)[number];

export const F12_PAYLOAD_NAMES = ["next_action", "objective", "permissions", "verified_task_state"] as const;

const ALLOWLIST: Record<M01EventType, readonly string[]> = {
  "work.created": ["work"],
  "work.state_changed": ["from", "to", "reason", "outcome"],
  "goal_contract.versioned": ["goal_contract", "policy_decision_id"],
  "goal_contract.accepted": ["goal_contract_id", "version"],
  "task.planned": ["task"],
  "task.state_changed": ["task_id", "from", "to", "progress_status", "evidence_ids"],
};

export interface WorkCreatedPayload {
  work: Work;
}

export interface WorkStateChangedPayload {
  from: WorkState;
  to: WorkState;
  reason?: string;
  /** Required by projector when `to === COMPLETED` (INV-WORK-04). */
  outcome?: Work["outcome"];
}

export interface GoalContractVersionedPayload {
  goal_contract: GoalContract;
  /** Present when D15 required a policy gate; M10 owns the decision object. */
  policy_decision_id?: string;
}

export interface GoalContractAcceptedPayload {
  goal_contract_id: string;
  version: number;
}

export interface TaskPlannedPayload {
  task: Task;
}

export interface TaskStateChangedPayload {
  task_id: string;
  from: TaskState;
  to: TaskState;
  progress_status: ProgressStatus;
  evidence_ids?: string[];
}

export type M01Payload =
  | WorkCreatedPayload
  | WorkStateChangedPayload
  | GoalContractVersionedPayload
  | GoalContractAcceptedPayload
  | TaskPlannedPayload
  | TaskStateChangedPayload;

export function allowlistPayload(type: M01EventType, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(ALLOWLIST[type]);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (allowed.has(key)) out[key] = payload[key];
  }
  return out;
}

export function payloadHasIgnoredF12(payload: Record<string, unknown>): boolean {
  return F12_PAYLOAD_NAMES.some((k) => Object.prototype.hasOwnProperty.call(payload, k));
}

export type ParsedM01 =
  | { ok: true; type: "work.created"; payload: WorkCreatedPayload }
  | { ok: true; type: "work.state_changed"; payload: WorkStateChangedPayload }
  | { ok: true; type: "goal_contract.versioned"; payload: GoalContractVersionedPayload }
  | { ok: true; type: "goal_contract.accepted"; payload: GoalContractAcceptedPayload }
  | { ok: true; type: "task.planned"; payload: TaskPlannedPayload }
  | { ok: true; type: "task.state_changed"; payload: TaskStateChangedPayload }
  | { ok: false; issues: ValidationResult["issues"] };

function fail(path: string, message: string, code = "STRUCT"): ParsedM01 {
  return { ok: false, issues: [{ code, path, message }] };
}

export function parseM01Payload(type: string, payload: unknown): ParsedM01 {
  if (!M01_EVENT_TYPES.includes(type as M01EventType)) {
    return fail("type", `not an M01 event type: ${type}`, "INV-EVT-04");
  }
  if (!isRecord(payload)) return fail("payload", "must be an object");
  for (const f of FORBIDDEN_SELF_TRUST_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, f)) {
      return fail(`payload.${f}`, `self-asserted trust field "${f}" is forbidden`, "INV-EVT-05");
    }
  }
  const clean = allowlistPayload(type as M01EventType, payload);
  switch (type as M01EventType) {
    case "work.created": {
      const work = clean.work;
      const v = validateWork(work);
      if (!v.valid) return { ok: false, issues: v.issues.map((i) => ({ ...i, path: `work.${i.path}` })) };
      return { ok: true, type: "work.created", payload: { work: work as Work } };
    }
    case "work.state_changed": {
      if (typeof clean.from !== "string" || typeof clean.to !== "string") {
        return fail("payload", "from/to required");
      }
      const outcome = isRecord(clean.outcome)
        ? (clean.outcome as Work["outcome"])
        : undefined;
      return {
        ok: true,
        type: "work.state_changed",
        payload: {
          from: clean.from as WorkState,
          to: clean.to as WorkState,
          reason: typeof clean.reason === "string" ? clean.reason : undefined,
          outcome,
        },
      };
    }
    case "goal_contract.versioned": {
      const gc = clean.goal_contract;
      const v = validateGoalContract(gc);
      if (!v.valid) return { ok: false, issues: v.issues.map((i) => ({ ...i, path: `goal_contract.${i.path}` })) };
      const policy_decision_id = typeof clean.policy_decision_id === "string" ? clean.policy_decision_id : undefined;
      return { ok: true, type: "goal_contract.versioned", payload: { goal_contract: gc as GoalContract, policy_decision_id } };
    }
    case "goal_contract.accepted": {
      if (typeof clean.goal_contract_id !== "string" || typeof clean.version !== "number") {
        return fail("payload", "goal_contract_id and version required");
      }
      return {
        ok: true,
        type: "goal_contract.accepted",
        payload: { goal_contract_id: clean.goal_contract_id, version: clean.version },
      };
    }
    case "task.planned": {
      const task = clean.task;
      const v = validateTask(task);
      if (!v.valid) return { ok: false, issues: v.issues.map((i) => ({ ...i, path: `task.${i.path}` })) };
      return { ok: true, type: "task.planned", payload: { task: task as Task } };
    }
    case "task.state_changed": {
      if (typeof clean.task_id !== "string" || typeof clean.from !== "string" || typeof clean.to !== "string") {
        return fail("payload", "task_id/from/to required");
      }
      if (typeof clean.progress_status !== "string") return fail("progress_status", "required");
      const evidence_ids = Array.isArray(clean.evidence_ids)
        ? clean.evidence_ids.filter((x): x is string => typeof x === "string")
        : undefined;
      return {
        ok: true,
        type: "task.state_changed",
        payload: {
          task_id: clean.task_id,
          from: clean.from as TaskState,
          to: clean.to as TaskState,
          progress_status: clean.progress_status as ProgressStatus,
          evidence_ids,
        },
      };
    }
  }
}
