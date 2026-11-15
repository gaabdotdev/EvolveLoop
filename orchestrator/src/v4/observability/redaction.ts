/**
 * TM-V4-F11 wrap: telemetry redaction walks arrays, nested objects, and measurements.
 * Heuristic defense-in-depth only (freeze R10) — a clean scan is not proof of absence.
 * Complements V3 envelope.redactAttributes, which skips arrays and measurements.
 */

import { EVIDENCE_SECRET_CANARY, redactSecrets } from "../../evidence/secret-redaction.js";
import { isRecord, scanForSecrets } from "../contracts/common.js";
import type { MeasurementEvent, MeasurementValue } from "../../telemetry/measurement-plane/types.js";

const WRAP_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{8,}\b/g,
  /\bsk-proj-[A-Za-z0-9_-]{8,}\b/g,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/gi,
];

const SENSITIVE_KEY =
  /(^|_|-)(password|passwd|secret|private_?key|api_?key|access_?token|refresh_?token|bearer|credential|session_?token|client_?secret)($|_|-)/i;

const KEY_ALLOWLIST = new Set(["grant_ref", "grant_id", "secret_ref", "credential_ref", "key_id"]);

export const REDACTED = "[REDACTED_SECRET]";

function redactString(text: string): string {
  let out = redactSecrets(text, { redactSensitivePaths: true, extraCanaries: [EVIDENCE_SECRET_CANARY] });
  for (const re of WRAP_PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

export function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!KEY_ALLOWLIST.has(k) && SENSITIVE_KEY.test(k) && v !== null && v !== undefined && v !== "") {
        out[k] = REDACTED;
        continue;
      }
      out[k] = redactDeep(v);
    }
    return out;
  }
  return value;
}

function redactMeasurementValue(mv: MeasurementValue): MeasurementValue {
  const out: MeasurementValue = { ...mv };
  if (typeof out.estimate_method === "string") out.estimate_method = redactString(out.estimate_method);
  if (typeof out.provider_id === "string") out.provider_id = redactString(out.provider_id);
  if (typeof out.model_id === "string") out.model_id = redactString(out.model_id);
  if (typeof out.request_id === "string") out.request_id = redactString(out.request_id);
  return out;
}

export function redactMeasurementEvent(event: MeasurementEvent): MeasurementEvent {
  const attributes = redactDeep(event.attributes) as Record<string, unknown>;
  const measurements: MeasurementEvent["measurements"] = {};
  for (const [k, v] of Object.entries(event.measurements ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && "metric" in (v as object)) {
      measurements[k] = redactMeasurementValue(v as MeasurementValue);
    } else if (typeof v === "string") {
      measurements[k] = redactString(v);
    } else if (Array.isArray(v)) {
      // Arrays are not a MeasurementValue; do not persist them as unlabeled facts.
      measurements[k] = {
        metric: k,
        value: null,
        unit: "UNAVAILABLE",
        provenance: "UNAVAILABLE",
      };
    } else {
      measurements[k] = v;
    }
  }
  return {
    ...event,
    attributes,
    measurements,
    privacy: {
      ...event.privacy,
      redacted: true,
    },
  };
}

/** Residual leak detector used by tests (canary + V4 scanForSecrets). Not a completeness proof. */
export function findSecretFindings(value: unknown): { path: string; reason: string }[] {
  return scanForSecrets(value).map((f) => ({ path: f.path, reason: f.reason }));
}
