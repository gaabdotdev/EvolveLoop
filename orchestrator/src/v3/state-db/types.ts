/**
 * V0 SQLite WAL state — Goal Contract and trivial-ops routing.
 * Canonical path: <workspace>/.evolveloop/state.db
 */

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

export type TokenCostProvenance = "reported" | "estimated" | "UNAVAILABLE";

export interface TokenLedgerInsert {
  entry_id?: string;
  work_id: string;
  task_id?: string;
  goal_contract_id?: string;
  provider_id?: string;
  adapter_id?: string;
  model?: string;
  tokens_in?: number | null;
  tokens_out?: number | null;
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
  provider_id?: string;
  adapter_id?: string;
  model?: string;
  tokens_in: number | null;
  tokens_out: number | null;
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
