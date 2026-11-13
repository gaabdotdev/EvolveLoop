/**
 * Validated workflow state machine — no silent field updates.
 */

import type { WorkflowState } from "./types.js";

const ALLOWED: Record<WorkflowState, ReadonlySet<WorkflowState>> = {
  SUBMITTED: new Set(["VALIDATING", "CANCELLED", "PAUSED"]),
  VALIDATING: new Set([
    "QUEUED",
    "WAITING_DEPENDENCY",
    "WAITING_RESOURCE",
    "BLOCKED",
    "CANCELLED",
    "PAUSED",
  ]),
  QUEUED: new Set([
    "WAITING_DEPENDENCY",
    "WAITING_RESOURCE",
    "ADMITTED",
    "BLOCKED",
    "CANCELLED",
    "PAUSED",
  ]),
  WAITING_DEPENDENCY: new Set([
    "QUEUED",
    "WAITING_RESOURCE",
    "ADMITTED",
    "BLOCKED",
    "CANCELLED",
    "PAUSED",
  ]),
  WAITING_RESOURCE: new Set([
    "QUEUED",
    "WAITING_DEPENDENCY",
    "ADMITTED",
    "BLOCKED",
    "CANCELLED",
    "PAUSED",
  ]),
  ADMITTED: new Set(["RUNNING", "PAUSING", "PAUSED", "CANCELLED", "BLOCKED", "RECOVERING"]),
  RUNNING: new Set([
    "PAUSING",
    "PAUSED",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "BLOCKED",
    "RECOVERING",
  ]),
  PAUSING: new Set(["PAUSED", "RUNNING", "CANCELLED", "FAILED"]),
  PAUSED: new Set(["QUEUED", "WAITING_RESOURCE", "ADMITTED", "RUNNING", "CANCELLED", "RECOVERING"]),
  RECOVERING: new Set([
    "QUEUED",
    "WAITING_RESOURCE",
    "ADMITTED",
    "RUNNING",
    "PAUSED",
    "FAILED",
    "CANCELLED",
    "BLOCKED",
  ]),
  SUCCEEDED: new Set(),
  FAILED: new Set(["QUEUED", "CANCELLED"]),
  CANCELLED: new Set(),
  BLOCKED: new Set(["QUEUED", "VALIDATING", "CANCELLED", "RECOVERING", "PAUSED"]),
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.has(to) === true;
}

export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_WORKFLOW_TRANSITION:${from}->${to}`);
  }
}

export const TERMINAL_STATES: ReadonlySet<WorkflowState> = new Set([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export function isTerminal(state: WorkflowState): boolean {
  return TERMINAL_STATES.has(state);
}
