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
