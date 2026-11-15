/**
 * Epistemic progress rules (constitution §4.1, INV-TASK-04).
 * CONFIRMED is never an executor claim; it rides with VERIFIED (or OBSOLETE after verified).
 */

import {
  type ActorRef,
  type ProgressStatus,
  type TaskState,
  TASK_TRANSITIONS,
  isAllowedTransition,
} from "../contracts/index.js";

export function progressForTaskState(state: TaskState, requested?: ProgressStatus): ProgressStatus {
  if (state === "VERIFIED") return "CONFIRMED";
  if (state === "OBSOLETE") return requested ?? "UNKNOWN";
  const asked = requested === "CONFIRMED" ? undefined : requested;
  if (asked) return asked;
  switch (state) {
    case "PENDING":
    case "READY":
      return "UNKNOWN";
    case "RUNNING":
      return "ATTEMPTED";
    case "SUCCEEDED_UNVERIFIED":
      return "UNVERIFIED";
    case "FAILED":
    case "CANCELLED":
    case "BLOCKED":
    case "SUSPENDED":
      return "UNKNOWN";
    default:
      return "UNKNOWN";
  }
}

export function executorMaySetTaskState(actor: ActorRef, to: TaskState): boolean {
  if (actor.kind !== "EXECUTOR") return true;
  return to !== "VERIFIED";
}

export function taskTransitionAllowed(from: TaskState, to: TaskState): boolean {
  return isAllowedTransition(TASK_TRANSITIONS, from, to);
}
