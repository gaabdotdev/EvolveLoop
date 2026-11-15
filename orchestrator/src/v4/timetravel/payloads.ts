/**
 * Typed payloads for M05-owned event types (freeze R2).
 *
 * Catalog: `work.forked`, `replay.started`. F12 names are never CONTROL.
 * Producers allowlist-parse; unknown keys are dropped.
 */

import { isRecord, isValidId, type ValidationIssue } from "../contracts/index.js";

export const M05_EVENT_TYPES = ["work.forked", "replay.started"] as const;
export type M05EventType = (typeof M05_EVENT_TYPES)[number];

export const M05_FORBIDDEN_PAYLOAD_CONTROL_NAMES = [
  "next_action",
  "objective",
  "permissions",
  "credentials",
  "verified_task_state",
  "trust",
  "gate_source_kind",
] as const;

const ALLOWLIST: Record<M05EventType, readonly string[]> = {
  "work.forked": [
    "fork_work_id",
    "forked_from",
    "referenced_artifact_hashes",
    "inherited_effect_ids",
    "grants_inherited",
    "leases_inherited",
    "credentials_inherited",
    "origin_event_seq",
  ],
  "replay.started": [
    "mode",
    "source_effect_id",
    "new_effect_id",
    "auto_reapplied_external",
    "determinism_claim",
    "effect_class",
  ],
};

export interface WorkForkedPayload {
  fork_work_id: string;
  forked_from: { work_id: string; checkpoint_id: string; event_seq: number };
  referenced_artifact_hashes: string[];
  inherited_effect_ids: string[];
  grants_inherited: false;
  leases_inherited: false;
  credentials_inherited: false;
  origin_event_seq: number;
}

export interface ReplayStartedPayload {
  mode: "RECORDED" | "REEXECUTE";
  source_effect_id: string;
  new_effect_id?: string;
  auto_reapplied_external: false;
  determinism_claim: "none";
  effect_class: "INTERNAL" | "EXTERNAL";
}

export function isM05EventType(type: string): type is M05EventType {
  return (M05_EVENT_TYPES as readonly string[]).includes(type);
}

export function allowlistM05Payload(type: M05EventType, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(ALLOWLIST[type]);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (allowed.has(key)) out[key] = payload[key];
  }
  return out;
}

export function assertNoControlFields(payload: Record<string, unknown>): void {
  for (const name of M05_FORBIDDEN_PAYLOAD_CONTROL_NAMES) {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      throw new Error(`M05 payload must not carry CONTROL field "${name}" (TM-V4-F12 / freeze R2)`);
    }
  }
}

export function controlFieldIssues(payload: unknown): ValidationIssue[] {
  if (!isRecord(payload)) return [{ code: "STRUCT", path: "payload", message: "must be an object" }];
  const issues: ValidationIssue[] = [];
  for (const name of M05_FORBIDDEN_PAYLOAD_CONTROL_NAMES) {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      issues.push({
        code: "INV-EVT-M05-R2",
        path: `payload.${name}`,
        message: `M05 payload must not carry F12 control name "${name}"`,
      });
    }
  }
  return issues;
}

export function isValidForkedFrom(value: unknown): value is WorkForkedPayload["forked_from"] {
  if (!isRecord(value)) return false;
  return (
    isValidId("work", value.work_id) &&
    isValidId("checkpoint", value.checkpoint_id) &&
    typeof value.event_seq === "number" &&
    Number.isInteger(value.event_seq) &&
    value.event_seq >= 1
  );
}
