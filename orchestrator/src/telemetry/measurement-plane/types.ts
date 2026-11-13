/**
 * EvolveLoop Benchmark & Observability — Measurement Plane contracts (spec v1.0).
 * Observe-only; never invent tokens/costs; provenance required on measurements.
 */

export const MEASUREMENT_SCHEMA_VERSION = "1.0" as const;
export const METRICS_CATALOG_VERSION = "1.0.0" as const;

export type ProvenanceKind =
  | "OBSERVED"
  | "PROVIDER_REPORTED"
  | "HARNESS_REPORTED"
  | "ESTIMATED"
  | "DERIVED"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type PrivacyClassification = "METADATA" | "HASH_REF" | "CONTENT_OPT_IN" | "REDACTED";

export type CollectorMode = "normal" | "benchmark" | "debug";

export type CollectorDropReason =
  | "queue_overflow"
  | "schema_invalid"
  | "storage_unavailable"
  | "redaction_blocked"
  | "duplicate";

export interface EventSourceInfo {
  component: string;
  module: string;
  instance_id?: string;
}

export interface CorrelationIds {
  experiment_id?: string;
  suite_id?: string;
  case_id?: string;
  /** Measurement-plane run identity (benchmark or observed execution). */
  run_id?: string;
  goal_id?: string;
  task_id?: string;
  parent_task_id?: string;
  agent_id?: string;
  agent_attempt_id?: string;
  parent_agent_id?: string;
  delegation_id?: string;
  provider_request_id?: string;
  provider_id?: string;
  model_id?: string;
  harness_id?: string;
  session_id?: string;
  tool_invocation_id?: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  artifact_id?: string;
  /** Engine Capability IR feature id */
  feature_id?: string;
  /** V3 work ledger id */
  work_id?: string;
  /** Scheduler node UUID (do not confuse with measurement run_id) */
  engine_node_run_id?: string;
  /** @deprecated semantic ambiguity — prefer engine_node_run_id or worker_node_id explicitly */
  node_id?: string;
  /** V3.7 fabric correlation (additive; do not reinterpret node_id) */
  control_plane_id?: string;
  control_plane_epoch?: number;
  worker_node_id?: string;
  node_session_id?: string;
  pool_id?: string;
  lease_id?: string;
  fencing_epoch?: number;
  artifact_transfer_id?: string;
  remote_trace_id?: string;
  remote_span_id?: string;
  workflow_id?: string;
}


export interface ProvenanceInfo {
  kind: ProvenanceKind;
  provider?: string | null;
  reported_by: string;
  estimate_method?: string;
  price_table_version?: string;
}

export interface PrivacyInfo {
  classification: PrivacyClassification;
  content_included: boolean;
  redacted: boolean;
}

export interface EventQuality {
  complete: boolean;
  estimated_fields: string[];
  missing_fields: string[];
  delayed?: boolean;
  duplicate_of?: string;
}

export interface MeasurementValue {
  metric: string;
  value: number | null;
  unit: string;
  provenance: ProvenanceKind;
  provider_id?: string;
  model_id?: string;
  request_id?: string;
  final?: boolean;
  collected_at?: string;
  estimate_method?: string;
  price_table_version?: string;
}

export interface MeasurementEventLink {
  rel: string;
  target_event_id?: string;
  target_artifact_id?: string;
  target_id?: string;
}

/** Versioned measurement envelope (spec §6.1). */
export interface MeasurementEvent {
  schema_version: typeof MEASUREMENT_SCHEMA_VERSION | string;
  event_id: string;
  event_name: string;
  event_version: number;
  occurred_at: string;
  monotonic_offset_ns?: number;
  sequence?: number;
  received_at?: string;
  source: EventSourceInfo;
  correlation: CorrelationIds;
  provenance: ProvenanceInfo;
  privacy: PrivacyInfo;
  attributes: Record<string, unknown>;
  measurements: Record<string, MeasurementValue | number | string | boolean | null>;
  links: MeasurementEventLink[];
  quality: EventQuality;
  critical?: boolean;
}

export type StrategyId = "A_single_agent" | "B_evolveloop_no_delegation" | "C_evolveloop_adaptive";

export type RunValidity = "valid" | "invalid" | "incomplete" | "blocked";

export interface MetricDefinition {
  id: string;
  name: string;
  group: string;
  unit: string;
  definition: string;
  formula: string;
  aggregation: string;
  provenance_notes: string;
  missing_policy: string;
  limitations: string[];
}

