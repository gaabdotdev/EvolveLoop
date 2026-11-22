/**
 * Shared Work Ledger — append-only operational history for a work_id.
 * Distinct from MemoryStore preferences and from GraphStore capability runs.
 */

import type { WorkState } from "../goal-contract/types.js";

export type LedgerEntryType =
  | "work_opened"
  | "work_state_changed"
  | "task_recorded"
  | "agent_recorded"
  | "criterion_recorded"
  | "handoff_recorded"
  | "plan_approved"
  | "execution_recorded"
  | "attempt_recorded"
  | "note";

export interface WorkLedgerEntry {
  kind: "WorkLedgerEntry";
  work_id: string;
  version: number;
  ts: string;
  type: LedgerEntryType;
  origin: string;
  task_id?: string;
  agent_id?: string;
  criterion_id?: string;
  goal_contract_id?: string;
  payload: Record<string, unknown>;
  provenance: {
    source: string;
    refs?: string[];
  };
}

export interface WorkLedgerSnapshot {
  kind: "WorkLedgerSnapshot";
  work_id: string;
  latest_version: number;
  work_state: WorkState;
  goal_contract_id?: string;
  updated_at: string;
  entry_count: number;
}
