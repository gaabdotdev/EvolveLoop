/**
 * Inter-meta integration ports (M00-owned interfaces; implementations owned by the listed meta).
 * Consumers depend on these interfaces, never on another meta's concrete module
 * (docs/v4/architecture/INTEGRATION-CONTRACTS.md). Conformance suites: orchestrator/tests/v4/conformance/.
 */

import type { ContentRef, IsoTimestamp } from "./common.js";
import type { GoalContract } from "./goal-contract.js";
import type { Work } from "./work.js";
import type { Task } from "./task.js";
import type { Execution } from "./execution.js";
import type { Executor } from "./executor.js";
import type { CapsuleAcceptance, ExecutionCapsule } from "./capsule.js";
import type { Checkpoint } from "./checkpoint.js";
import type { EffectRecord, EffectState, RetryDecision } from "./effect.js";
import type { Artifact } from "./artifact.js";
import type { Evidence } from "./evidence.js";
import type { WorkProof } from "./work-proof.js";
import type { PolicyDecision, PolicyDecisionRequest } from "./policy.js";
import type { CapabilityProfile } from "./capability-profile.js";
import type { WorkEvent } from "./work-event.js";
import type { ValidationResult } from "./common.js";

/** Event to append; the ledger assigns `seq` and `recorded_at`. */
export type WorkEventDraft = Omit<WorkEvent, "seq" | "recorded_at">;

export type AppendOutcome =
  | { status: "APPENDED"; events: WorkEvent[]; head_seq: number }
  | { status: "DUPLICATE"; events: WorkEvent[]; head_seq: number }
  | { status: "CONFLICT"; reason: "EXPECTED_SEQ_MISMATCH" | "EVENT_ID_REUSED_WITH_DIFFERENT_PAYLOAD"; head_seq: number }
  | { status: "FENCED"; reason: string; head_seq: number }
  | { status: "INVALID"; validation: ValidationResult; head_seq: number };

/** M02. Atomic per-work append with optimistic concurrency and fencing (ADR-V4-0003/0004). */
export interface EventLedgerPort {
  /**
   * Appends all drafts atomically or none. `expected_head_seq` must equal the current head.
   * A batch whose every event_id already exists with equal digests returns DUPLICATE (idempotent).
   */
  append(work_id: string, drafts: WorkEventDraft[], opts: { expected_head_seq: number }): Promise<AppendOutcome>;
  read(work_id: string, opts?: { from_seq?: number; to_seq?: number }): Promise<WorkEvent[]>;
  head(work_id: string): Promise<number>;
}

/** M01. Read model of work state; never mutated except by projecting ledger events. */
export interface WorkRepositoryPort {
  getWork(work_id: string): Promise<Work | undefined>;
  getGoalContract(goal_contract_id: string, version: number): Promise<GoalContract | undefined>;
  listTasks(work_id: string): Promise<Task[]>;
}

/** M02. */
export interface CheckpointStorePort {
  create(work_id: string, at_seq: number): Promise<Checkpoint>;
  get(checkpoint_id: string): Promise<Checkpoint | undefined>;
  /** Latest checkpoint whose consistency is VERIFIED. */
  latestConsistent(work_id: string): Promise<Checkpoint | undefined>;
}

/** M02, backed by V3.7 ArtifactFabric through V37ArtifactPort. Write-then-reference (ADR-V4-0004). */
export interface ArtifactStorePort {
  put(input: { work_id: string; bytes: Uint8Array; media_type: string; origin: Artifact["origin"] }): Promise<Artifact>;
  get(artifact_id: string): Promise<Artifact | undefined>;
  verify(ref: ContentRef): Promise<"VERIFIED" | "MISMATCH" | "MISSING">;
}

/** M03. */
export interface EffectLedgerPort {
  plan(effect: Omit<EffectRecord, "state" | "evidence_ids" | "reconciliation" | "created_at" | "updated_at">): Promise<EffectRecord>;
  /** Rejects transitions not in EFFECT_TRANSITIONS or lacking required evidence. */
  transition(effect_id: string, to: EffectState, evidence_ids: string[], opts: { expected_state: EffectState }): Promise<EffectRecord>;
  get(effect_id: string): Promise<EffectRecord | undefined>;
  listOpen(work_id: string): Promise<EffectRecord[]>;
  /** Must equal the normative `decideRetry` for the stored record. */
  retryDecision(effect_id: string): Promise<RetryDecision>;
}

/** M04. Capsule ≠ grant: `accept` re-derives authority and binds Work State from the ledger (INV-CAP-07/08). */
export interface CapsuleServicePort {
  seal(work_id: string, opts: { base_checkpoint_id: string; for_executor?: string }): Promise<ExecutionCapsule>;
  verify(capsule: ExecutionCapsule, opts: { now: IsoTimestamp; trusted_key_ids: string[] }): Promise<ValidationResult>;
  /**
   * Accept a verified capsule. Implementations MUST:
   * 1. fail-closed on any verify failure;
   * 2. re-derive effective grants from current policy (never copy `delegable_grants` as authority);
   * 3. read Work/Task state from the Event Ledger at `base_checkpoint.event_seq` (never from `task_refs`);
   * 4. consume anti-replay / single-use token.
   */
  accept(
    capsule: ExecutionCapsule,
    ctx: { now: IsoTimestamp; policy_id: string },
  ): Promise<CapsuleAcceptance>;
}

/** M10. Deny-by-default PDP. Enforcement points must re-check before external dispatch. */
export interface PolicyDecisionPort {
  decide(request: PolicyDecisionRequest): Promise<PolicyDecision>;
  /** Current epoch of the governing policy, for cache invalidation. */
  currentEpoch(policy_id: string): Promise<number>;
}

/** M06. Verifiers must not share executor identity with the subject (ADR-V4-0009). */
export interface VerifierPort {
  readonly verifier_id: string;
  verify(input: { work_id: string; goal_contract: GoalContract; criterion_id: string; artifacts: Artifact[]; subject_executor_id: string }): Promise<Evidence[]>;
}

/** M06. */
export interface WorkProofPort {
  build(work_id: string): Promise<WorkProof>;
}

/** M08 (read side). */
export interface CapabilityProfilePort {
  profilesFor(executor_id: string, context: CapabilityProfile["context"]): Promise<CapabilityProfile[]>;
}

/** M11. Answers the four §4.12 questions with verifiable references. */
export interface ProvenanceQueryPort {
  decisionOrigin(decision_ref: string): Promise<string[]>;
  artifactAuthors(artifact_id: string): Promise<string[]>;
  evidenceForRequirement(goal_contract_id: string, version: number, criterion_id: string): Promise<string[]>;
  authorizationFor(effect_id: string): Promise<string[]>;
}

/** M13. Dispatch over the V3.7 fabric (placement + lease + protocol); never bypasses PolicyDecisionPort. */
export interface ExecutionGatewayPort {
  dispatch(input: { work_id: string; task_id: string; executor: Executor; capsule?: ExecutionCapsule; policy_decision_id: string }): Promise<Execution>;
  cancel(execution_id: string, reason: string): Promise<Execution>;
  status(execution_id: string): Promise<Execution | undefined>;
}

/**
 * M12. Observe-only sink. Uses the V3 Measurement Plane envelope unchanged (ADR-V4-0002);
 * typed as `unknown` here to avoid coupling the contracts package to telemetry internals.
 */
export interface MeasurementSinkPort {
  emit(measurementEvent: unknown): void;
}
