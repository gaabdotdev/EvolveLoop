/**
 * R15 / TM-V4-F10 provenance normalization for the M12 wrap.
 *
 * Rules (frozen):
 * - Missing event provenance → UNKNOWN, never OBSERVED.
 * - Missing measurement provenance → UNAVAILABLE; UNAVAILABLE ⇒ value null.
 * - OBSERVED is retained only when explicitly set AND the ingest channel is control_plane.
 * - Unauthenticated emit() cannot persist OBSERVED (payload-asserted trust is rejected).
 * - Never invent numeric values; never upgrade UNKNOWN/UNAVAILABLE to OBSERVED.
 */

import type { MeasurementValue, ProvenanceInfo, ProvenanceKind } from "../../telemetry/measurement-plane/types.js";
import { isRecord } from "../contracts/common.js";
import {
  MISSING_EVENT_PROVENANCE,
  MISSING_MEASUREMENT_PROVENANCE,
  MISSING_REPORTED_BY,
  MP_DEFAULT_REPORTER,
  MP_PROVENANCE_KINDS,
  type ControlPlaneObserver,
  type IngestChannel,
  type ProvenanceDecision,
} from "./types.js";

export function isMpProvenanceKind(value: unknown): value is ProvenanceKind {
  return typeof value === "string" && (MP_PROVENANCE_KINDS as readonly string[]).includes(value);
}

function reporterFromObserver(observer: ControlPlaneObserver): string {
  return observer.instance_id
    ? `${observer.component}:${observer.module}:${observer.instance_id}`
    : `${observer.component}:${observer.module}`;
}

function resolveReportedBy(
  raw: unknown,
  channel: IngestChannel,
  observer: ControlPlaneObserver | undefined,
): string {
  if (channel === "control_plane" && observer) {
    return reporterFromObserver(observer);
  }
  if (typeof raw === "string" && raw.length > 0 && raw !== MP_DEFAULT_REPORTER) {
    return raw;
  }
  return MISSING_REPORTED_BY;
}

/**
 * Normalize event-level provenance. Missing/invalid → UNKNOWN.
 * Explicit OBSERVED on the unauthenticated channel → UNKNOWN (not authenticated).
 */
export function normalizeEventProvenance(
  raw: unknown,
  channel: IngestChannel,
  observer?: ControlPlaneObserver,
): ProvenanceDecision {
  const defaulted: string[] = [];
  const obj = isRecord(raw) ? raw : undefined;
  if (!obj) defaulted.push("provenance");

  const rawKind = obj?.kind;
  let kind: ProvenanceKind;
  let observedDowngraded = false;

  if (!isMpProvenanceKind(rawKind)) {
    kind = MISSING_EVENT_PROVENANCE;
    defaulted.push("provenance.kind");
  } else if (rawKind === "OBSERVED" && channel !== "control_plane") {
    kind = MISSING_EVENT_PROVENANCE;
    observedDowngraded = true;
    defaulted.push("provenance.kind");
  } else {
    kind = rawKind;
  }

  const reported_by = resolveReportedBy(obj?.reported_by, channel, observer);
  if (!obj || typeof obj.reported_by !== "string" || obj.reported_by.length === 0 || obj.reported_by === MP_DEFAULT_REPORTER) {
    defaulted.push("provenance.reported_by");
  }

  const provider = obj && "provider" in obj ? (obj.provider as string | null | undefined) : undefined;
  const estimate_method = typeof obj?.estimate_method === "string" ? obj.estimate_method : undefined;
  const price_table_version = typeof obj?.price_table_version === "string" ? obj.price_table_version : undefined;

  return {
    kind,
    reported_by,
    provider: provider === undefined ? null : provider,
    estimate_method,
    price_table_version,
    defaulted_fields: defaulted,
    observed_downgraded: observedDowngraded,
  };
}

