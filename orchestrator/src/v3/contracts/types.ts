/**
 * EvolveLoop V3 first-wave schema types (0.1.2).
 * Source maps: EVOLVELOOP_V3.md + v3-metas-topo.md (Meta0).
 * IMMUTABLE stack: Intent→Capability→Policy→Runtime→Provider→Evidence
 */

import type { MemoryEntry } from "../../types/index.js";

import type { V3ApiVersion, V3SchemaVersion } from "./common.js";

// ---------------------------------------------------------------------------
// 1. GoalContract + GoalLifecycleState + GoalVersion + GoalTransition
// ---------------------------------------------------------------------------

/** EVOLVELOOP_V3.md §176 — lowercase snake (aligned with BeliefStatus / MemoryTrust). */
export const GOAL_LIFECYCLE_STATES = [
  "proposed",
  "accepted",
  "active",
  "blocked",
  "paused",
  "replanning",
  "verifying",
  "completed",
  "abandoned",
  "cancelled",
  "expired",
  "failed",
  "superseded",
] as const;

export type GoalLifecycleState = (typeof GOAL_LIFECYCLE_STATES)[number];

/** Terminal states: no further operational work; superseded may still be recorded. */
export const GOAL_TERMINAL_STATES = [
  "completed",
  "abandoned",
  "cancelled",
  "expired",
  "failed",
  "superseded",
] as const;

export type GoalTerminalState = (typeof GOAL_TERMINAL_STATES)[number];

export interface GoalVersion {
  major: number;
  minor: number;
  patch: number;
  /** Monotonic revision of the goal content (independent of schema version). */
  revision: number;
}

export interface GoalBudget {
  tokens?: number;
  cost_usd?: number;
  actions?: number;
  wall_clock_ms?: number;
}

/**
 * §176 transition audit — every edge must preserve these fields.
 * Written by GoalStore on each lifecycle mutation.
 */
export interface GoalTransition {
  goal_id: string;
  parent_goal_id?: string;
  from_state: GoalLifecycleState;
  to_state: GoalLifecycleState;
  version: GoalVersion;
  reason: string;
  evidence: string[];
  timestamp: string;
  policy_snapshot?: string;
  actor: string;
}

export interface GoalContract {
  apiVersion: V3ApiVersion;
  kind: "GoalContract";
  metadata: {
    id: string;
    /** Optional parent in the goal dependency graph (§178). */
    parent_goal_id?: string;
    schema_version: V3SchemaVersion;
    created_at?: string;
    updated_at?: string;
  };
  spec: {
    desired_outcome: string;
    constraints: string[];
    non_goals: string[];
    /** Refs to SuccessOracleCriterion.criterion_id */
    success_criteria_refs: string[];
    acceptable_degradation?: string;
    deadline?: string;
    budget?: GoalBudget;
    authority?: string;
    risk_policy?: string;
    lifecycle_state: GoalLifecycleState;
    goal_version: GoalVersion;
  };
}

// ---------------------------------------------------------------------------
// 2. SuccessOracleCriterion + GoalSatisfactionProof
// ---------------------------------------------------------------------------

export const ORACLE_CRITERION_TYPES = [
  "functional",
  "quality",
  "safety",
  "operational",
  "resource",
  "user_defined",
] as const;

export type OracleCriterionType = (typeof ORACLE_CRITERION_TYPES)[number];

export const ORACLE_CRITERION_STATUSES = [
  "pending",
  "met",
  "unmet",
  "uncertain",
  "waived",
] as const;

export type OracleCriterionStatus = (typeof ORACLE_CRITERION_STATUSES)[number];

export interface SuccessOracleCriterion {
  apiVersion: V3ApiVersion;
  kind: "SuccessOracleCriterion";
  metadata: { schema_version: V3SchemaVersion };
  spec: {
    criterion_id: string;
    type: OracleCriterionType;
    required: boolean;
    measurement: string;
    threshold: string;
    evidence_source: string;
    verification_method: string;
    status: OracleCriterionStatus;
  };
}

