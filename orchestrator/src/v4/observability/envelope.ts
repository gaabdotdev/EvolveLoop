/**
 * V4 measurement envelope: wrap MP createMeasurementEvent with R15 defaults.
 * The V3 helper defaults missing kind to OBSERVED (TM-V4-F10). This wrap never does.
 */

import {
  createMeasurementEvent,
  type CreateEventInput,
  validateMeasurementEvent,
} from "../../telemetry/measurement-plane/envelope.js";
import type {
  CorrelationIds,
  EventQuality,
  EventSourceInfo,
  MeasurementEvent,
  MeasurementEventLink,
  PrivacyInfo,
} from "../../telemetry/measurement-plane/types.js";
import { isRecord } from "../contracts/common.js";
import { normalizeEventProvenance, normalizeMeasurements, toProvenanceInfo } from "./provenance.js";
import { redactMeasurementEvent } from "./redaction.js";
import { MISSING_REPORTED_BY, type ControlPlaneObserver, type IngestChannel } from "./types.js";

export interface EnvelopeResult {
  ok: boolean;
  event?: MeasurementEvent;
  reason?: string;
  defaulted_fields: string[];
  observed_downgraded: boolean;
}

function sourceFrom(raw: unknown, observer?: ControlPlaneObserver): EventSourceInfo {
  if (observer) {
    return {
      component: observer.component,
      module: observer.module,
      instance_id: observer.instance_id,
    };
  }
  if (isRecord(raw) && typeof raw.component === "string" && raw.component.length > 0 && typeof raw.module === "string" && raw.module.length > 0) {
    return {
      component: raw.component,
      module: raw.module,
      instance_id: typeof raw.instance_id === "string" && raw.instance_id.length > 0 ? raw.instance_id : undefined,
    };
  }
  return { component: MISSING_REPORTED_BY, module: MISSING_REPORTED_BY };
}

function qualityFrom(raw: unknown, defaulted: string[]): EventQuality {
  const obj = isRecord(raw) ? raw : undefined;
  const estimated = Array.isArray(obj?.estimated_fields)
    ? obj.estimated_fields.filter((x): x is string => typeof x === "string")
    : [];
  const missingFromInput = Array.isArray(obj?.missing_fields)
    ? obj.missing_fields.filter((x): x is string => typeof x === "string")
    : [];
  const missing = [...new Set([...missingFromInput, ...defaulted])];
  return {
    complete: missing.length === 0 && (typeof obj?.complete === "boolean" ? obj.complete : true),
    estimated_fields: estimated,
    missing_fields: missing,
    delayed: typeof obj?.delayed === "boolean" ? obj.delayed : undefined,
    duplicate_of: typeof obj?.duplicate_of === "string" ? obj.duplicate_of : undefined,
  };
}

/**
 * Build a persistable MP event from unknown inbound payload.
 * Rejects non-objects and nameless events rather than inventing them.
 */
export function wrapInboundEvent(
  raw: unknown,
  channel: IngestChannel,
  observer?: ControlPlaneObserver,
): EnvelopeResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: "not_object", defaulted_fields: [], observed_downgraded: false };
  }
  if (typeof raw.event_name !== "string" || raw.event_name.length === 0) {
    return { ok: false, reason: "missing_event_name", defaulted_fields: [], observed_downgraded: false };
  }

  const decision = normalizeEventProvenance(raw.provenance, channel, observer);
  const measurements = normalizeMeasurements(raw.measurements, channel);
  const source = sourceFrom(raw.source, observer);
  const quality = qualityFrom(raw.quality, decision.defaulted_fields);

  const input: CreateEventInput = {
    event_name: raw.event_name,
    source,
    correlation: isRecord(raw.correlation) ? (raw.correlation as CorrelationIds) : {},
    provenance: toProvenanceInfo(decision),
    privacy: isRecord(raw.privacy) ? (raw.privacy as Partial<PrivacyInfo>) : { redacted: true },
    attributes: isRecord(raw.attributes) ? raw.attributes : {},
    measurements,
    links: Array.isArray(raw.links) ? (raw.links as MeasurementEventLink[]) : [],
    quality,
    event_version: typeof raw.event_version === "number" ? raw.event_version : undefined,
    occurred_at: typeof raw.occurred_at === "string" ? raw.occurred_at : undefined,
    monotonic_offset_ns: typeof raw.monotonic_offset_ns === "number" ? raw.monotonic_offset_ns : undefined,
    sequence: typeof raw.sequence === "number" ? raw.sequence : undefined,
    event_id: typeof raw.event_id === "string" ? raw.event_id : undefined,
    critical: typeof raw.critical === "boolean" ? raw.critical : undefined,
  };

  const created = createMeasurementEvent(input);
  // Belt-and-suspenders: MP defaults kind to OBSERVED and reported_by to the plane.
  // We already passed explicit provenance; re-assert so a future MP change cannot leak OBSERVED.
  created.provenance = toProvenanceInfo(decision);
  created.quality = quality;
  const event = redactMeasurementEvent(created);
  const validation = validateMeasurementEvent(event);
  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.errors.join("; "),
      defaulted_fields: decision.defaulted_fields,
      observed_downgraded: decision.observed_downgraded,
    };
  }
  return {
    ok: true,
    event,
    defaulted_fields: decision.defaulted_fields,
    observed_downgraded: decision.observed_downgraded,
  };
}
