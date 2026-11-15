/**
 * Compose M12 provenance defaults before a measurement can become a metric estimate.
 * Unauthenticated OBSERVED is never capability input (TM-V4-F10 / D04 / ADR-V4-0009).
 *
 * This path does not invent a scoring formula: one authenticated measurement becomes
 * at most one disclosed MetricEstimate. Percentiles, Elo, and recency decay are GAP.
 */

import { CAPABILITY_METRICS, type CapabilityMetric, type MetricEstimate } from "../contracts/capability-profile.js";
import { isRecord } from "../contracts/common.js";
import {
  normalizeEventProvenance,
  normalizeMeasurementEntry,
} from "../observability/provenance.js";
import type { IngestChannel } from "../observability/types.js";
import { CapabilityIngestError } from "./errors.js";
import { POINT_INTERVAL_METHOD } from "./methodology.js";
import { provenanceSupportsMetric } from "./invariants.js";
import { UNSUPPORTED_METRIC_PROVENANCE, type MeasurementIngestInput } from "./types.js";

function refuse(code: string, message: string, path?: string): never {
  throw new CapabilityIngestError(code, message, path);
}

function isCapabilityMetric(value: unknown): value is CapabilityMetric {
  return typeof value === "string" && (CAPABILITY_METRICS as readonly string[]).includes(value);
}

function rawKind(raw: unknown): unknown {
  if (typeof raw === "string") return raw;
  if (isRecord(raw) && "kind" in raw) return raw.kind;
  if (isRecord(raw) && "provenance" in raw) {
    const p = raw.provenance;
    if (typeof p === "string") return p;
    if (isRecord(p) && typeof p.kind === "string") return p.kind;
  }
  return undefined;
}

/**
 * Resolve the provenance that may appear on a MetricEstimate.
 * M12 defaults run first; unsupported kinds (including downgraded OBSERVED) fail closed.
 */
export function resolveCapabilityProvenance(input: MeasurementIngestInput): MetricEstimate["provenance"] {
  const claimed = rawKind(input.raw);
  if (typeof claimed === "string" && (UNSUPPORTED_METRIC_PROVENANCE as readonly string[]).includes(claimed)) {
    refuse(
      "INV-CPROF-01",
      `provenance ${claimed} cannot support a capability estimate`,
      "raw.provenance",
    );
  }

  if (input.event_provenance !== undefined) {
    const event = normalizeEventProvenance(input.event_provenance, input.channel, input.observer);
    if (event.observed_downgraded) {
      refuse(
        "F10_UNAUTHENTICATED_OBSERVED",
        "unauthenticated OBSERVED was downgraded by M12 and cannot support a capability estimate",
        "event_provenance",
      );
    }
    if (!provenanceSupportsMetric(event.kind)) {
      refuse(
        "INV-CPROF-01",
        `event provenance ${event.kind} cannot support a capability estimate`,
        "event_provenance.kind",
      );
    }
  }

  if (input.channel !== "control_plane" && claimed === "OBSERVED") {
    refuse(
      "F10_UNAUTHENTICATED_OBSERVED",
      "payload-asserted OBSERVED on an unauthenticated channel cannot support a capability estimate",
      "raw.provenance",
    );
  }

  const normalized = normalizeMeasurementEntry(input.metric, input.raw, input.channel);
  if (normalized === null || typeof normalized === "string" || typeof normalized === "boolean") {
    refuse("INV-CPROF-01", "measurement is not a numeric estimate", "raw");
  }
  if (typeof normalized === "number") {
    refuse("INV-CPROF-01", "bare unlabeled numbers are UNKNOWN after M12 and cannot support a capability estimate", "raw");
  }

  if (normalized.provenance === "UNKNOWN" && input.channel !== "control_plane") {
    refuse(
      "F10_UNAUTHENTICATED_OBSERVED",
      "M12 labeled this measurement UNKNOWN (missing or unauthenticated OBSERVED); not capability input",
      "raw.provenance",
    );
  }

  if (!provenanceSupportsMetric(normalized.provenance)) {
    refuse(
      "INV-CPROF-01",
      `measurement provenance ${normalized.provenance} cannot support a capability estimate`,
      "raw.provenance",
    );
  }

  if (normalized.provenance === "OBSERVED" && input.channel !== "control_plane") {
    refuse(
      "F10_UNAUTHENTICATED_OBSERVED",
      "OBSERVED metrics require the control_plane ingest channel",
      "channel",
    );
  }

  if (typeof normalized.value !== "number" || !Number.isFinite(normalized.value)) {
    refuse("NON_FINITE_VALUE", "measurement value must be a finite number", "raw.value");
  }

  return normalized.provenance;
}

export function estimateFromMeasurement(input: MeasurementIngestInput): MetricEstimate {
  if (!isCapabilityMetric(input.metric)) {
    refuse("UNKNOWN_METRIC", `metric ${String(input.metric)} is not a CapabilityMetric`, "metric");
  }
  if (!Array.isArray(input.source_refs) || input.source_refs.length < 1) {
    refuse("STRUCT", "source_refs must be a non-empty string array", "source_refs");
  }
  if (Date.parse(input.window.from) > Date.parse(input.window.to)) {
    refuse("WINDOW_ORDER", "window.from must be <= window.to", "window");
  }

  const provenance = resolveCapabilityProvenance(input);
  const normalized = normalizeMeasurementEntry(input.metric, input.raw, input.channel);
  if (!isRecord(normalized) || typeof normalized.value !== "number") {
    refuse("NON_FINITE_VALUE", "measurement value missing after M12 normalize", "raw.value");
  }

  const sample_size = input.sample_size ?? 1;
  if (!Number.isInteger(sample_size) || sample_size < 1) {
    refuse("INV-CPROF-02", "sample_size must be an integer >= 1", "sample_size");
  }

  const value = normalized.value;
  const unit =
    input.unit ??
    (typeof normalized.unit === "string" && normalized.unit.length > 0 && normalized.unit !== "UNAVAILABLE"
      ? normalized.unit
      : "1");

  const uncertainty = input.uncertainty ?? {
    method: POINT_INTERVAL_METHOD,
    lower: value,
    upper: value,
  };
  if (typeof uncertainty.method !== "string" || uncertainty.method.length === 0) {
    refuse("INV-CPROF-02", "uncertainty.method required", "uncertainty.method");
  }
  if (typeof uncertainty.lower !== "number" || typeof uncertainty.upper !== "number" || uncertainty.lower > uncertainty.upper) {
    refuse("INV-CPROF-02", "uncertainty interval required (lower <= upper)", "uncertainty");
  }

  return {
    metric: input.metric,
    value,
    unit,
    sample_size,
    window: { from: input.window.from, to: input.window.to },
    uncertainty,
    provenance,
    source_refs: [...input.source_refs],
  };
}

export function observedAttestationFor(channel: IngestChannel): IngestChannel {
  return channel;
}
