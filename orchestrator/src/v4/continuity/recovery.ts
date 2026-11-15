/**
 * Resume from a VERIFIED checkpoint + open effects (constitution §7.2).
 *
 * Confirmed state is whatever the Event Ledger already recorded at event_seq.
 * This module does not invent CONFIRMED progress, COMMITTED effects, or grants.
 * Tombstones (D19) keep consumed grants / terminal effects from resurrecting.
 * UNKNOWN effects are listed; retry uses M03 `retryDecision` ≡ `decideRetry`
 * and is never dispatched here (no exactly-once, WAVE3-COMMON §14).
 */

import {
  type Checkpoint,
  type CheckpointStorePort,
  type EffectLedgerPort,
  type EventLedgerPort,
} from "../contracts/index.js";
import { cloneProjection, computeStateDigest, projectEvents } from "../ledger/index.js";
import { CONTINUITY_ERROR, ContinuityError } from "./errors.js";
import type { ContinuityRecovery, TombstoneView } from "./types.js";

function stripContextHint(cp: Checkpoint): Checkpoint {
  const { context_hint: _ignored, ...rest } = cp;
  void _ignored;
  return rest;
}

export async function recoverAtVerifiedCheckpoint(input: {
  work_id: string;
  ledger: EventLedgerPort;
  checkpoints: CheckpointStorePort;
  effects: EffectLedgerPort;
  tombstones?: TombstoneView;
  checkpoint_id?: string;
}): Promise<ContinuityRecovery> {
  const checkpoint = input.checkpoint_id
    ? await input.checkpoints.get(input.checkpoint_id)
    : await input.checkpoints.latestConsistent(input.work_id);

  if (!checkpoint || checkpoint.work_id !== input.work_id) {
    throw new ContinuityError(CONTINUITY_ERROR.RECOVERY_UNVERIFIED, "no recoverable checkpoint for work", {
      work_id: input.work_id,
    });
  }
  if (checkpoint.consistency !== "VERIFIED") {
    throw new ContinuityError(CONTINUITY_ERROR.CHECKPOINT_NOT_VERIFIED, "recovery requires VERIFIED checkpoint", {
      consistency: checkpoint.consistency,
    });
  }

  const events = await input.ledger.read(input.work_id, { to_seq: checkpoint.event_seq });
  const projection = projectEvents(input.work_id, events, checkpoint.event_seq);
  const digest = computeStateDigest(projection);
  if (digest !== checkpoint.state_digest) {
    throw new ContinuityError(CONTINUITY_ERROR.DIGEST_MISMATCH, "recovery digest mismatch", {
      ledger: digest,
      checkpoint: checkpoint.state_digest,
    });
  }

  const consumed_grants = input.tombstones ? [...(await input.tombstones.consumedGrants(input.work_id))] : [];
  const terminal_effects = input.tombstones ? [...(await input.tombstones.terminalEffects(input.work_id))] : [];
  const terminalIds = new Set(terminal_effects.map((t) => t.effect_id));

  const liveOpen = await input.effects.listOpen(input.work_id);
  const open_effects = liveOpen.filter((e) => !terminalIds.has(e.effect_id));
  const unknown_effect_ids = open_effects.filter((e) => e.state === "UNKNOWN").map((e) => e.effect_id);

  const retry_decisions: ContinuityRecovery["retry_decisions"] = [];
  for (const e of open_effects) {
    retry_decisions.push({ effect_id: e.effect_id, decision: await input.effects.retryDecision(e.effect_id) });
  }

  const confirmed_task_ids = projection.task_states.filter((t) => t.state === "VERIFIED").map((t) => t.task_id);

  return {
    work_id: input.work_id,
    checkpoint: stripContextHint(checkpoint),
    event_seq: checkpoint.event_seq,
    ledger_events: events,
    projection: cloneProjection(projection),
    open_effects,
    unknown_effect_ids,
    retry_decisions,
    consumed_grants,
    terminal_effects,
    confirmed_task_ids,
    recovered_without_context_hint: true,
    recovered_without_invented_confirmed_state: true,
  };
}