export const SATISFACTION_DECISIONS = [
  "success",
  "partial_success",
  "failure",
  "uncertain",
] as const;

export type SatisfactionDecision = (typeof SATISFACTION_DECISIONS)[number];

export interface GoalSatisfactionProof {
  apiVersion: V3ApiVersion;
  kind: "GoalSatisfactionProof";
  metadata: { schema_version: V3SchemaVersion; goal_id: string };
  spec: {
    requested_outcome: string;
    observed_changes: string[];
    observation_summary: string;
    criterion_evidence: Array<{
      criterion_id: string;
      evidence_ref: string;
      status: OracleCriterionStatus;
    }>;
    uncertain_criteria: string[];
    assumptions: string[];
    decision: SatisfactionDecision;
  };
}

// ---------------------------------------------------------------------------
// 3. AutonomyGovernorDecision (+ typed decision matrix FW-H01)
// ---------------------------------------------------------------------------

export const GOVERNOR_LEVELS = [
  "AUTONOMOUS",
  "AUTONOMOUS_WITH_REVIEW",
  "HUMAN_GATE",
  "BLOCK",
] as const;

export type AutonomyGovernorLevel = (typeof GOVERNOR_LEVELS)[number];

export const GOVERNOR_RISKS = ["low", "medium", "high", "critical"] as const;
export type GovernorRisk = (typeof GOVERNOR_RISKS)[number];

/**
 * §255 degraded autonomy modes — operational limits when safety is not NORMAL.
 * Mapped onto Governor levels; not a second governor system.
 */
export const DEGRADED_AUTONOMY_MODES = [
  "FULL_AUTONOMY",
  "LIMITED_AUTONOMY",
  "READ_ONLY",
  "OBSERVE_ONLY",
  "SANDBOX_ONLY",
  "HUMAN_APPROVAL",
  "QUARANTINED",
] as const;

export type DegradedAutonomyMode = (typeof DEGRADED_AUTONOMY_MODES)[number];

export interface AutonomyGovernorInputs {
  risk: GovernorRisk;
  reversibility: "reversible" | "conditionally_reversible" | "irreversible";
  authority: string;
  confidence: number;
  impact: "local" | "subsystem" | "external" | "global";
  cost: "low" | "medium" | "high";
  environment: string;
  /** Required for matrix enforcement (FW-H01). */
  safety_state: SafetyState;
}

/**
 * Typed constraint matrix (risk × safety_state → forbidden levels).
 * Enforcement is deterministic in assertAutonomyGovernorConstraints.
 *
 * Invariants (inegociáveis):
 * - QUARANTINED → only BLOCK
 * - risk=critical → forbids AUTONOMOUS and AUTONOMOUS_WITH_REVIEW (confirm/BLOCK only)
 * - risk=high → forbids AUTONOMOUS
 * - SUSPECT | RESTRICTED | RECOVERING → forbids AUTONOMOUS (degraded states)
 * - irreversible + critical → must be BLOCK (not HUMAN_GATE alone)
 */
export interface GovernorDecisionMatrixRule {
  id: string;
  when: {
    risk?: GovernorRisk | GovernorRisk[];
    safety_state?: SafetyState | SafetyState[];
    reversibility?: AutonomyGovernorInputs["reversibility"] | AutonomyGovernorInputs["reversibility"][];
  };
  forbid_levels: AutonomyGovernorLevel[];
  /** If set, level MUST be exactly this (stronger than forbid). */
  require_level?: AutonomyGovernorLevel;
}

