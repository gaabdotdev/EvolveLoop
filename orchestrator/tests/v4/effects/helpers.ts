import {
  DEFAULT_TENANT_ID,
  type EffectRecord,
  type Evidence,
  type IsoTimestamp,
} from "../../../src/v4/contracts/index.js";
import { EffectLedger } from "../../../src/v4/effects/index.js";
import { SHA, NOW } from "../contracts/fixtures.js";

export const CP_EXECUTOR = { executor_id: "executor_controlplane", executor_version: "1.0.0" } as const;
export const WORKER = { executor_id: "executor_worker01", executor_version: "1.0.0" } as const;

export function passFence() {
  return async () => ({
    work_id: "work_abc123def",
    fencing_epoch: 1,
    lease_id: "lease-test-1",
    assertFresh: () => undefined,
  });
}

export function planInput(overrides: Partial<EffectRecord> = {}): Omit<
  EffectRecord,
  "state" | "evidence_ids" | "reconciliation" | "created_at" | "updated_at"
> {
  return {
    kind: "EffectRecord",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    effect_id: "eff_abc123def",
    work_id: "work_abc123def",
    task_id: "task_abc123def",
    execution_id: "exec_abc123def",
    executor_ref: WORKER,
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
    idempotency_key: "git-push:origin/main:1",
    fork_inherited: false,
    ...overrides,
  };
}

export function cpEvidence(effect_id: string, evidence_id: string, extra: Partial<Evidence> = {}): Evidence {
  return {
    kind: "Evidence",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    evidence_id,
    work_id: "work_abc123def",
    subject: { kind: "EFFECT", ref: effect_id },
    evidence_kind: "target_status",
    method: { kind: "AUTOMATED_TEST", description: "queried git remote for object" },
    result: "PASS",
    produced_by: CP_EXECUTOR,
    subject_executor_ref: WORKER,
    tested_artifacts: [{ sha256: SHA }],
    environment: { runtime: "node" },
    provenance: "OBSERVED",
    observed_at: NOW,
    limitations: ["does not prove future mutations of the remote"],
    ...extra,
  };
}

export function executorLie(effect_id: string, evidence_id: string, extra: Partial<Evidence> = {}): Evidence {
  return {
    ...cpEvidence(effect_id, evidence_id),
    produced_by: WORKER,
    method: { kind: "SELF_REPORTED", description: "executor claims outcome" },
    provenance: "SELF_REPORTED",
    ...extra,
  };
}

export async function plannedAuthorizedDispatched(
  ledger: EffectLedger,
  overrides: Partial<EffectRecord> = {},
): Promise<EffectRecord> {
  const planned = await ledger.plan(planInput(overrides));
  await ledger.authorize(planned.effect_id, planned.authorization!, { expected_state: "PLANNED" });
  return ledger.beginDispatch(planned.effect_id);
}

export function frozenClock(at: IsoTimestamp = NOW): () => IsoTimestamp {
  return () => at;
}
