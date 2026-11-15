/**
 * M00 test fixtures — valid contract objects used by schema and conformance tests.
 * Not product engines. Schema versions must match CONTRACT_CATALOG.
 */

import { createHash } from "node:crypto";
import {
  type EffectRecord,
  type ExecutionCapsule,
  type WorkEvent,
  computeCapsuleDigest,
  computeEventDigest,
  computePayloadDigest,
  CAPSULE_AUTHORITY_MODEL,
  DEFAULT_TENANT_ID,
} from "../../../src/v4/contracts/index.js";

export const SHA = createHash("sha256").update("evolveloop-v4-m00-fixture").digest("hex");
export const NOW = "2026-11-15T12:00:00.000Z";

export function capsuleBody(): Omit<ExecutionCapsule, "integrity"> {
  return {
    kind: "ExecutionCapsule",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    capsule_id: "capsule_abc123def",
    capsule_format_version: "1.0.0",
    authority_model: CAPSULE_AUTHORITY_MODEL,
    work_id: "work_abc123def",
    goal_contract_ref: { id: "goal_abc123def", version: 1 },
    base_checkpoint: { checkpoint_id: "ckpt_abc123def", event_seq: 1, state_digest: SHA },
    task_refs: [{ task_id: "task_abc123def", state: "RUNNING" }],
    decisions: [{ decision_ref: "pdec_abc123def", summary: "quoted executor note" }],
    artifacts: [{ sha256: SHA }],
    open_effects: [{ effect_id: "eff_abc123def", state: "DISPATCHED" }],
    pending_items: ["finish review"],
    constraints: ["no prod deploy"],
    delegable_grants: [{ grant_ref: "grant_tmp_1", scope: ["git.read"], expires_at: "2026-11-15T13:00:00.000Z" }],
    not_preserved: ["model conversation memory"],
    compatibility: { min_conformance_level: "C2_CONTINUITY", required_capabilities: [] },
    created_at: NOW,
    created_by: { kind: "PLATFORM", id: "control-plane" },
  };
}

export function validCapsule(extra: Record<string, unknown> = {}): ExecutionCapsule {
  const body = { ...capsuleBody(), ...extra } as Omit<ExecutionCapsule, "integrity">;
  return {
    ...body,
    integrity: {
      canonicalization: "evolveloop-canonical-json-v1",
      manifest_sha256: computeCapsuleDigest(body),
    },
  };
}

export function validEvent(overrides: Partial<WorkEvent> = {}): WorkEvent {
  const { payload: payloadOverride, event_digest: _ignored, ...rest } = overrides;
  void _ignored;
  const payload = payloadOverride ?? { note: "created" };
  const draft: Omit<WorkEvent, "event_digest"> = {
    kind: "WorkEvent",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    event_id: "evt_abc123def",
    work_id: "work_abc123def",
    seq: 1,
    type: "work.created",
    type_version: 1,
    occurred_at: NOW,
    recorded_at: NOW,
    actor: { kind: "PLATFORM", id: "control-plane" },
    correlation_id: "corr_1",
    prev_event_digest: "GENESIS",
    ...rest,
    payload,
    payload_digest: computePayloadDigest(payload),
  };
  return { ...draft, event_digest: computeEventDigest(draft) };
}

export const validWork = {
  kind: "Work",
  schema_version: "1.0.0",
  tenant_id: DEFAULT_TENANT_ID,
  work_id: "work_abc123def",
  owner: "platform",
  goal_contract_ref: { id: "goal_abc123def", version: 1 },
  state: "RUNNING",
  last_event_seq: 1,
  created_at: NOW,
  updated_at: NOW,
} as const;

export const validEvidence = {
  kind: "Evidence",
  schema_version: "1.0.0",
  tenant_id: DEFAULT_TENANT_ID,
  evidence_id: "evd_abc123def",
  work_id: "work_abc123def",
  subject: { kind: "CRITERION" as const, ref: "crit_1" },
  criterion_ref: { goal_contract_id: "goal_abc123def", goal_contract_version: 1, criterion_id: "crit_1" },
  evidence_kind: "unit_test",
  method: { kind: "AUTOMATED_TEST" as const, description: "vitest run" },
  result: "PASS" as const,
  produced_by: { executor_id: "executor_verifier1", executor_version: "1.0.0" },
  subject_executor_ref: { executor_id: "executor_worker01", executor_version: "1.0.0" },
  tested_artifacts: [{ sha256: SHA }],
  environment: { runtime: "node" },
  provenance: "OBSERVED" as const,
  observed_at: NOW,
  limitations: ["does not prove production behaviour"],
};

export function validEffect(overrides: Partial<EffectRecord> = {}): EffectRecord {
  return {
    kind: "EffectRecord",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    effect_id: "eff_abc123def",
    work_id: "work_abc123def",
    task_id: "task_abc123def",
    execution_id: "exec_abc123def",
    executor_ref: { executor_id: "executor_worker01", executor_version: "1.0.0" },
    effect_class: "EXTERNAL",
    intent: {
      action: "git.push",
      target_resource: "origin/main",
      parameters_digest: SHA,
      description: "push branch",
    },
    integration: {
      integration_id: "git",
      capabilities: { supports_idempotency_key: true, supports_status_query: true, supports_compensation: false },
    },
    authorization: { policy_decision_id: "pdec_abc123def" },
    state: "DISPATCHED",
    evidence_ids: [],
    reconciliation: [],
    fork_inherited: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}