export const AUTONOMY_GOVERNOR_DECISION_MATRIX: readonly GovernorDecisionMatrixRule[] = [
  {
    id: "quarantined_forces_block",
    when: { safety_state: "QUARANTINED" },
    forbid_levels: ["AUTONOMOUS", "AUTONOMOUS_WITH_REVIEW", "HUMAN_GATE"],
    require_level: "BLOCK",
  },
  {
    id: "critical_no_autonomous",
    when: { risk: "critical" },
    forbid_levels: ["AUTONOMOUS", "AUTONOMOUS_WITH_REVIEW"],
  },
  {
    id: "critical_irreversible_block",
    when: { risk: "critical", reversibility: "irreversible" },
    forbid_levels: ["AUTONOMOUS", "AUTONOMOUS_WITH_REVIEW", "HUMAN_GATE"],
    require_level: "BLOCK",
  },
  {
    id: "high_no_autonomous",
    when: { risk: "high" },
    forbid_levels: ["AUTONOMOUS"],
  },
  {
    id: "restricted_no_autonomous",
    when: { safety_state: "RESTRICTED" },
    forbid_levels: ["AUTONOMOUS"],
  },
  {
    id: "restricted_high_or_critical_block",
    when: { safety_state: "RESTRICTED", risk: ["high", "critical"] },
    forbid_levels: ["AUTONOMOUS", "AUTONOMOUS_WITH_REVIEW", "HUMAN_GATE"],
    require_level: "BLOCK",
  },
  {
    id: "suspect_no_autonomous",
    when: { safety_state: "SUSPECT" },
    forbid_levels: ["AUTONOMOUS"],
  },
  {
    id: "suspect_critical_block",
    when: { safety_state: "SUSPECT", risk: "critical" },
    forbid_levels: ["AUTONOMOUS", "AUTONOMOUS_WITH_REVIEW", "HUMAN_GATE"],
    require_level: "BLOCK",
  },
  {
    id: "recovering_no_autonomous",
    when: { safety_state: "RECOVERING" },
    forbid_levels: ["AUTONOMOUS"],
  },
  {
    id: "recovering_high_or_critical_block",
    when: { safety_state: "RECOVERING", risk: ["high", "critical"] },
    forbid_levels: ["AUTONOMOUS", "AUTONOMOUS_WITH_REVIEW", "HUMAN_GATE"],
    require_level: "BLOCK",
  },
] as const;

export interface AutonomyGovernorDecision {
  apiVersion: V3ApiVersion;
  kind: "AutonomyGovernorDecision";
  metadata: { schema_version: V3SchemaVersion; decision_id: string };
  spec: {
    inputs: AutonomyGovernorInputs;
    level: AutonomyGovernorLevel;
    rationale: string;
    /**
     * Policy engine remains authoritative; governor only proposes within bounds.
     * Inegociável: obrigatório quando level ≠ BLOCK (FW-H01).
     */
    policy_ref?: string;
    decided_at: string;
    /** Optional §255 mode label derived from safety_state (not a second control plane). */
    degraded_mode?: DegradedAutonomyMode;
  };
}

// ---------------------------------------------------------------------------
// 4. EvidenceLineage (points to evidence v2.1 — does not replace builders)
// ---------------------------------------------------------------------------

