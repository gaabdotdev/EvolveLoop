import type { WorkState } from "../goal-contract/types.js";

export type CoordinatorProcessState =
  | "stopped"
  | "running"
  | "paused"
  | "crashed";

export interface CoordinatorWorkRecord {
  work_id: string;
  goal_contract_id: string;
  goal_contract_version: number;
  work_state: WorkState;
  created_at: string;
  updated_at: string;
  last_tick_at?: string;
  pause_reason?: string;
}

export interface CoordinatorState {
  kind: "CoordinatorState";
  process_state: CoordinatorProcessState;
  pid?: number;
  started_at?: string;
  updated_at: string;
  works: CoordinatorWorkRecord[];
  /** Closing TUI must not clear this file — state survives interface exit. */
  notes: string[];
}
