/**
 * M12 Predictive Observability init (V4.0).
 * Types for the V4 wrap around the V3 Measurement Plane envelope (ADR-V4-0002).
 * Does not mutate MP types; does not add SELF_REPORTED to the MP envelope.
 */

import type {
  AgentTreeNode,
  MeasurementEvent,
  ProvenanceKind,
  TraceNode,
} from "../../telemetry/measurement-plane/types.js";

/** Ingest channel. Authentication is never inferred from payload fields (TM-V4-F10). */
export type IngestChannel = "unauthenticated" | "control_plane";

/**
 * In-process Control Plane observer identity.
 * Only this channel may retain an explicit OBSERVED label.
 * Identity comes from the call, not from the event payload.
 */
export interface ControlPlaneObserver {
  component: string;
  module: string;
  instance_id?: string;
}

/** MP provenance vocabulary reused unchanged (ADR-V4-0002). SELF_REPORTED is V4 evidence-only. */
export const MP_PROVENANCE_KINDS: readonly ProvenanceKind[] = [
  "OBSERVED",
  "PROVIDER_REPORTED",
  "HARNESS_REPORTED",
  "ESTIMATED",
  "DERIVED",
  "UNAVAILABLE",
  "UNKNOWN",
];

/** R15 / TM-V4-F10: unlabeled event-level provenance. Never OBSERVED. */
export const MISSING_EVENT_PROVENANCE: ProvenanceKind = "UNKNOWN";

/** R15 / INV-EXEC-03 analog: unlabeled or absent measurement values. */
export const MISSING_MEASUREMENT_PROVENANCE: ProvenanceKind = "UNAVAILABLE";

/** F10: do not attribute unlabeled data to the Measurement Plane itself. */
export const MISSING_REPORTED_BY = "UNAVAILABLE";

/** Fingerprint of the V3 envelope default (envelope.ts). Treated as missing, not as a real reporter. */
export const MP_DEFAULT_REPORTER = "evolveloop-measurement-plane";

export const MISSION_PROVENANCE_LABELS = [
  "OBSERVED",
  "PROVIDER_REPORTED",
  "ESTIMATED",
  "UNAVAILABLE",
] as const;

export type MissionProvenanceLabel = (typeof MISSION_PROVENANCE_LABELS)[number];

export interface ProvenanceDecision {
  kind: ProvenanceKind;
  reported_by: string;
  provider?: string | null;
  estimate_method?: string;
  price_table_version?: string;
  /** Fields this wrap defaulted because they were missing or unauthenticated. */
  defaulted_fields: string[];
  /** True when an explicit OBSERVED claim was downgraded on the unauthenticated channel. */
  observed_downgraded: boolean;
}

export interface AnomalyAssessment {
  signal: "stagnation" | "cost_anomaly";
  status: "UNAVAILABLE";
  provenance: "UNAVAILABLE";
  value: null;
  reason: string;
}

export interface UnknownRateReport {
  total: number;
  unknown: number;
  /** unknown/total; null when total is 0 (no rate invented). */
  rate: number | null;
  rate_provenance: "DERIVED" | "UNAVAILABLE";
  count_provenance: "OBSERVED";
}

export interface IncidentSignal {
  status: "UNAVAILABLE";
  provenance: "UNAVAILABLE";
  freeze: null;
  revocation: null;
  reason: string;
}

export interface ObservabilityTimelineEntry {
  occurred_at: string;
  event_name: string;
  event_id: string;
  agent_id?: string;
  task_id?: string;
  gap?: boolean;
}

export interface ObservabilityTrace {
  events_used: number;
  reconstruction_provenance: "DERIVED";
  gap_provenance: "UNAVAILABLE";
  timeline: ObservabilityTimelineEntry[];
  agent_tree: AgentTreeNode[];
  forest: TraceNode[];
  gaps: ObservabilityTimelineEntry[];
}

export type { MeasurementEvent, ProvenanceKind };
