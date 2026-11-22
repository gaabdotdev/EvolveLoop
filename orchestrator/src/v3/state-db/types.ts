/**
 * V0 SQLite WAL state — MSO, contracts, TaskGraph, Inbox, Work Ledger, Token Ledger.
 * Canonical path: <workspace>/.evolveloop/state.db
 */

import type { MsoState } from "../mso/states.js";

export interface GoalContractRow {
  goal_contract_id: string;
  version: number;
  objective: string;
  payload_json: string;
  validated: number;
  created_at: string;
  updated_at: string;
  work_id: string | null;
  mso_confirmed: number;
}

export interface TrivialOpRow {
  op_key: string;
  response_json: string;
  updated_at: string;
}

export interface PersistedGoalContract {
  goal_contract_id: string;
  version: number;
  objective: string;
  payload: unknown;
  validated: boolean;
  created_at: string;
  updated_at: string;
  work_id?: string;
  mso_confirmed: boolean;
}

export interface PersistedGoalDocument {
  goal_document_id: string;
  goal_contract_id: string;
  version: number;
  title: string;
  objective: string;
  payload: unknown;
  validated: boolean;
  created_at: string;
  updated_at: string;
}

export type TokenCostProvenance = "reported" | "estimated" | "UNAVAILABLE";

/** V0-TOK-01 — token breakdown buckets recorded in the ledger. */
export interface TokenBreakdown {
  system?: number | null;
  context?: number | null;
  tools?: number | null;
  output?: number | null;
  cache_hit?: number | null;
}

export interface TokenLedgerInsert {
  entry_id?: string;
  work_id: string;
  task_id?: string;
  goal_contract_id?: string;
  /** Subsystem that spent tokens (circuit, grill, adapter, mso, …). */
  subsystem?: string;
  provider_id?: string;
  adapter_id?: string;
  /** @deprecated Prefer model_requested / model_served (V0-TOK-01). */
  model?: string;
  model_requested?: string;
  model_served?: string;
  tokens_in?: number | null;
  tokens_out?: number | null;
  tokens_system?: number | null;
  tokens_context?: number | null;
  tokens_tools?: number | null;
  tokens_output?: number | null;
  tokens_cache_hit?: number | null;
  latency_ms?: number | null;
  cost_usd?: number | null;
  cost_provenance: TokenCostProvenance;
  status: string;
  payload?: Record<string, unknown>;
}

export interface TokenLedgerEntry extends Required<
  Pick<TokenLedgerInsert, "work_id" | "cost_provenance" | "status">
> {
  entry_id: string;
  task_id?: string;
  goal_contract_id?: string;
  subsystem?: string;
  provider_id?: string;
  adapter_id?: string;
  /** Legacy mirror of model_served when only one model id was known. */
  model?: string;
  model_requested?: string;
  model_served?: string;
  tokens_in: number | null;
  tokens_out: number | null;
  tokens_system: number | null;
  tokens_context: number | null;
  tokens_tools: number | null;
  tokens_output: number | null;
  tokens_cache_hit: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CircuitRunRow {
  run_id: string;
  work_id: string;
  task_id: string;
  goal_contract_id?: string;
  status: string;
  reason?: string;
  workspace_path?: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export type WorkspaceLeaseStatus = "active" | "released";

export interface WorkspaceLease {
  workspace_id: string;
  holder_id: string;
  fencing_token: number;
  acquired_at: string;
  renewed_at: string;
  expires_at: string;
  status: WorkspaceLeaseStatus;
}

export interface MsoSession {
  session_id: string;
  workspace_id: string;
  state: MsoState;
  fencing_token: number;
  goal_contract_id?: string;
  work_id?: string;
  reason?: string;
  created_at: string;
  updated_at: string;
}

export interface MsoTransitionRow {
  transition_id: string;
  session_id: string;
  from_state: MsoState;
  to_state: MsoState;
  reason?: string;
  event?: string;
  created_at: string;
}

export type OutboxStatus = "PENDING_DISPATCH" | "DISPATCHED" | "FAILED";

export interface OutboxRow {
  outbox_id: string;
  session_id: string;
  workspace_id: string;
  work_id?: string;
  task_id?: string;
  status: OutboxStatus;
  payload: Record<string, unknown>;
  created_at: string;
  dispatched_at?: string;
}

export interface TaskGraphNodeRow {
  work_id: string;
  task_id: string;
  state: string;
  payload: Record<string, unknown>;
  updated_at: string;
}

export interface InboxMessageRow {
  message_id: string;
  workspace_id: string;
  session_id?: string;
  kind: string;
  body: Record<string, unknown>;
  created_at: string;
  read_at?: string;
}

export interface WorkLedgerDbEntry {
  entry_id: string;
  work_id: string;
  version: number;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** V1-ORCH-02 — append-only event log row. */
export interface EventRow {
  event_id: string;
  stream_id: string;
  seq: number;
  event_type: string;
  task_id?: string;
  work_id?: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Per-task sub-state machine projection (decoupled from global MSO). */
export interface TaskSubstateRow {
  work_id: string;
  task_id: string;
  machine: string;
  state: string;
  checkpoint_id?: string;
  payload: Record<string, unknown>;
  updated_at: string;
}

export type EvidenceStatus = "VALID" | "STALE" | "INVALID";

export interface EvidenceRecordRow {
  evidence_id: string;
  work_id: string;
  task_id?: string;
  goal_contract_id?: string;
  goal_contract_version?: number;
  status: EvidenceStatus;
  kind?: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
