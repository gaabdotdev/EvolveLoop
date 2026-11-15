/**
 * M17-local fair-baseline types. Not a frozen ContractKind.
 * Do not add FairBaselineArtifact to CONTRACT_CATALOG or ID_PREFIX.
 */

import type { CostRecord, IsoTimestamp } from "../contracts/common.js";

export const FAIR_BASELINE_KIND = "FairBaselineArtifact" as const;
export const FAIR_BASELINE_SCHEMA_VERSION = "0.1.0";

export const CANONICAL_SUITE_ID = "el-v4-fair-baseline";
export const CANONICAL_SUITE_VERSION = "0.1.0";
export const HARNESS_ID = "el-v4-bench-harness";
export const HARNESS_VERSION = "0.1.0";
export const PROTOCOL_ID = "el-v4-fair-baseline.protocol";
export const PROTOCOL_VERSION = "0.1.0";
export const IMPROVEMENT_BAR_ID = "el-v4-measurable-improvement.bar";
export const IMPROVEMENT_BAR_VERSION = "0.1.0";

export const QUALITY_PROOF_PROVENANCE = ["OBSERVED", "HARNESS_REPORTED"] as const;
export type QualityProofProvenance = (typeof QUALITY_PROOF_PROVENANCE)[number];

export const NON_PROOF_PROVENANCE = ["PROVIDER_REPORTED", "DERIVED", "ESTIMATED", "UNAVAILABLE", "UNKNOWN"] as const;
export type NonProofProvenance = (typeof NON_PROOF_PROVENANCE)[number];

export const REFUSED_METRIC_PROVENANCE = ["SELF_REPORTED"] as const;

export const FORBIDDEN_RANKING_FIELDS = ["global_score", "rank", "overall_score"] as const;

export const CAPABILITY_BASELINE_METRICS = [
  "success_rate",
  "validated_quality",
  "latency_ms_p50",
  "latency_ms_p95",
  "cost_per_verified_result",
  "stability",
  "recovery_rate",
] as const;

/** Constitution §13 product metrics — baseline-only; not CapabilityProfile fields. */
export const PRODUCT_BASELINE_METRICS = [
  "verified_completion",
  "handoff_success_rate",
  "confirmed_state_loss",
  "recovery_time_ms",
  "human_interventions_per_work",
] as const;

export const BASELINE_METRICS = [...CAPABILITY_BASELINE_METRICS, ...PRODUCT_BASELINE_METRICS] as const;
export type BaselineMetricName = (typeof BASELINE_METRICS)[number];

export const PRIMARY_AXES = [
  { metric: "cost_per_verified_result", direction: "lower_better" },
  { metric: "validated_quality", direction: "higher_better" },
  { metric: "verified_completion", direction: "higher_better" },
] as const;

export type AxisDirection = "higher_better" | "lower_better";

export const COMPARATOR_CLASSES = ["v4_non_adaptive", "manual_traditional", "comparable_platform"] as const;
export type ComparatorClass = (typeof COMPARATOR_CLASSES)[number];

export const HARNESS_ROLES = ["schema_validator", "workload_executor"] as const;
export type HarnessRole = (typeof HARNESS_ROLES)[number];

export const CASE_RUN_STATUSES = ["DECLARED_NOT_RUN", "EXECUTED"] as const;
export type CaseRunStatus = (typeof CASE_RUN_STATUSES)[number];

export interface UnavailablePin {
  value: null;
  provenance: "UNAVAILABLE";
}

export interface WorkloadCase {
  case_id: string;
  description: string;
  run_status: CaseRunStatus;
}

export interface WorkloadDefinition {
  suite_id: string;
  suite_version: string;
  work_category: string;
  task_kind: string;
  comparator_class: ComparatorClass;
  cases: WorkloadCase[];
  acceptance_criteria: string[];
}

export interface HarnessIdentity {
  harness_id: string;
  harness_version: string;
  role: HarnessRole;
  git_ref?: string;
}

export interface EnvironmentRecord {
  class: string;
  os?: string | UnavailablePin;
  runtime?: string | UnavailablePin;
  model_identity?: string | UnavailablePin;
  notes?: string;
}