export interface EvidenceLineage {
  apiVersion: V3ApiVersion;
  kind: "EvidenceLineage";
  metadata: { schema_version: V3SchemaVersion };
  spec: {
    /** Ref to capability-orchestrator.io/v2 Evidence object (node/run path or id). */
    evidence_ref: string;
    evidence_api_version: "capability-orchestrator.io/v2";
    backward: {
      observation_ref?: string;
      action_ref?: string;
      decision_ref?: string;
      goal_ref?: string;
    };
    forward: {
      verification_ref?: string;
      decision_ref?: string;
      outcome_ref?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// 5. CapabilityLifecycleState (fabric-ready; does not fork registry)
// ---------------------------------------------------------------------------

export const CAPABILITY_LIFECYCLE_STATES = [
  "DISCOVERED",
  "CANDIDATE",
  "VALIDATED",
  "AVAILABLE",
  "DEGRADED",
  "QUARANTINED",
  "REVOKED",
  "REPLACED",
  "REVALIDATED",
] as const;

export type CapabilityLifecycleState = (typeof CAPABILITY_LIFECYCLE_STATES)[number];

export interface CapabilityLifecycleRecord {
  apiVersion: V3ApiVersion;
  kind: "CapabilityLifecycleRecord";
  metadata: { schema_version: V3SchemaVersion };
  spec: {
    /** Existing registry capability id — no second registry. */
    capability_id: string;
    capability_version: string;
    state: CapabilityLifecycleState;
    updated_at: string;
    reason?: string;
    superseded_by?: string;
  };
}

// ---------------------------------------------------------------------------
// 6. EffectClassification + IdempotencyClass
// ---------------------------------------------------------------------------

export const EFFECT_CLASSIFICATIONS = [
  "READ",
  "DERIVE",
  "LOCAL_WRITE",
  "EXTERNAL_WRITE",
  "COMMUNICATION",
  "DESTRUCTIVE",
  "IRREVERSIBLE",
] as const;

export type EffectClassification = (typeof EFFECT_CLASSIFICATIONS)[number];

export const IDEMPOTENCY_CLASSES = [
  "idempotent",
  "conditionally_idempotent",
  "non_idempotent",
  "unknown",
] as const;

export type IdempotencyClass = (typeof IDEMPOTENCY_CLASSES)[number];

export interface EffectIdempotencyDeclaration {
  apiVersion: V3ApiVersion;
  kind: "EffectIdempotencyDeclaration";
  metadata: { schema_version: V3SchemaVersion };
  spec: {
    capability_id: string;
    effects: EffectClassification[];
    idempotency: IdempotencyClass;
  };
}

// ---------------------------------------------------------------------------
// 7. CheckpointSchemaV3 (conceptual extension — does not break EngineCheckpoint v2)
// ---------------------------------------------------------------------------

export interface CheckpointSchemaV3 {
  apiVersion: V3ApiVersion;
  kind: "CheckpointSchemaV3";
  metadata: {
    schema_version: V3SchemaVersion;
    checkpoint_id: string;
    saved_at: string;
  };
  spec: {
    /**
     * Optional pointer to jobs EngineCheckpoint (apiVersion capability-orchestrator.io/v2).
     * V3 MUST NOT rewrite or replace that document's apiVersion.
     */
    engine_checkpoint_ref?: string;
    goal_state_ref: string;
    world_model_snapshot_ref?: string;
    active_belief_refs: string[];
    memory_refs: string[];
    task_graph_ref?: string;
    resource_accounting?: Record<string, number>;
    policy_snapshot_ref?: string;
    authority?: string;
    capability_state_refs?: string[];
    pending_effects?: string[];
    recovery_metadata?: Record<string, string>;
  };
}

// ---------------------------------------------------------------------------
// 8. SafetyState + SandboxDepth S0–S5
// ---------------------------------------------------------------------------

export const SAFETY_STATES = [
  "NORMAL",
  "SUSPECT",
  "RESTRICTED",
  "QUARANTINED",
  "RECOVERING",
  "RESTORED",
] as const;

export type SafetyState = (typeof SAFETY_STATES)[number];

export const SANDBOX_DEPTHS = ["S0", "S1", "S2", "S3", "S4", "S5"] as const;

export type SandboxDepth = (typeof SANDBOX_DEPTHS)[number];

/**
 * FW-H02 — minimum sandbox depth per effect class (§211).
 * Schema/policy only — no OS sandbox implementation.
 * Inegociável: DESTRUCTIVE and IRREVERSIBLE cannot run at S0.
 */
export const DEFAULT_SANDBOX_DEPTH_REQUIREMENTS: Readonly<
  Record<EffectClassification, SandboxDepth>
> = {
  READ: "S0",
  DERIVE: "S0",
  LOCAL_WRITE: "S1",
  EXTERNAL_WRITE: "S2",
  COMMUNICATION: "S2",
  DESTRUCTIVE: "S3",
  IRREVERSIBLE: "S4",
};

export interface SandboxDepthRequirement {
  effect_class: EffectClassification;
  min_depth: SandboxDepth;
}

export interface SafetySandboxContext {
  apiVersion: V3ApiVersion;
  kind: "SafetySandboxContext";
  metadata: { schema_version: V3SchemaVersion };
  spec: {
    safety_state: SafetyState;
    sandbox_depth: SandboxDepth;
    reason?: string;
    updated_at: string;
    /**
     * When present, each effect_class must satisfy DEFAULT_SANDBOX_DEPTH_REQUIREMENTS
     * against sandbox_depth (FW-H02).
     */
    effect_classes?: EffectClassification[];
  };
}

// ---------------------------------------------------------------------------
// 9. Belief + Observation separation
// ---------------------------------------------------------------------------

export const BELIEF_STATUSES = [
  "hypothesis",
  "supported",
  "strongly_supported",
  "suspect",
  "invalidated",
] as const;

export type BeliefStatus = (typeof BELIEF_STATUSES)[number];

export interface Observation {
  apiVersion: V3ApiVersion;
  kind: "Observation";
  metadata: {
    schema_version: V3SchemaVersion;
    observation_id: string;
    observed_at: string;
  };
  spec: {
    raw: string;
    source: string;
    /** Observations are facts of sensing — not conclusions. */
    trust_hint?: "sensor" | "tool" | "human" | "external";
  };
}

export interface Belief {
  apiVersion: V3ApiVersion;
  kind: "Belief";
  metadata: {
    schema_version: V3SchemaVersion;
    belief_id: string;
    updated_at: string;
  };
  spec: {
    statement: string;
    status: BeliefStatus;
    supporting_observation_refs: string[];
    dependent_belief_refs?: string[];
    confidence: number;
  };
}

// ---------------------------------------------------------------------------
// 10. MemoryTrustClass (V3 bridge over V2 MemoryEntry — no second store) FW-H04
// ---------------------------------------------------------------------------

export const MEMORY_TRUST_CLASSES = [
  "OBSERVED",
  "VERIFIED",
  "INFERRED",
  "REPORTED",
  "LEARNED",
  "PREDICTED",
  "INVALIDATED",
  "STALE",
] as const;

export type MemoryTrustClass = (typeof MEMORY_TRUST_CLASSES)[number];

/**
 * Bridge type: extends V2 MemoryEntry with optional trust_class.
 * Inegociável: does NOT create a second MemoryStore — annotate in place / sidecar.
 */
export interface MemoryEntryWithTrust extends MemoryEntry {
  trust_class?: MemoryTrustClass;
}

export interface MemoryTrustAnnotation {
  apiVersion: V3ApiVersion;
  kind: "MemoryTrustAnnotation";
  metadata: { schema_version: V3SchemaVersion };
  spec: {
    memory_ref: string;
    trust_class: MemoryTrustClass;
    annotated_at: string;
    /** Explicit: this is NOT the V2 MemoryStore record. */
    store_namespace: "v3_memory_trust";
  };
}

// ---------------------------------------------------------------------------
// 11. EvolutionCandidateStub (schema only — no promote)
// ---------------------------------------------------------------------------

export const EVOLUTION_BLAST_RADII = ["LOCAL", "SUBSYSTEM", "RUNTIME", "GLOBAL"] as const;

export type EvolutionBlastRadius = (typeof EVOLUTION_BLAST_RADII)[number];

export interface EvolutionCandidateStub {
  apiVersion: V3ApiVersion;
  kind: "EvolutionCandidateStub";
  metadata: {
    schema_version: V3SchemaVersion;
    candidate_id: string;
  };
  spec: {
    target: string;
    problem_statement: string;
    baseline: string;
    hypothesis: string;
    proposed_change: string;
    expected_gain: string;
    risk: "low" | "medium" | "high" | "critical";
    affected_contracts: string[];
    affected_capabilities: string[];
    test_plan: string;
    red_team_plan: string;
    benchmark_plan: string;
    rollback_plan: string;
    blast_radius: EvolutionBlastRadius;
  };
}

// ---------------------------------------------------------------------------
// 12. DelegationContractStub
// ---------------------------------------------------------------------------

export interface DelegationContractStub {
  apiVersion: V3ApiVersion;
  kind: "DelegationContractStub";
  metadata: {
    schema_version: V3SchemaVersion;
    delegation_id: string;
  };
  spec: {
    what_is_delegated: string;
    what_is_not_delegated: string[];
    allowed_capabilities: string[];
    forbidden_capabilities: string[];
    data_scope: string;
    deadline?: string;
    budget?: GoalBudget;
    success_criteria: string[];
    evidence_expected: string[];
  };
}

// ---------------------------------------------------------------------------
// 13. Meta0 EvidencePackageManifest + DemoManifest
// ---------------------------------------------------------------------------

export interface EvidencePackageManifest {
  apiVersion: V3ApiVersion;
  kind: "EvidencePackageManifest";
  metadata: {
    schema_version: V3SchemaVersion;
    package_id: string;
  };
  spec: {
    execution_id: string;
    goal: string;
    environment: string;
    version: string;
    agent: string;
    providers: string[];
    capabilities: string[];
    policy: string;
    actions_ref?: string;
    observations_ref?: string;
    failures_ref?: string;
    recovery_ref?: string;
    evidence_ref?: string;
    verification_ref?: string;
    final_outcome: string;
    resource_usage?: Record<string, number>;
    package_root: string;
    files: {
      manifest: string;
      execution?: string;
      evidence?: string;
      verification?: string;
      diff?: string;
      logs_dir?: string;
      reproduction?: string;
    };
  };
}

export interface DemoManifest {
  apiVersion: V3ApiVersion;
  kind: "DemoManifest";
  metadata: {
    schema_version: V3SchemaVersion;
    demo_id: string;
  };
  spec: {
    title: string;
    input: string;
    environment: string;
    authority: string;
    constraints: string[];
    expected_behavior: string;
    observable_events: string[];
    success_oracle_refs: string[];
    evidence_package_ref?: string;
    /** Declared prior outcome label; stub never upgrades this to PASS. */
    result?: string;
    /**
     * Capabilities the live runner must expose before measurement.
     * Optional catalog hint — validated as string[] when present by meta0 loader.
     */
    required_capabilities?: string[];
    /** When true, stub reports NOT_MEASURED/BLOCKED until sandbox is ready. */
    requires_sandbox?: boolean;
  };
}

// ---------------------------------------------------------------------------
// 14. InstructionHierarchy levels
// ---------------------------------------------------------------------------

export const INSTRUCTION_HIERARCHY_LEVELS = [
  "system_policy",
  "authority_policy",
  "goal_constraints",
  "task_instructions",
  "external_data",
] as const;

export type InstructionHierarchyLevel = (typeof INSTRUCTION_HIERARCHY_LEVELS)[number];

/** Precedence: index 0 is highest authority. */
export const INSTRUCTION_HIERARCHY_PRECEDENCE: readonly InstructionHierarchyLevel[] =
  INSTRUCTION_HIERARCHY_LEVELS;

/** Sealed roots — cannot be self-attested by lower-priority content (FW-H03 / §299). */
export const INSTRUCTION_HIERARCHY_SEALED_ROOT_LEVELS = [
  "system_policy",
  "authority_policy",
] as const;

export type InstructionHierarchySealedRootLevel =
  (typeof INSTRUCTION_HIERARCHY_SEALED_ROOT_LEVELS)[number];

export interface InstructionHierarchyBinding {
  apiVersion: V3ApiVersion;
  kind: "InstructionHierarchyBinding";
  metadata: { schema_version: V3SchemaVersion };
  spec: {
    level: InstructionHierarchyLevel;
    content_ref: string;
    /** External data MUST NOT override higher levels. */
    may_override_levels: InstructionHierarchyLevel[];
    /**
     * Sealed root flag (FW-H03).
     * Inegociável: true for system_policy / authority_policy; false for external_data.
     */
    sealed_root: boolean;
    /**
     * Authority-issued provenance (FW-H03 / §300).
     * Inegociável: required true for every level above external_data.
     */
    authority_issued: boolean;
  };
}
