/**
 * V3.4 Engineering Loop — stage machine and run snapshot.
 * Stages adapt to work type; not every objective runs every stage.
 */

import type { WorkState } from "../goal-contract/types.js";

export type EngineeringStageId =
  | "INTAKE"
  | "CONTRACT"
  | "ANALYZE"
  | "PLAN"
  | "IMPLEMENT"
  | "REVIEW"
  | "TEST"
  | "DIAGNOSE"
  | "FIX"
  | "REPLAN"
  | "VERIFY"
  | "DONE";

export type StageStatus = "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "SKIPPED";

export interface StageRecord {
  stage_id: EngineeringStageId;
  status: StageStatus;
  started_at?: string;
  finished_at?: string;
  actor_agent_id?: string;
  notes?: string;
  evidence_ids: string[];
  artifacts: string[];
}

export interface EngineeringRun {
  kind: "EngineeringRun";
  run_id: string;
  work_id: string;
  goal_contract_id: string;
  goal_contract_version: number;
  workspace_root: string;
  stages: StageRecord[];
  current_stage: EngineeringStageId;
  work_state: WorkState;
  replan_count: number;
  max_replans: number;
  created_at: string;
  updated_at: string;
  limitations: string[];
}

export interface EngineeringLoopResult {
  kind: "EngineeringLoopResult";
  run: EngineeringRun;
  true_full_pass: boolean;
  reasons: string[];
  workspace_changes: string[];
  test_exit_code?: number | null;
  review_passed: boolean;
  limitations: string[];
}
