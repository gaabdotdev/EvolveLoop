/**
 * Contract catalog v1 — single registry of V4 contract kinds, versions, producing meta,
 * stability and validator. `assertConforms` is the consumer conformance entrypoint.
 */

import { isRecord, isSemver, type ContractKind, type ValidationResult } from "./common.js";
import type { MetaId } from "./work-event.js";
import { GOAL_CONTRACT_SCHEMA_VERSION, validateGoalContract } from "./goal-contract.js";
import { WORK_SCHEMA_VERSION, validateWork } from "./work.js";
import { TASK_SCHEMA_VERSION, validateTask } from "./task.js";
import { EXECUTION_SCHEMA_VERSION, validateExecution } from "./execution.js";
import { EXECUTOR_SCHEMA_VERSION, validateExecutor } from "./executor.js";
import { EXECUTION_CAPSULE_SCHEMA_VERSION, validateExecutionCapsule } from "./capsule.js";
import { CHECKPOINT_SCHEMA_VERSION, validateCheckpoint } from "./checkpoint.js";
import { EFFECT_RECORD_SCHEMA_VERSION, validateEffectRecord } from "./effect.js";
import { ARTIFACT_SCHEMA_VERSION, validateArtifact } from "./artifact.js";
import { EVIDENCE_SCHEMA_VERSION, validateEvidence } from "./evidence.js";
import { WORK_PROOF_SCHEMA_VERSION, validateWorkProof } from "./work-proof.js";
import { POLICY_SCHEMA_VERSION, POLICY_DECISION_SCHEMA_VERSION, validatePolicy, validatePolicyDecision } from "./policy.js";
import { CAPABILITY_PROFILE_SCHEMA_VERSION, validateCapabilityProfile } from "./capability-profile.js";
import { WORK_EVENT_SCHEMA_VERSION, validateWorkEvent } from "./work-event.js";

/** PROPOSED until orchestrator ACCEPTED + freeze; FROZEN changes require RFC (ADR-V4-0001). */
export type ContractStability = "PROPOSED" | "FROZEN" | "DEPRECATED";

export interface ContractCatalogEntry {
  kind: ContractKind;
  schema_version: string;
  producer: MetaId;
  stability: ContractStability;
  validate: (value: unknown) => ValidationResult;
}

export const CONTRACT_CATALOG_VERSION = "1.0.0";

export const CONTRACT_CATALOG: Readonly<Record<ContractKind, ContractCatalogEntry>> = {
  GoalContract: { kind: "GoalContract", schema_version: GOAL_CONTRACT_SCHEMA_VERSION, producer: "M01", stability: "FROZEN", validate: validateGoalContract },
  Work: { kind: "Work", schema_version: WORK_SCHEMA_VERSION, producer: "M01", stability: "FROZEN", validate: validateWork },
  Task: { kind: "Task", schema_version: TASK_SCHEMA_VERSION, producer: "M01", stability: "FROZEN", validate: validateTask },
  Execution: { kind: "Execution", schema_version: EXECUTION_SCHEMA_VERSION, producer: "M13", stability: "FROZEN", validate: validateExecution },
  Executor: { kind: "Executor", schema_version: EXECUTOR_SCHEMA_VERSION, producer: "M14", stability: "FROZEN", validate: validateExecutor },
  ExecutionCapsule: { kind: "ExecutionCapsule", schema_version: EXECUTION_CAPSULE_SCHEMA_VERSION, producer: "M04", stability: "FROZEN", validate: (v) => validateExecutionCapsule(v) },
  Checkpoint: { kind: "Checkpoint", schema_version: CHECKPOINT_SCHEMA_VERSION, producer: "M02", stability: "FROZEN", validate: validateCheckpoint },
  EffectRecord: { kind: "EffectRecord", schema_version: EFFECT_RECORD_SCHEMA_VERSION, producer: "M03", stability: "FROZEN", validate: validateEffectRecord },
  Artifact: { kind: "Artifact", schema_version: ARTIFACT_SCHEMA_VERSION, producer: "M02", stability: "FROZEN", validate: validateArtifact },
  Evidence: { kind: "Evidence", schema_version: EVIDENCE_SCHEMA_VERSION, producer: "M06", stability: "FROZEN", validate: validateEvidence },
  WorkProof: { kind: "WorkProof", schema_version: WORK_PROOF_SCHEMA_VERSION, producer: "M06", stability: "FROZEN", validate: validateWorkProof },
  Policy: { kind: "Policy", schema_version: POLICY_SCHEMA_VERSION, producer: "M10", stability: "FROZEN", validate: validatePolicy },
  PolicyDecision: { kind: "PolicyDecision", schema_version: POLICY_DECISION_SCHEMA_VERSION, producer: "M10", stability: "FROZEN", validate: validatePolicyDecision },
  CapabilityProfile: { kind: "CapabilityProfile", schema_version: CAPABILITY_PROFILE_SCHEMA_VERSION, producer: "M08", stability: "FROZEN", validate: validateCapabilityProfile },
  WorkEvent: { kind: "WorkEvent", schema_version: WORK_EVENT_SCHEMA_VERSION, producer: "M02", stability: "FROZEN", validate: validateWorkEvent },
};

/**
 * Reader compatibility rule (ADR-V4-0001): same major is readable. Minor versions only add
 * optional fields/enum-free extensions, and V4 readers MUST ignore unknown optional fields.
 */
export function isReadableVersion(objectVersion: string, readerVersion: string): boolean {
  if (!isSemver(objectVersion) || !isSemver(readerVersion)) return false;
  return objectVersion.split(".")[0] === readerVersion.split(".")[0];
}

export interface ConformanceReport extends ValidationResult {
  kind?: ContractKind;
}

/** Validate any V4 contract object by its `kind`, including version compatibility. */
export function assertConforms(value: unknown): ConformanceReport {
  if (!isRecord(value) || typeof value.kind !== "string" || !(value.kind in CONTRACT_CATALOG)) {
    return { valid: false, issues: [{ code: "STRUCT", path: "kind", message: "unknown or missing contract kind" }] };
  }
  const entry = CONTRACT_CATALOG[value.kind as ContractKind];
  const res = entry.validate(value);
  const issues = [...res.issues];
  if (typeof value.schema_version === "string" && !isReadableVersion(value.schema_version, entry.schema_version)) {
    issues.push({ code: "VERSION", path: "schema_version", message: `incompatible major: ${value.schema_version} vs reader ${entry.schema_version}` });
  }
  return { kind: entry.kind, valid: issues.length === 0, issues };
}
