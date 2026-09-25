/**
 * Hand validators for V3 first-wave contracts (no Zod in deps).
 */

import {
  V3_API_VERSION,
  V3_SCHEMA_VERSION,
  fail,
  isObject,
  mergeResults,
  ok,
  requireArray,
  requireEnum,
  requireObject,
  requireString,
  type V3ValidationResult,
} from "./common.js";
import {
  assertAutonomyGovernorDecisionConstraints,
  assertEffectsAllowedAtDepth,
  assertInstructionHierarchyConstraints,
} from "./enforcement.js";
import {
  BELIEF_STATUSES,
  CAPABILITY_LIFECYCLE_STATES,
  EFFECT_CLASSIFICATIONS,
  EVOLUTION_BLAST_RADII,
  GOAL_LIFECYCLE_STATES,
  GOVERNOR_LEVELS,
  IDEMPOTENCY_CLASSES,
  INSTRUCTION_HIERARCHY_LEVELS,
  MEMORY_TRUST_CLASSES,
  ORACLE_CRITERION_STATUSES,
  ORACLE_CRITERION_TYPES,
  SAFETY_STATES,
  SANDBOX_DEPTHS,
  SATISFACTION_DECISIONS,
  type AutonomyGovernorDecision,
  type Belief,
  type CapabilityLifecycleRecord,
  type CheckpointSchemaV3,
  type DelegationContractStub,
  type DemoManifest,
  type EffectClassification,
  type EffectIdempotencyDeclaration,
  type EvidenceLineage,
  type EvidencePackageManifest,
  type EvolutionCandidateStub,
  type GoalContract,
  type GoalSatisfactionProof,
  type GoalVersion,
  type InstructionHierarchyBinding,
  type MemoryTrustAnnotation,
  type Observation,
  type SafetySandboxContext,
  type SuccessOracleCriterion,
} from "./types.js";

function requireApiKind(
  value: Record<string, unknown>,
  kind: string,
  errors: string[],
): void {
  if (value.apiVersion !== V3_API_VERSION) {
    errors.push(`apiVersion must be ${V3_API_VERSION}`);
  }
  if (value.kind !== kind) {
    errors.push(`kind must be ${kind}`);
  }
}

function requireSchemaVersionMeta(
  metadata: Record<string, unknown>,
  errors: string[],
  extraRequired: string[] = [],
): void {
  if (metadata.schema_version !== V3_SCHEMA_VERSION) {
    errors.push(`metadata.schema_version must be ${V3_SCHEMA_VERSION}`);
  }
  for (const key of extraRequired) {
    if (typeof metadata[key] !== "string" || !(metadata[key] as string).length) {
      errors.push(`metadata.${key} must be a non-empty string`);
    }
  }
}

function requireConfidence(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    errors.push(`${field} must be a number in [0, 1]`);
  }
}

function validateGoalVersion(value: unknown, field: string): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(value, field, errors)) return fail(...errors);
  for (const key of ["major", "minor", "patch", "revision"] as const) {
    if (typeof value[key] !== "number" || !Number.isInteger(value[key]) || (value[key] as number) < 0) {
      errors.push(`${field}.${key} must be a non-negative integer`);
    }
  }
  return errors.length ? fail(...errors) : ok();
}

export function validateGoalContract(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "GoalContract", errors)) return fail(...errors);
  requireApiKind(input, "GoalContract", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireString(input.metadata.id, "metadata.id", errors);
  if (input.metadata.schema_version !== V3_SCHEMA_VERSION) {
    errors.push(`metadata.schema_version must be ${V3_SCHEMA_VERSION}`);
  }
  if (
    input.metadata.parent_goal_id !== undefined &&
    (typeof input.metadata.parent_goal_id !== "string" ||
      input.metadata.parent_goal_id.length === 0)
  ) {
    errors.push("metadata.parent_goal_id must be a non-empty string when present");
  }
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.desired_outcome, "spec.desired_outcome", errors);
  requireArray(spec.constraints, "spec.constraints", errors);
  requireArray(spec.non_goals, "spec.non_goals", errors);
  requireArray(spec.success_criteria_refs, "spec.success_criteria_refs", errors);
  requireEnum(spec.lifecycle_state, "spec.lifecycle_state", GOAL_LIFECYCLE_STATES, errors);
  const gv = validateGoalVersion(spec.goal_version, "spec.goal_version");
  return mergeResults({ valid: errors.length === 0, errors }, gv);
}

