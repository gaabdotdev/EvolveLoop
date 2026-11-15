/**
 * Data vs control typing (ADR-V4-0017; TM-V4-F09, TM-V4-F12).
 *
 * CONTROL fields originate from the Control Plane / Goal Contract / Policy and may
 * affect scope or authority. DATA fields are quoted observations. UNTRUSTED_DATA is
 * executor- or content-authored text that MUST be treated as untrusted input and MUST
 * never be copied into objectives, policy, or Work State.
 *
 * Trust of evidence/events is derived from the authenticated channel that delivered
 * them (ADR-V4-0016), never from a field inside the payload (INV-EVD-04, INV-EVT-05).
 */

import type { Checker } from "./common.js";

export type FieldClass = "CONTROL" | "DATA" | "UNTRUSTED_DATA";

/**
 * Capsule field classes. CONTROL is re-derived or platform-authored at seal time.
 * UNTRUSTED_DATA must be rendered/quoted as data by M04/M15 and cannot alter authority.
 */
export const CAPSULE_FIELD_CLASS = {
  kind: "CONTROL",
  schema_version: "CONTROL",
  tenant_id: "CONTROL",
  capsule_id: "CONTROL",
  capsule_format_version: "CONTROL",
  authority_model: "CONTROL",
  work_id: "CONTROL",
  source_execution_id: "CONTROL",
  goal_contract_ref: "CONTROL",
  base_checkpoint: "CONTROL",
  task_refs: "DATA",
  "decisions.decision_ref": "CONTROL",
  "decisions.summary": "UNTRUSTED_DATA",
  artifacts: "DATA",
  open_effects: "DATA",
  pending_items: "UNTRUSTED_DATA",
  constraints: "CONTROL",
  delegable_grants: "CONTROL",
  not_preserved: "CONTROL",
  compatibility: "CONTROL",
  created_at: "CONTROL",
  created_by: "CONTROL",
  integrity: "CONTROL",
} as const satisfies Record<string, FieldClass>;

/** Payload field names that would let a producer self-label trust (TM-V4-F09). Forbidden on Evidence and WorkEvent. */
export const FORBIDDEN_SELF_TRUST_FIELDS = [
  "trust",
  "trust_level",
  "gate_source_kind",
  "controlled_fixture",
  "trusted_fixture",
] as const;

/** V3 handoff fields that must never reappear on a V4 capsule (TM-V4-F01, TM-V4-F12). */
export const FORBIDDEN_CAPSULE_AUTHORITY_FIELDS = [
  "permissions",
  "verified_task_state",
  "next_action",
  "objective",
  "grant_material",
  "credentials",
  "token",
  "api_key",
] as const;

export function rejectForbiddenFields(
  c: Checker,
  fields: readonly string[],
  code: string,
  message: (field: string) => string,
): void {
  for (const field of fields) {
    if (c.has(field)) c.fail(code, field, message(field));
  }
}

export function fieldClassOf(table: Readonly<Record<string, FieldClass>>, path: string): FieldClass {
  if (path in table) return table[path];
  return "DATA";
}
