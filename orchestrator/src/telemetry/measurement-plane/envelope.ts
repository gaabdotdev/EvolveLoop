import { randomUUID } from "node:crypto";
import { redactSecrets } from "../../evidence/secret-redaction.js";
import {
  MEASUREMENT_SCHEMA_VERSION,
  type CorrelationIds,
  type EventQuality,
  type EventSourceInfo,
  type MeasurementEvent,
  type MeasurementEventLink,
  type MeasurementValue,
  type PrivacyInfo,
  type ProvenanceInfo,
  type ProvenanceKind,
} from "./types.js";

const CRITICAL_EVENT_PREFIXES = [
  "run.",
  "goal.",
  "task.",
  "delegation.",
  "agent.spawn",
  "agent.completed",
  "agent.failed",
  "checkpoint.",
  "handoff.",
  "recovery.",
  "test.",
  "review.",
  "criterion.",
  "evidence.",
  "evaluation.",
  "true_full_pass.",
  "benchmark.",
  "experiment.",
  "usage.reported",
  "cost.calculated",
];

export function isCriticalEventName(eventName: string): boolean {
  return CRITICAL_EVENT_PREFIXES.some((p) => eventName === p || eventName.startsWith(p));
}

export interface CreateEventInput {
  event_name: string;
  source: EventSourceInfo;
  correlation?: CorrelationIds;
  provenance?: Partial<ProvenanceInfo>;
  privacy?: Partial<PrivacyInfo>;
  attributes?: Record<string, unknown>;
  measurements?: Record<string, MeasurementValue | number | string | boolean | null>;
  links?: MeasurementEventLink[];
  quality?: Partial<EventQuality>;
  event_version?: number;
  occurred_at?: string;
  monotonic_offset_ns?: number;
  sequence?: number;
  event_id?: string;
  critical?: boolean;
}

let processMonoStart = process.hrtime.bigint();

export function monotonicOffsetNs(): number {
  return Number(process.hrtime.bigint() - processMonoStart);
}

export function createMeasurementEvent(input: CreateEventInput): MeasurementEvent {
  const provenance: ProvenanceInfo = {
    kind: (input.provenance?.kind as ProvenanceKind) ?? "OBSERVED",
    provider: input.provenance?.provider ?? null,
    reported_by: input.provenance?.reported_by ?? "evolveloop-measurement-plane",
    estimate_method: input.provenance?.estimate_method,
    price_table_version: input.provenance?.price_table_version,
  };
  const privacy: PrivacyInfo = {
    classification: input.privacy?.classification ?? "METADATA",
    content_included: input.privacy?.content_included ?? false,
    redacted: input.privacy?.redacted ?? true,
  };
  const quality: EventQuality = {
    complete: input.quality?.complete ?? true,
    estimated_fields: input.quality?.estimated_fields ?? [],
    missing_fields: input.quality?.missing_fields ?? [],
    delayed: input.quality?.delayed,
    duplicate_of: input.quality?.duplicate_of,
  };

  return {
    schema_version: MEASUREMENT_SCHEMA_VERSION,
    event_id: input.event_id ?? `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    event_name: input.event_name,
    event_version: input.event_version ?? 1,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    monotonic_offset_ns: input.monotonic_offset_ns ?? monotonicOffsetNs(),
    sequence: input.sequence,
    source: input.source,
    correlation: sanitizeCorrelation(input.correlation ?? {}),
    provenance,
    privacy,
    attributes: redactAttributes(input.attributes ?? {}),
    measurements: input.measurements ?? {},
    links: input.links ?? [],
    quality,
    critical: input.critical ?? isCriticalEventName(input.event_name),
  };
}

function sanitizeCorrelation(c: CorrelationIds): CorrelationIds {
  const out: CorrelationIds = {};
  for (const [k, v] of Object.entries(c) as Array<[keyof CorrelationIds, CorrelationIds[keyof CorrelationIds]]>) {
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      // Additive V3.7 numeric correlation fields (epochs) — copy as provided, never invent
      (out as Record<string, unknown>)[k as string] = v;
      continue;
    }
    if (typeof v !== "string" || v.trim() === "") continue;
    // Never invent IDs — only copy provided non-empty strings
    (out as Record<string, unknown>)[k as string] = v;
  }
  return out;
}

function redactAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "string") out[k] = redactSecrets(v, { redactSensitivePaths: true });
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactAttributes(v as Record<string, unknown>);
    } else out[k] = v;
  }
  return out;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateMeasurementEvent(event: unknown): ValidationResult {
  const errors: string[] = [];
  if (!event || typeof event !== "object") {
    return { ok: false, errors: ["event must be an object"] };
  }
  const e = event as Record<string, unknown>;
  if (e.schema_version !== MEASUREMENT_SCHEMA_VERSION) {
    errors.push(`unsupported schema_version: ${String(e.schema_version)}`);
  }
  for (const field of ["event_id", "event_name", "occurred_at"] as const) {
    if (typeof e[field] !== "string" || !(e[field] as string).length) {
      errors.push(`missing or invalid ${field}`);
    }
  }
  if (typeof e.event_version !== "number") errors.push("event_version must be number");
  if (!e.source || typeof e.source !== "object") errors.push("source required");
  if (!e.correlation || typeof e.correlation !== "object") errors.push("correlation required");
  if (!e.provenance || typeof e.provenance !== "object") errors.push("provenance required");
  else {
    const kind = (e.provenance as ProvenanceInfo).kind;
    const allowed: ProvenanceKind[] = [
      "OBSERVED",
      "PROVIDER_REPORTED",
      "HARNESS_REPORTED",
      "ESTIMATED",
      "DERIVED",
      "UNAVAILABLE",
      "UNKNOWN",
    ];
    if (!allowed.includes(kind)) errors.push(`invalid provenance.kind: ${kind}`);
  }
  if (!e.privacy || typeof e.privacy !== "object") errors.push("privacy required");
  if (!e.quality || typeof e.quality !== "object") errors.push("quality required");
  if (e.attributes && typeof e.attributes === "object") {
    const serialized = JSON.stringify(e.attributes);
    if (/Bearer\s+[A-Za-z0-9]|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}/i.test(serialized)) {
      errors.push("attributes appear to contain secrets");
    }
  }
  return { ok: errors.length === 0, errors };
}

export function usageMeasurement(
  metric: string,
  value: number | null,
  provenance: ProvenanceKind,
  opts?: Partial<MeasurementValue>,
): MeasurementValue {
  return {
    metric,
    value,
    unit: "tokens",
    provenance,
    final: opts?.final ?? true,
    provider_id: opts?.provider_id,
    model_id: opts?.model_id,
    request_id: opts?.request_id,
    collected_at: opts?.collected_at ?? new Date().toISOString(),
    estimate_method: opts?.estimate_method,
  };
}