export function isGoalContract(input: unknown): input is GoalContract {
  return validateGoalContract(input).valid;
}

export function validateSuccessOracleCriterion(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "SuccessOracleCriterion", errors)) return fail(...errors);
  requireApiKind(input, "SuccessOracleCriterion", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.criterion_id, "spec.criterion_id", errors);
  requireEnum(spec.type, "spec.type", ORACLE_CRITERION_TYPES, errors);
  if (typeof spec.required !== "boolean") errors.push("spec.required must be boolean");
  requireString(spec.measurement, "spec.measurement", errors);
  requireString(spec.threshold, "spec.threshold", errors);
  requireString(spec.evidence_source, "spec.evidence_source", errors);
  requireString(spec.verification_method, "spec.verification_method", errors);
  requireEnum(spec.status, "spec.status", ORACLE_CRITERION_STATUSES, errors);
  return errors.length ? fail(...errors) : ok();
}

export function isSuccessOracleCriterion(input: unknown): input is SuccessOracleCriterion {
  return validateSuccessOracleCriterion(input).valid;
}

export function validateGoalSatisfactionProof(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "GoalSatisfactionProof", errors)) return fail(...errors);
  requireApiKind(input, "GoalSatisfactionProof", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors, ["goal_id"]);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.requested_outcome, "spec.requested_outcome", errors);
  requireArray(spec.observed_changes, "spec.observed_changes", errors);
  requireString(spec.observation_summary, "spec.observation_summary", errors);
  requireArray(spec.criterion_evidence, "spec.criterion_evidence", errors);
  requireArray(spec.uncertain_criteria, "spec.uncertain_criteria", errors);
  requireArray(spec.assumptions, "spec.assumptions", errors);
  requireEnum(spec.decision, "spec.decision", SATISFACTION_DECISIONS, errors);
  if (Array.isArray(spec.criterion_evidence)) {
    for (let i = 0; i < spec.criterion_evidence.length; i++) {
      const row: unknown = spec.criterion_evidence[i];
      if (!isObject(row)) {
        errors.push(`spec.criterion_evidence[${i}] must be object`);
        continue;
      }
      requireString(row.criterion_id, `spec.criterion_evidence[${i}].criterion_id`, errors);
      requireString(row.evidence_ref, `spec.criterion_evidence[${i}].evidence_ref`, errors);
      requireEnum(row.status, `spec.criterion_evidence[${i}].status`, ORACLE_CRITERION_STATUSES, errors);
    }
  }
  return errors.length ? fail(...errors) : ok();
}

export function isGoalSatisfactionProof(input: unknown): input is GoalSatisfactionProof {
  return validateGoalSatisfactionProof(input).valid;
}

