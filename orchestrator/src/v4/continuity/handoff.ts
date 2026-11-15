/**
 * Universal handoff: accept a verified capsule then resume at its VERIFIED
 * checkpoint. Nested `{ handoff: { permissions, next_action } }` is rejected
 * by verify (INV-CAP-07) before this function runs.
 */

import {
  OPEN_EFFECT_STATES,
  type CapsuleServicePort,
  type CheckpointStorePort,
  type EffectLedgerPort,
  type EffectState,
  type EventLedgerPort,
  type ExecutionCapsule,
  type IsoTimestamp,
} from "../contracts/index.js";
import { computeStateDigest } from "../ledger/index.js";
import { executorContextFromParsed, parseKnownFields } from "./context.js";
import { CONTINUITY_ERROR, ContinuityError } from "./errors.js";
import { recoverAtVerifiedCheckpoint } from "./recovery.js";
import type { BoundWorkState, ConformanceLookup, HandoffResult, TombstoneView } from "./types.js";

const RANK: Record<string, number> = {
  C0_OBSERVED: 0,
  C1_TASK: 1,
  C2_CONTINUITY: 2,
  C3_EFFECT_AWARE: 3,
};

export async function handoffAccept(input: {
  capsule: ExecutionCapsule;
  now: IsoTimestamp;
  policy_id: string;
  service: CapsuleServicePort;
  ledger: EventLedgerPort;
  checkpoints: CheckpointStorePort;
  effects: EffectLedgerPort;
  tombstones?: TombstoneView;
  conformance?: ConformanceLookup;
  for_executor?: string;
}): Promise<HandoffResult> {
  const min = input.capsule.compatibility.min_conformance_level;
  if (input.for_executor) {
    if (!input.conformance) {
      throw new ContinuityError(
        CONTINUITY_ERROR.CONFORMANCE,
        "handoff to a named executor requires a conformance lookup (fail-closed)",
        { executor_id: input.for_executor },
      );
    }
    const level = await input.conformance.levelOf(input.for_executor);
    if (!level || (RANK[level] ?? -1) < (RANK[min] ?? 2)) {
      throw new ContinuityError(CONTINUITY_ERROR.CONFORMANCE, "executor below capsule min_conformance_level", {
        executor_id: input.for_executor,
        level,
        min,
      });
    }
  }

  const acceptance = await input.service.accept(input.capsule, { now: input.now, policy_id: input.policy_id });
  const recovery = await recoverAtVerifiedCheckpoint({
    work_id: input.capsule.work_id,
    ledger: input.ledger,
    checkpoints: input.checkpoints,
    effects: input.effects,
    tombstones: input.tombstones,
    checkpoint_id: input.capsule.base_checkpoint.checkpoint_id,
  });

  const executor_context = executorContextFromParsed(parseKnownFields(input.capsule));
  const bound_work: BoundWorkState = {
    source: "EVENT_LEDGER",
    work_id: recovery.work_id,
    event_seq: recovery.event_seq,
    state_digest: computeStateDigest(recovery.projection),
    work_state: recovery.projection.work_state,
    tasks: recovery.projection.task_states.map((t) => ({ task_id: t.task_id, state: t.state })),
    open_effects: recovery.projection.effect_summary
      .filter((e) => (OPEN_EFFECT_STATES as readonly string[]).includes(e.state))
      .map((e) => ({ effect_id: e.effect_id, state: e.state as EffectState })),
  };

  return { acceptance, recovery, executor_context, bound_work };
}
