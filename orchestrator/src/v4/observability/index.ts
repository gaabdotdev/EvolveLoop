/**
 * M12 Predictive Observability init — V4 wrap around telemetry/measurement-plane.
 *
 * Public surface for M19 wiring and other metas. Depend on MeasurementSinkPort
 * from contracts; import this module only at composition time.
 */

export { ObservabilitySink, type ObservabilitySinkOptions, type IngestResult } from "./sink.js";
export { wrapInboundEvent, type EnvelopeResult } from "./envelope.js";
export {
  normalizeEventProvenance,
  normalizeMeasurementEntry,
  normalizeMeasurements,
  toProvenanceInfo,
  isMpProvenanceKind,
} from "./provenance.js";
export { redactDeep, redactMeasurementEvent, findSecretFindings, REDACTED } from "./redaction.js";
export { reconstructObservedExecution, buildAgentTree, buildTimeline, buildTraceForest } from "./traces.js";
export { evaluateStagnation, evaluateCostAnomaly } from "./anomalies.js";
export { computeUnknownProvenanceRate, incidentSignal } from "./signals.js";
export {
  MISSING_EVENT_PROVENANCE,
  MISSING_MEASUREMENT_PROVENANCE,
  MISSING_REPORTED_BY,
  MP_DEFAULT_REPORTER,
  MP_PROVENANCE_KINDS,
  MISSION_PROVENANCE_LABELS,
  type ControlPlaneObserver,
  type IngestChannel,
  type ProvenanceDecision,
  type AnomalyAssessment,
  type UnknownRateReport,
  type IncidentSignal,
  type ObservabilityTrace,
} from "./types.js";