export function validateAutonomyGovernorDecision(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "AutonomyGovernorDecision", errors)) return fail(...errors);
  requireApiKind(input, "AutonomyGovernorDecision", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors, ["decision_id"]);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireEnum(spec.level, "spec.level", GOVERNOR_LEVELS, errors);
  requireString(spec.rationale, "spec.rationale", errors);
  requireString(spec.decided_at, "spec.decided_at", errors);
  if (
    spec.policy_ref !== undefined &&
    (typeof spec.policy_ref !== "string" || spec.policy_ref.length === 0)
  ) {
    errors.push("spec.policy_ref must be a non-empty string when present");
  }
  if (!requireObject(spec.inputs, "spec.inputs", errors)) return fail(...errors);
  const inputs = spec.inputs;
  requireEnum(inputs.risk, "spec.inputs.risk", ["low", "medium", "high", "critical"] as const, errors);
  requireEnum(
    inputs.reversibility,
    "spec.inputs.reversibility",
    ["reversible", "conditionally_reversible", "irreversible"] as const,
    errors,
  );
  requireString(inputs.authority, "spec.inputs.authority", errors);
  requireConfidence(inputs.confidence, "spec.inputs.confidence", errors);
  requireEnum(inputs.impact, "spec.inputs.impact", ["local", "subsystem", "external", "global"] as const, errors);
  requireEnum(inputs.cost, "spec.inputs.cost", ["low", "medium", "high"] as const, errors);
  requireString(inputs.environment, "spec.inputs.environment", errors);
  requireEnum(inputs.safety_state, "spec.inputs.safety_state", SAFETY_STATES, errors);

  if (errors.length) return fail(...errors);

  // FW-H01: typed decision matrix + policy_ref when level ≠ BLOCK
  const matrix = assertAutonomyGovernorDecisionConstraints({
    spec: {
      inputs: inputs as AutonomyGovernorDecision["spec"]["inputs"],
      level: spec.level as AutonomyGovernorDecision["spec"]["level"],
      rationale: String(spec.rationale),
      decided_at: String(spec.decided_at),
      policy_ref: typeof spec.policy_ref === "string" ? spec.policy_ref : undefined,
    },
  });
  return mergeResults({ valid: true, errors: [] }, matrix);
}

export function isAutonomyGovernorDecision(input: unknown): input is AutonomyGovernorDecision {
  return validateAutonomyGovernorDecision(input).valid;
}

export function validateEvidenceLineage(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "EvidenceLineage", errors)) return fail(...errors);
  requireApiKind(input, "EvidenceLineage", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.evidence_ref, "spec.evidence_ref", errors);
  if (spec.evidence_api_version !== "capability-orchestrator.io/v2") {
    errors.push('spec.evidence_api_version must be "capability-orchestrator.io/v2"');
  }
  requireObject(spec.backward, "spec.backward", errors);
  requireObject(spec.forward, "spec.forward", errors);
  return errors.length ? fail(...errors) : ok();
}

export function isEvidenceLineage(input: unknown): input is EvidenceLineage {
  return validateEvidenceLineage(input).valid;
}

export function validateCapabilityLifecycleRecord(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "CapabilityLifecycleRecord", errors)) return fail(...errors);
  requireApiKind(input, "CapabilityLifecycleRecord", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.capability_id, "spec.capability_id", errors);
  requireString(spec.capability_version, "spec.capability_version", errors);
  requireEnum(spec.state, "spec.state", CAPABILITY_LIFECYCLE_STATES, errors);
  requireString(spec.updated_at, "spec.updated_at", errors);
  return errors.length ? fail(...errors) : ok();
}

export function isCapabilityLifecycleRecord(input: unknown): input is CapabilityLifecycleRecord {
  return validateCapabilityLifecycleRecord(input).valid;
}

export function validateEffectIdempotencyDeclaration(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "EffectIdempotencyDeclaration", errors)) return fail(...errors);
  requireApiKind(input, "EffectIdempotencyDeclaration", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.capability_id, "spec.capability_id", errors);
  requireEnum(spec.idempotency, "spec.idempotency", IDEMPOTENCY_CLASSES, errors);
  if (!requireArray(spec.effects, "spec.effects", errors)) return fail(...errors);
  for (let i = 0; i < spec.effects.length; i++) {
    requireEnum(spec.effects[i], `spec.effects[${i}]`, EFFECT_CLASSIFICATIONS, errors);
  }
  return errors.length ? fail(...errors) : ok();
}

