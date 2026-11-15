/**
 * M03-owned types that sit *on top of* frozen EffectRecord / EffectLedgerPort.
 * Additive only: no contract schema changes (CONTRACT-FREEZE).
 */

import type { ActorRef, IsoTimestamp } from "../contracts/common.js";
import type { EffectRecord, EffectState, ReconciliationAttempt } from "../contracts/effect.js";
import type { Evidence } from "../contracts/evidence.js";
import type { EventLedgerPort, MeasurementSinkPort } from "../contracts/ports.js";

/** Clock injection so crash/handoff tests do not depend on wall time (timestamps never order). */
export type Clock = () => IsoTimestamp;

/**
 * F05: authority to leave the platform as DISPATCHED must be checkable against the
 * current lease/epoch *before* write-ahead. M10/M13 own credentials; M03 only gates.
 */
export interface EffectFence {
  work_id: string;
  fencing_epoch: number;
  lease_id?: string;
  assertFresh: () => Promise<void> | void;
}

export interface EvidenceStore {
  get(evidence_id: string): Promise<Evidence | undefined>;
  put(evidence: Evidence): Promise<void>;
}

export interface EffectAuditEntry {
  at: IsoTimestamp;
  effect_id: string;
  work_id: string;
  /** Null on first persist (plan). */
  from: EffectState | null;
  to: EffectState;
  actor: ActorRef;
  /** PolicyDecision id only — PolicyDecision 1.0.0 has no `decided_by` (freeze R4). */
  authorization?: { policy_decision_id: string; approval_id?: string };
  evidence_ids: string[];
  observed_result: string;
  fencing_epoch?: number;
  /** Explicit: this log is not a signature (freeze R1). */
  integrity_claim: "audit_only_not_non_repudiation";
}

/** Typed effect.* payloads. Never copy executor CONTROL (freeze R2 / TM-V4-F12). */
export type EffectPlannedPayload = {
  effect_id: string;
  work_id: string;
  task_id: string;
  execution_id: string;
  effect_class: EffectRecord["effect_class"];
  intent_action: string;
  target_resource: string;
  parameters_digest: string;
  idempotency_key?: string;
  executor_id: string;
  authorization_policy_decision_id?: string;
};

export type EffectStateChangedPayload = {
  effect_id: string;
  from: EffectState;
  to: EffectState;
  evidence_ids: string[];
  observed_result: string;
  authorization_policy_decision_id?: string;
};

export type EffectReconciliationPayload = {
  effect_id: string;
  method: ReconciliationAttempt["method"];
  outcome: ReconciliationAttempt["outcome"];
  observed: string;
  evidence_ids: string[];
};

export type EffectDomainEvent =
  | { type: "effect.planned"; work_id: string; occurred_at: IsoTimestamp; payload: EffectPlannedPayload }
  | { type: "effect.state_changed"; work_id: string; occurred_at: IsoTimestamp; payload: EffectStateChangedPayload }
  | {
      type: "effect.reconciliation_attempted";
      work_id: string;
      occurred_at: IsoTimestamp;
      payload: EffectReconciliationPayload;
    };

export interface EffectLedgerOptions {
  /** Durable root. Absent ⇒ process-memory only (tests). Crash tests MUST pass a directory. */
  rootDir?: string;
  clock?: Clock;
  evidence?: EvidenceStore;
  events?: EventLedgerPort;
  measurements?: MeasurementSinkPort;
  /**
   * Called before every EXTERNAL DISPATCHED persist. Missing fence on EXTERNAL
   * dispatch fails closed (F05). INTERNAL may omit.
   */
  fence?: (ctx: { work_id: string; effect_id: string }) => Promise<EffectFence | void> | EffectFence | void;
  actor?: ActorRef;
}

export const AUDIT_INTEGRITY_CLAIM = "audit_only_not_non_repudiation" as const;