export interface HierarchyMetrics {
  agent_count_requested: number;
  agent_count_created: number;
  agent_count_started: number;
  agent_count_completed: number;
  agent_count_failed: number;
  agent_count_cancelled: number;
  agent_count_blocked: number;
  subagent_count: number;
  delegation_depth: number;
  fan_out_max: number;
  fan_out_mean: number;
  fan_out_median: number;
  delegation_requested: number;
  delegation_accepted: number;
  delegation_rejected: number;
  delegation_acceptance_rate: number | null;
  delegated_task_share: number | null;
  delegation_rework_rate: number | null;
  root_direct_engineering_share: number | null;
  root_coordination_share: number | null;
  delegated_engineering_share: number | null;
  unattributed_work_share: number | null;
}

export interface UsageAggregate {
  input_tokens: MeasurementValue;
  output_tokens: MeasurementValue;
  cached_input_tokens: MeasurementValue;
  cache_creation_tokens: MeasurementValue;
  reasoning_tokens: MeasurementValue;
  total_reported: MeasurementValue;
  total_estimated: MeasurementValue;
  cost_usd_reported: MeasurementValue;
  cost_usd_calculated: MeasurementValue;
  cost_usd_estimated: MeasurementValue;
  request_count: number;
  deduped_request_count: number;
}

export interface LatencyAggregate {
  sample_size: number;
  mean_ms: number | null;
  median_ms: number | null;
  p50_ms: number | null;
  p90_ms: number | null;
  p95_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  reliability: "insufficient_sample" | "low" | "ok";
}

export interface TraceNode {
  span_id: string;
  parent_span_id?: string;
  kind: string;
  name: string;
  agent_id?: string;
  task_id?: string;
  started_at?: string;
  ended_at?: string;
  status?: string;
  children: TraceNode[];
  event_ids: string[];
  gap?: boolean;
}

export interface AgentTreeNode {
  agent_id: string;
  parent_agent_id?: string;
  role?: string;
  status?: string;
  children: AgentTreeNode[];
  spawn_requested: boolean;
  spawn_confirmed: boolean;
  spawn_blocked: boolean;
}

export interface CollectorStats {
  mode: CollectorMode;
  emitted: number;
  accepted: number;
  rejected_invalid: number;
  dropped: number;
  delayed: number;
  duplicates: number;
  critical_lost: number;
  queue_high_water: number;
  write_failures: number;
  last_error?: string;
}

export interface BenchmarkCaseManifest {
  case_id: string;
  name: string;
  objective: string;
  repo: string;
  fixture_path: string;
  initial_hash?: string;
  preconditions: string[];
  acceptance_criteria: Array<{
    id: string;
    description: string;
    mandatory: boolean;
    evaluator: "deterministic" | "test" | "hash" | "manual" | "llm";
  }>;
  budget?: { max_tokens?: number; max_cost_usd?: number; max_duration_ms?: number };
  timeout_ms: number;
  strategies: StrategyId[];
  fault_injection?: string[];
  invalidation_rules: string[];
  difficulty?: string;
  class: string;
  multi_file?: boolean;
  split: "development" | "validation" | "held_out";
}

export interface BenchmarkSuiteManifest {
  suite_id: string;
  name: string;
  version: string;
  objective: string;
  cases: string[];
  default_criteria: string[];
  environment: Record<string, string>;
  allowed_providers: string[];
  budgets: Record<string, number>;
  repetitions: { smoke: number; exploratory: number; final: number };
  strategies: StrategyId[];
  evaluators: string[];
  privacy: { content_capture: "off" | "opt_in"; retention_days: number };
}

export interface ExperimentManifest {
  experiment_id: string;
  name: string;
  description?: string;
  suite_id: string;
  strategies: StrategyId[];
  case_ids?: string[];
  repetitions: number;
  seed?: number;
  evolveloop_commit?: string;
  branch?: string;
  provider_id?: string;
  model_id?: string;
  created_at: string;
  status: "created" | "running" | "completed" | "failed" | "cancelled";
}

export interface CriterionState {
  id: string;
  description: string;
  mandatory: boolean;
  evaluator: string;
  state: "NOT_EVALUATED" | "PASS" | "FAIL" | "BLOCKED" | "INVALID_EVIDENCE";
  evidence_ids: string[];
  artifact_version?: string;
  evaluated_at?: string;
  reason?: string;
}

export interface EvaluationResult {
  run_id: string;
  case_id?: string;
  criteria: CriterionState[];
  true_full_pass: boolean;
  true_full_pass_reason: string;
  evidence_validity_rate: number | null;
  false_positive_checks: Array<{ id: string; rejected: boolean; reason: string }>;
}