export function isEffectIdempotencyDeclaration(input: unknown): input is EffectIdempotencyDeclaration {
  return validateEffectIdempotencyDeclaration(input).valid;
}

export function validateCheckpointSchemaV3(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "CheckpointSchemaV3", errors)) return fail(...errors);
  requireApiKind(input, "CheckpointSchemaV3", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors, ["checkpoint_id", "saved_at"]);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.goal_state_ref, "spec.goal_state_ref", errors);
  requireArray(spec.active_belief_refs, "spec.active_belief_refs", errors);
  requireArray(spec.memory_refs, "spec.memory_refs", errors);
  // Explicit invariant: never claim v2 EngineCheckpoint apiVersion here.
  if (input.apiVersion === "capability-orchestrator.io/v2") {
    errors.push("CheckpointSchemaV3 must not use capability-orchestrator.io/v2 apiVersion");
  }
  return errors.length ? fail(...errors) : ok();
}

export function isCheckpointSchemaV3(input: unknown): input is CheckpointSchemaV3 {
  return validateCheckpointSchemaV3(input).valid;
}

export function validateSafetySandboxContext(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "SafetySandboxContext", errors)) return fail(...errors);
  requireApiKind(input, "SafetySandboxContext", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireEnum(spec.safety_state, "spec.safety_state", SAFETY_STATES, errors);
  requireEnum(spec.sandbox_depth, "spec.sandbox_depth", SANDBOX_DEPTHS, errors);
  requireString(spec.updated_at, "spec.updated_at", errors);

  const effectClasses: EffectClassification[] = [];
  if (spec.effect_classes !== undefined) {
    if (!requireArray(spec.effect_classes, "spec.effect_classes", errors)) {
      return fail(...errors);
    }
    for (let i = 0; i < spec.effect_classes.length; i++) {
      if (
        requireEnum(
          spec.effect_classes[i],
          `spec.effect_classes[${i}]`,
          EFFECT_CLASSIFICATIONS,
          errors,
        )
      ) {
        effectClasses.push(spec.effect_classes[i] as EffectClassification);
      }
    }
  }

  if (errors.length) return fail(...errors);

  // FW-H02: when effect_classes present, enforce min_depth (rejects DESTRUCTIVE@S0)
  if (effectClasses.length > 0) {
    const depthCheck = assertEffectsAllowedAtDepth(
      effectClasses,
      spec.sandbox_depth as SafetySandboxContext["spec"]["sandbox_depth"],
    );
    return mergeResults({ valid: true, errors: [] }, depthCheck);
  }
  return ok();
}

export function isSafetySandboxContext(input: unknown): input is SafetySandboxContext {
  return validateSafetySandboxContext(input).valid;
}

export function validateObservation(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "Observation", errors)) return fail(...errors);
  requireApiKind(input, "Observation", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors, ["observation_id", "observed_at"]);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  requireString(input.spec.raw, "spec.raw", errors);
  requireString(input.spec.source, "spec.source", errors);
  return errors.length ? fail(...errors) : ok();
}

export function isObservation(input: unknown): input is Observation {
  return validateObservation(input).valid;
}

export function validateBelief(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "Belief", errors)) return fail(...errors);
  requireApiKind(input, "Belief", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors, ["belief_id", "updated_at"]);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.statement, "spec.statement", errors);
  requireEnum(spec.status, "spec.status", BELIEF_STATUSES, errors);
  requireArray(spec.supporting_observation_refs, "spec.supporting_observation_refs", errors);
  requireConfidence(spec.confidence, "spec.confidence", errors);
  return errors.length ? fail(...errors) : ok();
}

export function isBelief(input: unknown): input is Belief {
  return validateBelief(input).valid;
}

