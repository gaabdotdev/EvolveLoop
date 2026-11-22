/**
 * Hierarchical budget checks — uses only reported consumed values.
 * Never invents tokens/cost; unknown consumption is NOT a pass.
 */

export type BudgetDimension = "tokens" | "cost_usd" | "duration_ms" | "children";

export interface BudgetLimit {
  max_tokens?: number;
  max_cost_usd?: number;
  max_duration_ms?: number;
  max_children?: number;
}

export interface BudgetConsumed {
  tokens?: number;
  cost_usd?: number;
  duration_ms?: number;
  children?: number;
}

export interface BudgetBreach {
  agent_id: string;
  dimension: BudgetDimension;
  limit: number;
  consumed: number;
  /** true when limit set but consumed metric absent — fail-closed signal */
  unmeasured: boolean;
}

export interface BudgetReport {
  kind: "BudgetReport";
  work_id: string;
  generated_at: string;
  breaches: BudgetBreach[];
  ok_agents: string[];
  skipped_no_budget: string[];
  limitations: string[];
}

export interface StuckAgentSignal {
  agent_id: string;
  reason: "STALE_LEASE" | "ORPHANED" | "BUDGET_BREACH" | "TASK_OWNER_INACTIVE";
  task_id?: string;
  detail: string;
}

export interface StuckDetectionReport {
  kind: "StuckDetectionReport";
  work_id: string;
  generated_at: string;
  stuck: StuckAgentSignal[];
  limitations: string[];
}
