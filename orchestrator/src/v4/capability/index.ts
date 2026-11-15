/**
 * M08 Capability Intelligence — public surface.
 *
 * Consumers depend on CapabilityProfilePort (contracts/ports.ts), not this barrel,
 * except M19 wiring and tests. Methodology is PROVISIONAL (ADR-V4-0010): not
 * ACCEPTED, not a ranking formula, not L2/L3 routing preference.
 */

export { CapabilityProfileStore, assembleProfile, profileStorageKey } from "./store.js";
export {
  adviseExecutorPreference,
  metricMayDriveRouting,
  preferExecutorByScore,
  profilesWithoutScoreOrder,
  SCORE_PREFERENCE_REASON,
} from "./routing.js";
export { estimateFromMeasurement, resolveCapabilityProvenance, observedAttestationFor } from "./ingest.js";
export {
  assertConformsProfile,
  assertMetricDisclosure,
  assertProfileEngineRules,
  assertStoreableProfile,
  provenanceForbiddenForMetric,
  provenanceSupportsMetric,
  rejectRankingFields,
  rejectSelfTrustFields,
} from "./invariants.js";
export {
  METHODOLOGY_ENGINE_VERSION,
  METHODOLOGY_RESIDUALS,
  PLACEHOLDER_METHODOLOGY,
  POINT_INTERVAL_METHOD,
  PUBLISHED_METHODOLOGY,
  isPlaceholderMethodology,
  isPublishedMethodology,
  methodologyAllowsActive,
  methodologyIsAccepted,
} from "./methodology.js";
export { allocateProfileId, sequentialProfileId } from "./ids.js";
export {
  CapabilityError,
  CapabilityIngestError,
  CapabilityValidationError,
  ScoreRoutingForbidden,
} from "./errors.js";
export {
  CAPABILITY_METRIC_PROVENANCE,
  DISCLOSURE_FIELDS,
  FORBIDDEN_RANKING_FIELDS,
  UNSUPPORTED_METRIC_PROVENANCE,
} from "./types.js";
export type {
  AssembleProfileInput,
  CapabilityMetricProvenance,
  Clock,
  MeasurementIngestInput,
  PutOptions,
  RoutingAdvice,
  UnsupportedMetricProvenance,
} from "./types.js";
