import { createHash } from "node:crypto";
import {
  DEFAULT_TENANT_ID,
  EFFECT_RECORD_SCHEMA_VERSION,
  type Artifact,
  type EffectRecord,
  type Execution,
  type GoalContract,
  type Task,
  type Work,
} from "../../../src/v4/contracts/index.js";
import {
  TEST_REPORT_MEDIA_TYPE,
  encodeTestReport,
  type DeterministicTestReport,
} from "../../../src/v4/proof/index.js";

export const NOW = "2026-11-15T12:00:00.000Z";
export const WORKER_ID = "executor_worker01";
export const VERIFIER_ID = "executor_v4detmin1";
export const WORK_ID = "work_abc123def";
export const GOAL_ID = "goal_abc123def";
export const TASK_ID = "task_abc123def";
export const EXEC_ID = "exec_abc123def";
export const ART_ID = "art_abc123def";
export const REPORT_ART_ID = "art_testreport1";
export const EFFECT_ID = "eff_abc123def";

export function shaOf(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export const CODE_SHA = shaOf("evolveloop-v4-m06-code-artifact");

export function validGoal(overrides: Partial<GoalContract> = {}): GoalContract {
  return {
    kind: "GoalContract",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    goal_contract_id: GOAL_ID,
    version: 1,
    work_id: WORK_ID,
    status: "ACCEPTED",
    objective: "ship the feature with tests",
    scope: ["src"],
    out_of_scope: ["prod deploy"],
    constraints: [],
    acceptance_criteria: [
      {
        criterion_id: "crit_tests",
        statement: "unit tests pass",
        mandatory: true,
        origin: "USER_STATED",
        verification_methods: ["AUTOMATED_TEST"],
        evidence_required: ["unit_test"],
      },
    ],
    assumptions: [],
    ambiguities: [],
    risks: [],
    dependencies: [],
    execution: { autonomy: "L1_EXECUTE", verification: "INDEPENDENT", recovery_enabled: true },
    stop_conditions: ["budget exceeded"],
    created_at: NOW,
    created_by: { kind: "HUMAN", id: "operator" },
    ...overrides,
  };
}

export function goalWithIntegrity(): GoalContract {
  const base = validGoal();
  return {
    ...base,
    acceptance_criteria: [
      ...base.acceptance_criteria,
      {
        criterion_id: "crit_integrity",
        statement: "artifacts are hash-verified",
        mandatory: true,
        origin: "USER_STATED",
        verification_methods: ["DETERMINISTIC_RULE"],
        evidence_required: ["artifact_integrity"],
      },
    ],
  };
}

export function validWork(overrides: Partial<Work> = {}): Work {
  return {
    kind: "Work",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    work_id: WORK_ID,
    owner: "platform",
    goal_contract_ref: { id: GOAL_ID, version: 1 },
    state: "VERIFYING",
    last_event_seq: 1,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function validTask(overrides: Partial<Task> = {}): Task {
  return {
    kind: "Task",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    task_id: TASK_ID,
    work_id: WORK_ID,
    goal_contract_ref: { id: GOAL_ID, version: 1 },
    title: "implement feature",
    task_kind: "IMPLEMENT",
    state: "SUCCEEDED_UNVERIFIED",
    progress_status: "UNVERIFIED",
    depends_on: [],
    criterion_refs: ["crit_tests"],
    expected_result: "tests pass",
    execution_ids: [EXEC_ID],
    evidence_ids: [],
    plan_version: 1,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function validExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    kind: "Execution",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    execution_id: EXEC_ID,
    work_id: WORK_ID,
    task_id: TASK_ID,
    attempt: 1,
    executor_ref: { executor_id: WORKER_ID, executor_version: "1.0.0" },
    state: "SUCCEEDED",
    environment: { runtime: "node" },
    cost: { amount: 0, currency: "USD", provenance: "OBSERVED" },
    result_claim: { claimed_status: "DONE", summary: "all good (self-claim)" },
    started_at: NOW,
    ended_at: NOW,
    ...overrides,
  };
}

export function validArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    kind: "Artifact",
    schema_version: "1.0.0",
    tenant_id: DEFAULT_TENANT_ID,
    artifact_id: ART_ID,
    work_id: WORK_ID,
    content: { sha256: CODE_SHA, size_bytes: 32, media_type: "text/plain" },
    origin: {
      task_id: TASK_ID,
      execution_id: EXEC_ID,
      executor_ref: { executor_id: WORKER_ID, executor_version: "1.0.0" },
    },
    access: { classification: "INTERNAL", project_ids: ["local"] },
    retention: { policy: "WORK_LIFETIME" },
    integrity_status: "VERIFIED",
    created_at: NOW,
    ...overrides,
  };
}

export function passingReport(criterion_id = "crit_tests"): DeterministicTestReport {
  return {
    kind: "DeterministicTestReport",
    schema_version: "1.0.0",
    criterion_id,
    evidence_kind: "unit_test",
    tests: [
      { name: "adds numbers", passed: true },
      { name: "handles empty", passed: true },
    ],
    tested_artifact_sha256: [CODE_SHA],
  };
}

export function failingReport(): DeterministicTestReport {
  return {
    ...passingReport(),
    tests: [{ name: "adds numbers", passed: false }],
  };
}

export function reportArtifact(report: DeterministicTestReport, artifact_id = REPORT_ART_ID): { artifact: Artifact; bytes: Uint8Array } {
  const bytes = encodeTestReport(report);
  const sha256 = shaOf(bytes);
  return {
    bytes,
    artifact: validArtifact({
      artifact_id,
      content: { sha256, size_bytes: bytes.byteLength, media_type: TEST_REPORT_MEDIA_TYPE },
    }),
  };
}

export function committedEffect(overrides: Partial<EffectRecord> = {}): EffectRecord {
  return {
    kind: "EffectRecord",
    schema_version: EFFECT_RECORD_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    effect_id: EFFECT_ID,
    work_id: WORK_ID,
    task_id: TASK_ID,
    execution_id: EXEC_ID,
    executor_ref: { executor_id: WORKER_ID, executor_version: "1.0.0" },
    effect_class: "INTERNAL",
    intent: {
      action: "write.file",
      target_resource: "workspace",
      parameters_digest: CODE_SHA,
      description: "write source",
    },
    integration: {
      integration_id: "workspace",
      capabilities: { supports_idempotency_key: true, supports_status_query: true, supports_compensation: false },
    },
    authorization: { policy_decision_id: "pdec_abc123def" },
    state: "COMMITTED",
    evidence_ids: ["evd_abc123def"],
    reconciliation: [],
    fork_inherited: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}