export function toProvenanceInfo(decision: ProvenanceDecision): ProvenanceInfo {
  return {
    kind: decision.kind,
    provider: decision.provider ?? null,
    reported_by: decision.reported_by,
    estimate_method: decision.estimate_method,
    price_table_version: decision.price_table_version,
  };
}

/**
 * Normalize one measurements[] entry.
 * - Missing/null primitive → UNAVAILABLE, value null.
 * - Bare number kept, labeled UNKNOWN (received unlabeled; not invented; not OBSERVED).
 * - MeasurementValue with missing provenance → UNAVAILABLE and value null.
 * - Explicit UNAVAILABLE forces value null (INV-EXEC-03 analog).
 * - Never invents a numeric value.
 */
export function normalizeMeasurementEntry(
  metric: string,
  raw: unknown,
  channel: IngestChannel = "unauthenticated",
): MeasurementValue | number | string | boolean | null {
  if (raw === null || raw === undefined) {
    return {
      metric,
      value: null,
      unit: MISSING_MEASUREMENT_PROVENANCE,
      provenance: MISSING_MEASUREMENT_PROVENANCE,
    };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return {
        metric,
        value: null,
        unit: MISSING_MEASUREMENT_PROVENANCE,
        provenance: MISSING_MEASUREMENT_PROVENANCE,
      };
    }
    return {
      metric,
      value: raw,
      unit: MISSING_MEASUREMENT_PROVENANCE,
      provenance: MISSING_EVENT_PROVENANCE,
    };
  }

  if (typeof raw === "string" || typeof raw === "boolean") {
    return raw;
  }

  if (!isRecord(raw)) {
    return {
      metric,
      value: null,
      unit: MISSING_MEASUREMENT_PROVENANCE,
      provenance: MISSING_MEASUREMENT_PROVENANCE,
    };
  }

  const labeled = raw.provenance;
  const hasProvenance = isMpProvenanceKind(labeled);
  let value: number | null;
  if (typeof raw.value === "number" && Number.isFinite(raw.value)) {
    value = raw.value;
  } else if (raw.value === null || raw.value === undefined) {
    value = null;
  } else {
    // Non-numeric "value" is not a measurement fact we can keep as a number.
    value = null;
  }

  let provenance: ProvenanceKind;
  if (!hasProvenance) {
    provenance = value === null ? MISSING_MEASUREMENT_PROVENANCE : MISSING_EVENT_PROVENANCE;
  } else if (labeled === "OBSERVED" && channel !== "control_plane") {
    provenance = MISSING_EVENT_PROVENANCE;
  } else {
    provenance = labeled;
  }

  const unit = typeof raw.unit === "string" && raw.unit.length > 0 ? raw.unit : MISSING_MEASUREMENT_PROVENANCE;
  const metricName = typeof raw.metric === "string" && raw.metric.length > 0 ? raw.metric : metric;

  if (provenance === "UNAVAILABLE") {
    value = null;
  }

  const out: MeasurementValue = {
    metric: metricName,
    value,
    unit,
    provenance,
  };
  if (typeof raw.provider_id === "string") out.provider_id = raw.provider_id;
  if (typeof raw.model_id === "string") out.model_id = raw.model_id;
  if (typeof raw.request_id === "string") out.request_id = raw.request_id;
  if (typeof raw.final === "boolean") out.final = raw.final;
  if (typeof raw.collected_at === "string") out.collected_at = raw.collected_at;
  if (typeof raw.estimate_method === "string") out.estimate_method = raw.estimate_method;
  if (typeof raw.price_table_version === "string") out.price_table_version = raw.price_table_version;
  return out;
}

export function normalizeMeasurements(
  raw: unknown,
  channel: IngestChannel = "unauthenticated",
): Record<string, MeasurementValue | number | string | boolean | null> {
  if (!isRecord(raw)) return {};
  const out: Record<string, MeasurementValue | number | string | boolean | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = normalizeMeasurementEntry(key, value, channel);
  }
  return out;
}
