/**
 * Work v1 — durable unit owned by the platform (constitution §1.2, §3, §5).
 * Producer: M01 (Work State) via the M02 Event Ledger. State changes only through WorkEvents.
 */

import { type ContractHeader, type IsoTimestamp, type VersionedRef, validateWith, type ValidationResult } from "./common.js";
import type { ProofStatus } from "./work-proof.js";

export const WORK_SCHEMA_VERSION = "1.0.0";

export type WorkState =
  | "CREATED"
  | "CLARIFYING"
  | "PLANNING"
  | "READY"
  | "RUNNING"
  | "SUSPENDED"
  | "BLOCKED"
  | "RECOVERING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export const WORK_STATES: readonly WorkState[] = [
  "CREATED",
  "CLARIFYING",
  "PLANNING",
  "READY",
  "RUNNING",
  "SUSPENDED",
  "BLOCKED",
  "RECOVERING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export const WORK_TERMINAL_STATES: readonly WorkState[] = ["COMPLETED", "FAILED", "CANCELLED"];

/**
 * Allowed lifecycle transitions. COMPLETED means "proof issued", NOT "proven":
 * the proof's final_status is carried separately in `outcome` (INV-WORK-04).
 */
export const WORK_TRANSITIONS: Readonly<Record<WorkState, readonly WorkState[]>> = {
  CREATED: ["CLARIFYING", "PLANNING", "CANCELLED"],
  CLARIFYING: ["PLANNING", "SUSPENDED", "CANCELLED"],
  PLANNING: ["READY", "CLARIFYING", "BLOCKED", "SUSPENDED", "CANCELLED"],
  READY: ["RUNNING", "PLANNING", "SUSPENDED", "CANCELLED"],
  RUNNING: ["VERIFYING", "SUSPENDED", "BLOCKED", "RECOVERING", "PLANNING", "FAILED", "CANCELLED"],
  SUSPENDED: ["READY", "RUNNING", "RECOVERING", "PLANNING", "CANCELLED"],
  BLOCKED: ["PLANNING", "RECOVERING", "SUSPENDED", "FAILED", "CANCELLED"],
  RECOVERING: ["RUNNING", "PLANNING", "BLOCKED", "SUSPENDED", "FAILED", "CANCELLED"],
  VERIFYING: ["COMPLETED", "RUNNING", "PLANNING", "BLOCKED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

/**
 * Epistemic status of a piece of progress (constitution §4.1): confirmed progress
 * must never be confused with attempts, hypotheses, unknowns or unverified results.
 */
export type ProgressStatus = "CONFIRMED" | "ATTEMPTED" | "HYPOTHESIS" | "UNKNOWN" | "UNVERIFIED";
export const PROGRESS_STATUSES: readonly ProgressStatus[] = ["CONFIRMED", "ATTEMPTED", "HYPOTHESIS", "UNKNOWN", "UNVERIFIED"];

export interface Work extends ContractHeader<"Work"> {
  work_id: string;
  /** Constant: the platform owns the work, never an agent/model/provider/host (INV-WORK-01). */
  owner: "platform";
  goal_contract_ref: VersionedRef;
  state: WorkState;
  state_reason?: string;
  /** Head of this work's event stream; projection is valid as of this sequence (INV-WORK-03). */
  last_event_seq: number;
  /** Set when this work is a fork (ADR-V4-0007). */
  forked_from?: { work_id: string; checkpoint_id: string; event_seq: number };
  outcome?: { proof_id: string; final_status: ProofStatus };
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export function validateWork(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("Work");
    c.id("work_id", "work");
    c.ensure(c.get("owner") === "platform", "INV-WORK-01", "owner", 'owner must be "platform"');
    c.versionedRef("goal_contract_ref", "goal_contract");
    const state = c.oneOf("state", WORK_STATES);
    c.integer("last_event_seq", 1);
    c.timestamp("created_at");
    c.timestamp("updated_at");
    c.nested(
      "forked_from",
      (cc) => {
        cc.id("work_id", "work");
        cc.id("checkpoint_id", "checkpoint");
        cc.integer("event_seq", 1);
      },
      { optional: true },
    );
    const forked = c.get("forked_from") as Work["forked_from"];
    if (forked) {
      c.ensure(forked.work_id !== c.get("work_id"), "INV-WORK-05", "forked_from.work_id", "a fork must have its own identity");
    }
    c.nested(
      "outcome",
      (cc) => {
        cc.id("proof_id", "proof");
        cc.oneOf("final_status", ["PROVEN", "PARTIAL", "FAILED", "UNVERIFIED"] as const);
      },
      { optional: true },
    );
    if (state === "COMPLETED") {
      c.ensure(c.get("outcome") !== undefined, "INV-WORK-04", "outcome", "COMPLETED work must reference a WorkProof");
    }
  });
}
