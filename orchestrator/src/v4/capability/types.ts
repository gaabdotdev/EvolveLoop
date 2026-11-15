/**
 * M08-local types. CapabilityProfile itself is the frozen contract.
 */

import type { AutonomyLevel, IsoTimestamp } from "../contracts/index.js";
import type { CapabilityMetric, CapabilityProfile, MetricEstimate } from "../contracts/capability-profile.js";
import type { ControlPlaneObserver, IngestChannel } from "../observability/types.js";

export const CAPABILITY_METRIC_PROVENANCE = ["OBSERVED", "DERIVED", "PROVIDER_REPORTED", "HARNESS_REPORTED"] as const;
export type CapabilityMetricProvenance = (typeof CAPABILITY_METRIC_PROVENANCE)[number];

export const UNSUPPORTED_METRIC_PROVENANCE = ["SELF_REPORTED", "UNKNOWN", "ESTIMATED", "UNAVAILABLE"] as const;
export type UnsupportedMetricProvenance = (typeof UNSUPPORTED_METRIC_PROVENANCE)[number];

export const FORBIDDEN_RANKING_FIELDS = ["global_score", "rank", "overall_score"] as const;

export const DISCLOSURE_FIELDS = [
  "context",
  "sample_size",
  "window",
  "uncertainty",
  "provenance",
  "source_refs",
  "methodology",
] as const;

export interface AssembleProfileInput {
  profile_id?: string;
  subject: CapabilityProfile["subject"];
  context: CapabilityProfile["context"];
  metrics: MetricEstimate[];
  computed_at: IsoTimestamp;
  valid_until: IsoTimestamp;
  /** PLACEHOLDER is allowed; ACCEPTED is refused in this cut. Default: published PROVISIONAL. */
  methodology?: CapabilityProfile["methodology"];
  status?: "PROVISIONAL" | "STALE";
}

export interface MeasurementIngestInput {
  metric: CapabilityMetric;
  /** Raw measurement entry (number | MeasurementValue-shaped object). */
  raw: unknown;
  channel: IngestChannel;
  observer?: ControlPlaneObserver;
  window: { from: IsoTimestamp; to: IsoTimestamp };
  source_refs: string[];
  unit?: string;
  sample_size?: number;
  uncertainty?: MetricEstimate["uncertainty"];
  /** Event-level provenance blob; normalized via M12 before the measurement is trusted. */
  event_provenance?: unknown;
}

export interface PutOptions {
  /**
   * In-process attestation that OBSERVED metrics were produced on the control-plane
   * channel (same pattern as M12 `emitFromControlPlane`). Payload-asserted OBSERVED
   * is not attestation.
   */
  observed_attestation?: IngestChannel;
}

export interface RoutingAdvice {
  autonomy: AutonomyLevel;
  /** Always FORBIDDEN while methodology is not ACCEPTED. */
  preference: "FORBIDDEN";
  ranked_executor_ids: [];
  reason: string;
  /** Profiles may be listed for disclosure; order is not a ranking. */
  unordered_profile_ids: string[];
}

export type Clock = () => IsoTimestamp;
