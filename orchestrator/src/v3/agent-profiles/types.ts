/**
 * V2-INT-03 — Agent Intelligence Profiles from observational evidence only.
 * Never invent metrics: missing observations → honesty = "UNAVAILABLE".
 */

/** Provenance of a numeric/boolean observation — mirrors CostProvenance honesty. */
export type MetricHonesty = "reported" | "estimated" | "UNAVAILABLE";

/**
 * Observed scalar with honesty. When honesty is UNAVAILABLE, value must be null.
 * Callers must not treat null as zero.
 */
export interface ObservedMetric<T extends number = number> {
  value: T | null;
  honesty: MetricHonesty;
}

/** Per-field honesty for a single run evidence record. */
export interface EvidenceHonesty {
  true_full_pass: MetricHonesty;
  rework_count: MetricHonesty;
  latency_ms: MetricHonesty;
  cost_usd: MetricHonesty;
  tokens_in: MetricHonesty;
  tokens_out: MetricHonesty;
}

/**
 * One observed agent run. Append-only input to ProfileStore.
 * Fields may be omitted only when honesty marks them UNAVAILABLE.
 */
export interface AgentRunEvidence {
  evidence_id: string;
  agent_id: string;
  task_type: string;
  /** ISO-8601 timestamp when the run outcome was observed. */
  observed_at: string;
  /** Whether the run reached TRUE-FULL-PASS. Required observation. */
  true_full_pass: boolean;
  /** Count of rework/retry cycles; null only if honesty.rework_count = UNAVAILABLE. */
  rework_count: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  honesty: EvidenceHonesty;
}

/**
 * Aggregated intelligence profile for (agent_id, task_type) over a time window.
 * sample_size and window_* are always concrete; rates use ObservedMetric honesty.
 */
export interface AgentIntelligenceProfile {
  kind: "AgentIntelligenceProfile";
  agent_id: string;
  task_type: string;
  sample_size: number;
  window_start: string;
  window_end: string;
  true_full_pass_rate: ObservedMetric;
  /** Mean rework_count among runs where rework was reported. */
  rework_mean: ObservedMetric;
  avg_latency_ms: ObservedMetric;
  avg_cost_usd: ObservedMetric;
  avg_tokens: ObservedMetric;
  updated_at: string;
}

export interface ProfileStoreSnapshot {
  kind: "AgentProfileStore";
  evidence: AgentRunEvidence[];
  profiles: AgentIntelligenceProfile[];
  updated_at: string;
}

export type IntelligenceRouteMode = "profile" | "static_fallback";

export interface IntelligenceRouteRequest {
  task_type: string;
  candidate_agent_ids: string[];
  /** Minimum sample_size for a profile to be eligible. Default 5. */
  min_sample_size?: number;
  /** Used when no candidate meets min_sample_size (or pool empty of eligible). */
  static_fallback_agent_id: string;
  /** Weight applied to rework_mean in the score penalty. Default 0.5. */
  rework_penalty_weight?: number;
}

export interface ScoredAgentCandidate {
  agent_id: string;
  sample_size: number;
  score: number | null;
  eligible: boolean;
  reason: string;
  true_full_pass_rate: ObservedMetric;
  rework_mean: ObservedMetric;
}

export interface IntelligenceRouteDecision {
  kind: "IntelligenceRouteDecision";
  task_type: string;
  mode: IntelligenceRouteMode;
  selected_agent_id: string;
  score: number | null;
  min_sample_size: number;
  candidates: ScoredAgentCandidate[];
  limitations: string[];
  generated_at: string;
}

/**
 * Delta between profile-based routing and a static baseline (fixture-friendly).
 * Does not invent performance gains — only structural comparison of selections.
 */
export interface StaticRouteDelta {
  kind: "StaticRouteDelta";
  task_type: string;
  profile_selected_agent_id: string;
  static_selected_agent_id: string;
  agreed: boolean;
  profile_mode: IntelligenceRouteMode;
  profile_score: number | null;
  delta_note: string;
}