interface MetricSlotBase {
  metric: BaselineMetricName;
  unit: string;
  source_refs: string[];
}

export interface RecordedMetricSlot extends MetricSlotBase {
  status: "RECORDED";
  value: number;
  sample_size: number;
  window: { from: IsoTimestamp; to: IsoTimestamp };
  uncertainty: { method: string; lower: number; upper: number; confidence?: number };
  provenance: QualityProofProvenance;
  quality_proof: true;
  independent_verifier_id?: string;
  executor_id?: string;
}

export interface DeclaredAbsentMetricSlot extends MetricSlotBase {
  status: "DECLARED_UNAVAILABLE" | "ESTIMATED_NOT_PROOF";
  value: null;
  sample_size?: number;
  provenance: "UNAVAILABLE" | "ESTIMATED";
  quality_proof: false;
  reason: string;
}

export interface DisclosedNotProofMetricSlot extends MetricSlotBase {
  status: "DISCLOSED_NOT_PROOF";
  value: number | null;
  sample_size?: number;
  window?: { from: IsoTimestamp; to: IsoTimestamp };
  uncertainty?: { method: string; lower: number; upper: number };
  provenance: "PROVIDER_REPORTED" | "DERIVED" | "UNKNOWN";
  quality_proof: false;
  reason: string;
}

export type BaselineMetricSlot = RecordedMetricSlot | DeclaredAbsentMetricSlot | DisclosedNotProofMetricSlot;

export const COST_INCLUDES = [
  "execution",
  "retries",
  "coordination",
  "verification",
  "recovery",
  "platform_overhead",
] as const;

export interface BaselineCostRecord extends CostRecord {
  includes: string[];
}

export interface MethodologyNote {
  m08_methodology_id: string;
  m08_methodology_version: string;
  m08_methodology_status: "PLACEHOLDER" | "PROVISIONAL";
  this_artifact_stamps_methodology_accepted: false;
}

export interface ComparisonScope {
  compared: string[];
  not_compared: string[];
}

export interface FairBaselineArtifact {
  kind: typeof FAIR_BASELINE_KIND;
  schema_version: string;
  artifact_id: string;
  suite_id: string;
  suite_version: string;
  workload: WorkloadDefinition;
  harness: HarnessIdentity;
  environment: EnvironmentRecord;
  metrics: BaselineMetricSlot[];
  cost: BaselineCostRecord;
  comparison_scope: ComparisonScope;
  methodology_note: MethodologyNote;
  production_scores: "ABSENT" | "PARTIAL";
  computed_at: IsoTimestamp;
  limitations: string[];
}

export const NUMERIC_FLOORS: {
  min_relative_improvement: { value: null; provenance: "UNAVAILABLE" };
  max_allowed_degradation_other_axes: { value: null; provenance: "UNAVAILABLE" };
  min_sample_size_for_claim: { value: null; provenance: "UNAVAILABLE" };
} = {
  min_relative_improvement: { value: null, provenance: "UNAVAILABLE" },
  max_allowed_degradation_other_axes: { value: null, provenance: "UNAVAILABLE" },
  min_sample_size_for_claim: { value: null, provenance: "UNAVAILABLE" },
};

export type ImprovementVerdictKind =
  | "UNAVAILABLE"
  | "INCOMPARABLE"
  | "INVALID"
  | "IMPROVED"
  | "DEGRADED"
  | "TRADEOFF_NOT_IMPROVEMENT"
  | "NO_MATERIAL_CHANGE";

export interface ImprovementClaim {
  claim_kind: "measurable_improvement" | "tradeoff_disclosure";
  cited_metrics?: BaselineMetricName[];
}

export interface ImprovementVerdict {
  kind: ImprovementVerdictKind;
  bar_id: typeof IMPROVEMENT_BAR_ID;
  bar_version: typeof IMPROVEMENT_BAR_VERSION;
  numeric_floors: typeof NUMERIC_FLOORS;
  reasons: string[];
  axis_results: Array<{
    metric: BaselineMetricName;
    comparable: boolean;
    delta_direction?: "better" | "worse" | "equal" | "unavailable";
  }>;
}
