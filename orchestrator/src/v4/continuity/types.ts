/**
 * M04-owned types. Consumers of CapsuleServicePort never need these;
 * they exist so recovery/handoff and tests can compose Wave 2 ports.
 */

import type {
  CapsuleAcceptance,
  Checkpoint,
  ConformanceLevel,
  DelegableGrantRef,
  EffectRecord,
  EffectState,
  ExecutorRef,
  IsoTimestamp,
  RetryDecision,
  WorkEvent,
} from "../contracts/index.js";
import type { LedgerProjection } from "../ledger/index.js";

/** D09 — ingestion size bound. Heuristic, not a throughput SLA. */
export const MAX_CAPSULE_BYTES = 256 * 1024;

/** What `seal` emits besides allowlisted contract fields — nothing. */
export const DEFAULT_NOT_PRESERVED = [
  "model conversation memory",
  "unsigned local caches",
  "lease-scoped credentials",
] as const;

export interface CapsuleSigner {
  readonly key_id: string;
  sign(manifest_sha256: string): string;
}

export interface CapsuleKeyLookup {
  publicKey(key_id: string): string | undefined;
  verify(public_key_spki_b64: string, payload: string, signature_b64: string): boolean;
}

export interface DelegableGrantSource {
  grantsFor(input: { work_id: string; for_executor?: string; now: IsoTimestamp }): Promise<DelegableGrantRef[]>;
}

/**
 * M13 lease/epoch bind (D03). Optional: when `lease_required` the service
 * fail-closes if this port is missing or bind throws.
 */
export interface CapsuleLeaseBindPort {
  bind(input: {
    work_id: string;
    capsule_id: string;
    checkpoint_id: string;
    event_seq: number;
    now: IsoTimestamp;
  }): Promise<{ lease_id: string; fencing_epoch: number }>;
}

/** M02 tombstones (D19) without importing TombstoneStore into the engine. */
export interface TombstoneView {
  consumedGrants(work_id: string): Promise<readonly string[]>;
  terminalEffects(work_id: string): Promise<readonly { effect_id: string; state: string }[]>;
}

export interface ConformanceLookup {
  levelOf(executor_id: string): Promise<ConformanceLevel | undefined>;
}

export interface BoundWorkState {
  source: "EVENT_LEDGER";
  work_id: string;
  event_seq: number;
  state_digest: string;
  work_state?: string;
  tasks: { task_id: string; state: string }[];
  open_effects: { effect_id: string; state: EffectState }[];
}

export interface ContinuityRecovery {
  work_id: string;
  checkpoint: Checkpoint;
  event_seq: number;
  ledger_events: WorkEvent[];
  projection: LedgerProjection;
  open_effects: EffectRecord[];
  unknown_effect_ids: string[];
  retry_decisions: { effect_id: string; decision: RetryDecision }[];
  consumed_grants: string[];
  terminal_effects: { effect_id: string; state: string }[];
  /** Never invented: only task ids whose ledger state is already VERIFIED. */
  confirmed_task_ids: string[];
  recovered_without_context_hint: true;
  recovered_without_invented_confirmed_state: true;
}

export interface HandoffResult {
  acceptance: CapsuleAcceptance;
  recovery: ContinuityRecovery;
  /** Allowlisted capsule fields only — never unknown keys or grant material. */
  executor_context: Record<string, unknown>;
  bound_work: BoundWorkState;
}

export interface CapsuleServiceOptions {
  now?: () => IsoTimestamp;
  signer?: CapsuleSigner;
  keys?: CapsuleKeyLookup;
  /**
   * Key ids trusted at accept-time verify. Never taken from the capsule itself
   * (a forger's key_id is not authority). Defaults to `[signer.key_id]` when set.
   */
  trusted_key_ids?: string[];
  /** V4.1 default: true. In-process tests may set false to emit unsigned capsules. */
  require_signature?: boolean;
  grants?: DelegableGrantSource;
  rederive_subject: ExecutorRef;
  environment?: string;
  risk?: "low" | "medium" | "high" | "critical";
  lease?: CapsuleLeaseBindPort;
  lease_required?: boolean;
  tombstones?: TombstoneView;
  conformance?: ConformanceLookup;
  created_by_id?: string;
}

export const CONTINUITY_ACTOR_ID = "v4-m04-continuity";