export function validateMemoryTrustAnnotation(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "MemoryTrustAnnotation", errors)) return fail(...errors);
  requireApiKind(input, "MemoryTrustAnnotation", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.memory_ref, "spec.memory_ref", errors);
  requireEnum(spec.trust_class, "spec.trust_class", MEMORY_TRUST_CLASSES, errors);
  requireString(spec.annotated_at, "spec.annotated_at", errors);
  if (spec.store_namespace !== "v3_memory_trust") {
    errors.push('spec.store_namespace must be "v3_memory_trust"');
  }
  return errors.length ? fail(...errors) : ok();
}

export function isMemoryTrustAnnotation(input: unknown): input is MemoryTrustAnnotation {
  return validateMemoryTrustAnnotation(input).valid;
}

export function validateEvolutionCandidateStub(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "EvolutionCandidateStub", errors)) return fail(...errors);
  requireApiKind(input, "EvolutionCandidateStub", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors, ["candidate_id"]);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  for (const key of [
    "target",
    "problem_statement",
    "baseline",
    "hypothesis",
    "proposed_change",
    "expected_gain",
    "test_plan",
    "red_team_plan",
    "benchmark_plan",
    "rollback_plan",
  ] as const) {
    requireString(spec[key], `spec.${key}`, errors);
  }
  requireEnum(spec.risk, "spec.risk", ["low", "medium", "high", "critical"] as const, errors);
  requireEnum(spec.blast_radius, "spec.blast_radius", EVOLUTION_BLAST_RADII, errors);
  requireArray(spec.affected_contracts, "spec.affected_contracts", errors);
  requireArray(spec.affected_capabilities, "spec.affected_capabilities", errors);
  return errors.length ? fail(...errors) : ok();
}

export function isEvolutionCandidateStub(input: unknown): input is EvolutionCandidateStub {
  return validateEvolutionCandidateStub(input).valid;
}

export function validateDelegationContractStub(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "DelegationContractStub", errors)) return fail(...errors);
  requireApiKind(input, "DelegationContractStub", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors, ["delegation_id"]);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireString(spec.what_is_delegated, "spec.what_is_delegated", errors);
  requireArray(spec.what_is_not_delegated, "spec.what_is_not_delegated", errors);
  requireArray(spec.allowed_capabilities, "spec.allowed_capabilities", errors);
  requireArray(spec.forbidden_capabilities, "spec.forbidden_capabilities", errors);
  requireString(spec.data_scope, "spec.data_scope", errors);
  requireArray(spec.success_criteria, "spec.success_criteria", errors);
  requireArray(spec.evidence_expected, "spec.evidence_expected", errors);
  return errors.length ? fail(...errors) : ok();
}

export function isDelegationContractStub(input: unknown): input is DelegationContractStub {
  return validateDelegationContractStub(input).valid;
}

export function validateEvidencePackageManifest(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "EvidencePackageManifest", errors)) return fail(...errors);
  requireApiKind(input, "EvidencePackageManifest", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors, ["package_id"]);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  for (const key of [
    "execution_id",
    "goal",
    "environment",
    "version",
    "agent",
    "policy",
    "final_outcome",
    "package_root",
  ] as const) {
    requireString(spec[key], `spec.${key}`, errors);
  }
  requireArray(spec.providers, "spec.providers", errors);
  requireArray(spec.capabilities, "spec.capabilities", errors);
  if (!requireObject(spec.files, "spec.files", errors)) return fail(...errors);
  requireString(spec.files.manifest, "spec.files.manifest", errors);
  return errors.length ? fail(...errors) : ok();
}

export function isEvidencePackageManifest(input: unknown): input is EvidencePackageManifest {
  return validateEvidencePackageManifest(input).valid;
}

export function validateDemoManifest(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "DemoManifest", errors)) return fail(...errors);
  requireApiKind(input, "DemoManifest", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors, ["demo_id"]);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  for (const key of ["title", "input", "environment", "authority", "expected_behavior"] as const) {
    requireString(spec[key], `spec.${key}`, errors);
  }
  requireArray(spec.constraints, "spec.constraints", errors);
  requireArray(spec.observable_events, "spec.observable_events", errors);
  requireArray(spec.success_oracle_refs, "spec.success_oracle_refs", errors);
  return errors.length ? fail(...errors) : ok();
}

