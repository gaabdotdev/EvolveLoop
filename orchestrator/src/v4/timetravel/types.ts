/**
 * M05-owned types on top of frozen Work / EffectRecord / Checkpoint.
 * Additive only: no contract schema changes (CONTRACT-FREEZE).
 */

import type {
  ActorRef,
  ArtifactStorePort,
  Checkpoint,
  CheckpointStorePort,
  EffectClass,
  EffectLedgerPort,
  EffectRecord,
  EventLedgerPort,
  IsoTimestamp,
  RetryDecision,
  Work,
  WorkEvent,
  WorkState,
} from "../contracts/index.js";
import type { InMemoryWorkRepository, WorkSnapshot } from "../work/index.js";
import type { LedgerProjection as M02LedgerProjection } from "../ledger/index.js";
import type { REPLAY_DETERMINISM_CLAIM } from "./guarantees.js";

export type Clock = () => IsoTimestamp;

export type ReplayMode = "RECORDED" | "REEXECUTE";
export const REPLAY_MODES: readonly ReplayMode[] = ["RECORDED", "REEXECUTE"];

/**
 * M03 `cloneAsInherited` is the fork write path (D08). Not on the frozen
 * EffectLedgerPort; M05 composes the M03 public class/API.
 */
export interface ForkEffectLedger extends EffectLedgerPort {
  cloneAsInherited(
    source_effect_id: string,
    fork: { work_id: string; effect_id: string; execution_id: string },
  ): Promise<EffectRecord>;
}

export interface TimeTravelDeps {
  ledger: EventLedgerPort;
  checkpoints: CheckpointStorePort;
  artifacts?: ArtifactStorePort;
  effects?: ForkEffectLedger;
  works?: InMemoryWorkRepository;
  clock?: Clock;
  actor?: ActorRef;
}

export interface InspectQuery {
  work_id: string;
  /** Inclusive high-water mark. Ignored when `checkpoint_id` is set (checkpoint.event_seq wins). */
  at_seq?: number;
  checkpoint_id?: string;
}

export interface TimelineEntry {
  seq: number;
  event_id: string;
  type: string;
  occurred_at: IsoTimestamp;
  recorded_at: IsoTimestamp;
  actor: ActorRef;
}

export interface ReferencedArtifact {
  sha256: string;
  size_bytes?: number;
  media_type?: string;
  verify: "VERIFIED" | "MISMATCH" | "MISSING" | "UNCHECKED";
}

export interface InspectionView {
  work_id: string;
  at_seq: number;
  head_seq: number;
  /** True iff this call issued no append (inspect is read-only on the inspected work). */
  mutated_log: false;
  checkpoint?: Checkpoint;
  events: WorkEvent[];
  timeline: TimelineEntry[];
  ledger_projection: M02LedgerProjection;
  work?: Work;
  work_snapshot?: WorkSnapshot;
  referenced_artifacts: ReferencedArtifact[];
  /** Order is per-work `seq`, never timestamps (ADR-V4-0003). */
  order_key: "seq";
}

export interface ForkRequest {
  from_work_id: string;
  checkpoint_id: string;
}

export interface InheritedEffect {
  source_effect_id: string;
  fork_effect_id: string;
  effect_class: EffectClass;
  fork_inherited: true;
  retry: RetryDecision;
}

export interface ForkAuthorizationIsolation {
  grants_copied: false;
  credentials_copied: false;
  leases_copied: false;
}

export interface ForkResult {
  work: Work;
  forked_from: NonNullable<Work["forked_from"]>;
  referenced_history: { base_work_id: string; from_seq: 1; to_seq: number; copied_as_live_events: false };
  referenced_artifacts: ReferencedArtifact[];
  inherited_effects: InheritedEffect[];
  first_checkpoint?: {
    checkpoint: Checkpoint;
    origin: { work_id: string; checkpoint_id: string; event_seq: number };
  };
  authorization: ForkAuthorizationIsolation;
  work_snapshot: WorkSnapshot;
  base_head_seq_after: number;
  fork_head_seq: number;
}

export interface CapturedIO {
  effect_id: string;
  effect_class: EffectClass;
  intent: EffectRecord["intent"];
  state: EffectRecord["state"];
  evidence_ids: string[];
  recorded_at: IsoTimestamp;
}

export interface ReplayRequest {
  work_id: string;
  mode: ReplayMode;
  /** Recorded effect on this work (often a `fork_inherited` clone). */
  effect_id: string;
  /** Fresh authorization for REEXECUTE of EXTERNAL. Must not reuse the inherited decision. */
  authorization?: NonNullable<EffectRecord["authorization"]>;
  /**
   * Optional INTERNAL re-executor. Never used for EXTERNAL (side effects are
   * not auto-applied). Absence ⇒ REEXECUTE INTERNAL returns NEED_EXECUTOR.
   */
  reexecuteInternal?: (recorded: CapturedIO) => Promise<CapturedIO>;
}

export interface ReplayResult {
  mode: ReplayMode;
  work_id: string;
  source_effect_id: string;
  captured: CapturedIO;
  /** Always false: constitution §4.6 / ADR-V4-0007. */
  auto_reapplied_external: false;
  determinism_claim: typeof REPLAY_DETERMINISM_CLAIM;
  new_effect?: EffectRecord;
  internal_reexecution?: CapturedIO | { status: "NEED_EXECUTOR" };
  replay_event_id: string;
}

export interface ForkCompare {
  base_work_id: string;
  fork_work_id: string;
  identity_distinct: boolean;
  base_head_seq: number;
  fork_head_seq: number;
  base_state?: WorkState;
  fork_state?: WorkState;
}
