/**
 * TaskGraph node states for V0 MSO orchestration (StateDb.task_graph_nodes).
 * UNKNOWN = partial effect after crash — never blindly auto-retried (V0-ORCH-05).
 */

export const MSO_TASK_STATES = [
  "PENDING",
  "IN_PROGRESS",
  "TRUE_PASS",
  "FAILED",
  "BLOCKED",
  "CANCELLED",
  "UNKNOWN",
  "CIRCUIT_OPEN",
] as const;

export type MsoTaskState = (typeof MSO_TASK_STATES)[number];

export function isMsoTaskState(value: string): value is MsoTaskState {
  return (MSO_TASK_STATES as readonly string[]).includes(value);
}

/** States that must never be auto-retried without human/MSO review. */
export const NO_AUTO_RETRY_STATES: readonly MsoTaskState[] = ["UNKNOWN", "CIRCUIT_OPEN", "CANCELLED"];

export function mayAutoRetryTask(state: string): boolean {
  return !NO_AUTO_RETRY_STATES.includes(state as MsoTaskState);
}
