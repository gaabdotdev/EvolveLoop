/**
 * M17 fair-baseline harness (early). Schema + honesty checks only.
 * Not a frozen contract, not a ranking engine, not an M08 ACCEPTED stamp.
 */

export {
  BASELINE_MAY_DRIVE_L2_L3_ROUTING,
  CANONICAL_CASE_IDS,
  CANONICAL_ENVIRONMENT_CLASS,
  CANONICAL_TASK_KIND,
  CANONICAL_WORK_CATEGORY,
  M08_PUBLISHED_METHODOLOGY_ID,
  M08_PUBLISHED_METHODOLOGY_VERSION,
  METHODOLOGY_ACCEPTED_BY_M17,
  PRODUCTION_SCORES_EXIST,
  canonicalHarnessIdentity,
  canonicalSuiteIdentity,
  costMayProveQuality,
  isQualityProofProvenance,
} from "./protocol.js";
export { validateBaselineArtifact } from "./schema.js";
export { evaluateImprovementClaim } from "./improvement.js";
export { baselineMayDriveL2L3Routing, preferExecutorFromBaseline, rankExecutorsFromBaseline } from "./routing.js";
export { BaselineError, BaselineScoreRoutingForbidden, BaselineValidationError } from "./errors.js";
export {
  BASELINE_METRICS,
  CANONICAL_SUITE_ID,
  CANONICAL_SUITE_VERSION,
  CAPABILITY_BASELINE_METRICS,
  COMPARATOR_CLASSES,
  COST_INCLUDES,
  FAIR_BASELINE_KIND,
  FAIR_BASELINE_SCHEMA_VERSION,
  FORBIDDEN_RANKING_FIELDS,
  HARNESS_ID,
  HARNESS_VERSION,
  IMPROVEMENT_BAR_ID,
  IMPROVEMENT_BAR_VERSION,
  NUMERIC_FLOORS,
  PRIMARY_AXES,
  PRODUCT_BASELINE_METRICS,
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  QUALITY_PROOF_PROVENANCE,
} from "./types.js";
export type {
  BaselineMetricName,
  BaselineMetricSlot,
  FairBaselineArtifact,
  ImprovementClaim,
  ImprovementVerdict,
  ImprovementVerdictKind,
  RecordedMetricSlot,
} from "./types.js";
