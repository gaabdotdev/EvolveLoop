/**
 * Typed payloads for M02-owned event types (freeze reservation R2).
 *
 * WorkEvent.payload remains untyped at the frozen 1.0.0 contract. M02 must
 * still type *its* producers: `artifact.registered` and `checkpoint.created`.
 * F12 control names (`next_action`, `objective`, `permissions`, …) are DATA
 * at best and never become CONTROL. Experimental `x.mNN.*` events are stored
 * but MUST NOT mutate projections.
 */

import {
  isRecord,
  isSha256,
  isValidId,
  type Sha256Hex,
  type ValidationIssue,
  type ValidationResult,
  result,
} from "../contracts/common.js";
import type { CheckpointConsistency } from "../contracts/checkpoint.js";
import { FORBIDDEN_CAPSULE_AUTHORITY_FIELDS } from "../contracts/field-class.js";

export const M02_EVENT_TYPES = ["artifact.registered", "checkpoint.created"] as const;
export type M02EventType = (typeof M02_EVENT_TYPES)[number];

/** Executor/control field names that M02 payloads must not carry as authority (R2 / F12). */
export const M02_FORBIDDEN_PAYLOAD_CONTROL_NAMES = [
  ...FORBIDDEN_CAPSULE_AUTHORITY_FIELDS,
] as const;

export interface ArtifactRegisteredPayload {
  artifact_id: string;
  content: { sha256: Sha256Hex; size_bytes: number; media_type: string };
}

export interface CheckpointCreatedPayload {
  checkpoint_id: string;
  event_seq: number;
  state_digest: Sha256Hex;
  consistency: CheckpointConsistency;
}

export function isM02EventType(type: string): type is M02EventType {
  return (M02_EVENT_TYPES as readonly string[]).includes(type);
}

export function isExperimentalEventType(type: string): boolean {
  return /^x\.m\d{2}\.[a-z0-9_.]+$/.test(type);
}

export function experimentalMutatesProjection(type: string): false {
  void type;
  return false;
}

function rejectControlNames(payload: Record<string, unknown>, issues: ValidationIssue[]): void {
  for (const name of M02_FORBIDDEN_PAYLOAD_CONTROL_NAMES) {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      issues.push({
        code: "INV-EVT-M02-R2",
        path: `payload.${name}`,
        message: `M02 payload must not carry F12 control name "${name}" (reservation R2; not CONTROL)`,
      });
    }
  }
}

export function validateArtifactRegisteredPayload(payload: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(payload)) return result([{ code: "STRUCT", path: "payload", message: "must be an object" }]);
  rejectControlNames(payload, issues);
  if (!isValidId("artifact", payload.artifact_id)) {
    issues.push({ code: "STRUCT", path: "payload.artifact_id", message: "must be an artifact id" });
  }
  if (!isRecord(payload.content)) {
    issues.push({ code: "STRUCT", path: "payload.content", message: "must be an object" });
  } else {
    if (!isSha256(payload.content.sha256)) {
      issues.push({ code: "INV-ART-01", path: "payload.content.sha256", message: "must be sha256" });
    }
    if (typeof payload.content.size_bytes !== "number" || !Number.isInteger(payload.content.size_bytes) || payload.content.size_bytes < 0) {
      issues.push({ code: "STRUCT", path: "payload.content.size_bytes", message: "must be integer >= 0" });
    }
    if (typeof payload.content.media_type !== "string" || payload.content.media_type.length === 0) {
      issues.push({ code: "STRUCT", path: "payload.content.media_type", message: "must be a non-empty string" });
    }
  }
  return result(issues);
}

export function validateCheckpointCreatedPayload(payload: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(payload)) return result([{ code: "STRUCT", path: "payload", message: "must be an object" }]);
  rejectControlNames(payload, issues);
  if (!isValidId("checkpoint", payload.checkpoint_id)) {
    issues.push({ code: "STRUCT", path: "payload.checkpoint_id", message: "must be a checkpoint id" });
  }
  if (typeof payload.event_seq !== "number" || !Number.isInteger(payload.event_seq) || payload.event_seq < 1) {
    issues.push({ code: "STRUCT", path: "payload.event_seq", message: "must be integer >= 1" });
  }
  if (!isSha256(payload.state_digest)) {
    issues.push({ code: "INV-CKPT-05", path: "payload.state_digest", message: "must be sha256" });
  }
  if (payload.consistency !== "VERIFIED" && payload.consistency !== "UNVERIFIED" && payload.consistency !== "INCONSISTENT") {
    issues.push({ code: "STRUCT", path: "payload.consistency", message: "must be a CheckpointConsistency" });
  }
  return result(issues);
}

export function validateM02Payload(type: string, payload: unknown): ValidationResult | undefined {
  if (type === "artifact.registered") return validateArtifactRegisteredPayload(payload);
  if (type === "checkpoint.created") return validateCheckpointCreatedPayload(payload);
  return undefined;
}