export function isDemoManifest(input: unknown): input is DemoManifest {
  return validateDemoManifest(input).valid;
}

export function validateInstructionHierarchyBinding(input: unknown): V3ValidationResult {
  const errors: string[] = [];
  if (!requireObject(input, "InstructionHierarchyBinding", errors)) return fail(...errors);
  requireApiKind(input, "InstructionHierarchyBinding", errors);
  if (!requireObject(input.metadata, "metadata", errors)) return fail(...errors);
  requireSchemaVersionMeta(input.metadata, errors);
  if (!requireObject(input.spec, "spec", errors)) return fail(...errors);
  const spec = input.spec;
  requireEnum(spec.level, "spec.level", INSTRUCTION_HIERARCHY_LEVELS, errors);
  requireString(spec.content_ref, "spec.content_ref", errors);
  if (!requireArray(spec.may_override_levels, "spec.may_override_levels", errors)) {
    return fail(...errors);
  }
  for (let i = 0; i < spec.may_override_levels.length; i++) {
    requireEnum(spec.may_override_levels[i], `spec.may_override_levels[${i}]`, INSTRUCTION_HIERARCHY_LEVELS, errors);
  }
  if (typeof spec.sealed_root !== "boolean") {
    errors.push("spec.sealed_root must be boolean");
  }
  if (typeof spec.authority_issued !== "boolean") {
    errors.push("spec.authority_issued must be boolean");
  }
  if (errors.length) return fail(...errors);

  // FW-H03: sealed_root + authority_issued + lower cannot override higher
  return assertInstructionHierarchyConstraints({
    apiVersion: V3_API_VERSION,
    kind: "InstructionHierarchyBinding",
    metadata: { schema_version: V3_SCHEMA_VERSION },
    spec: {
      level: spec.level as InstructionHierarchyBinding["spec"]["level"],
      content_ref: String(spec.content_ref),
      may_override_levels: spec.may_override_levels as InstructionHierarchyBinding["spec"]["may_override_levels"],
      sealed_root: spec.sealed_root as boolean,
      authority_issued: spec.authority_issued as boolean,
    },
  });
}

export function isInstructionHierarchyBinding(input: unknown): input is InstructionHierarchyBinding {
  return validateInstructionHierarchyBinding(input).valid;
}

/** Registry of validators keyed by kind for test / discovery. */
export const V3_VALIDATORS = {
  GoalContract: validateGoalContract,
  SuccessOracleCriterion: validateSuccessOracleCriterion,
  GoalSatisfactionProof: validateGoalSatisfactionProof,
  AutonomyGovernorDecision: validateAutonomyGovernorDecision,
  EvidenceLineage: validateEvidenceLineage,
  CapabilityLifecycleRecord: validateCapabilityLifecycleRecord,
  EffectIdempotencyDeclaration: validateEffectIdempotencyDeclaration,
  CheckpointSchemaV3: validateCheckpointSchemaV3,
  SafetySandboxContext: validateSafetySandboxContext,
  Observation: validateObservation,
  Belief: validateBelief,
  MemoryTrustAnnotation: validateMemoryTrustAnnotation,
  EvolutionCandidateStub: validateEvolutionCandidateStub,
  DelegationContractStub: validateDelegationContractStub,
  EvidencePackageManifest: validateEvidencePackageManifest,
  DemoManifest: validateDemoManifest,
  InstructionHierarchyBinding: validateInstructionHierarchyBinding,
} as const;

export type V3ContractKind = keyof typeof V3_VALIDATORS;

export function validateGoalVersionFields(version: GoalVersion): V3ValidationResult {
  return validateGoalVersion(version, "goal_version");
}
