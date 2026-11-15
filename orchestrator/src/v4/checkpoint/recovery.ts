/**
 * Crash recovery (constitution §7.2, ADR-V4-0004/0005).
 *
 * Load last recoverable state from the log (source of truth), optionally
 * pinned by latestConsistent. context_hint is never required. Tombstones
 * prevent restore from resurrecting consumed grants / rolling back terminal
 * effects (D19).
 */

import { checkEventStream, type StreamIssue } from "../contracts/work-event.js";
import type { Checkpoint } from "../contracts/checkpoint.js";
import type { EventLedgerPort } from "../contracts/ports.js";
import { FileEventLedger } from "../ledger/event-ledger.js";
import { FencingWatermarkStore } from "../ledger/fencing.js";
import { cloneProjection, projectEvents, type LedgerProjection } from "../ledger/projection.js";
import { TombstoneStore } from "../ledger/tombstones.js";
import { FileCheckpointStore } from "./checkpoint-store.js";

export interface RecoveredState {
  work_id: string;
  projection: LedgerProjection;
  checkpoint?: Checkpoint;
  stream_issues: StreamIssue[];
  consumed_grants: string[];
  recovered_without_context_hint: true;
}

export async function recoverWork(input: {
  work_id: string;
  ledger: EventLedgerPort;
  checkpoints: FileCheckpointStore;
  tombstones: TombstoneStore;
}): Promise<RecoveredState> {
  const events = await input.ledger.read(input.work_id);
  const stream_issues = checkEventStream(events);
  let projection =
    input.ledger instanceof FileEventLedger
      ? await input.ledger.rebuildProjection(input.work_id)
      : projectEvents(input.work_id, events);

  const tombstones = await input.tombstones.list(input.work_id);
  projection = input.tombstones.applyToProjection(projection, tombstones);

  const latest = await input.checkpoints.latestConsistent(input.work_id);
  const checkpoint = latest ? input.checkpoints.withoutContextHint(latest) : undefined;

  return {
    work_id: input.work_id,
    projection: cloneProjection(projection),
    checkpoint,
    stream_issues,
    consumed_grants: [...input.tombstones.consumedGrants(tombstones)],
    recovered_without_context_hint: true,
  };
}

export async function restoreWorkDir(input: {
  work_id: string;
  liveRoot: string;
  restoredRoot: string;
  ledger: EventLedgerPort;
  checkpoints: FileCheckpointStore;
  tombstones: TombstoneStore;
  clock?: () => string;
}): Promise<RecoveredState> {
  const now = (input.clock ?? (() => new Date().toISOString()))();
  const restoredTombs = new TombstoneStore(input.restoredRoot);
  await input.tombstones.mergeFrom(restoredTombs, input.work_id);
  new FencingWatermarkStore(input.liveRoot).mergeFrom(new FencingWatermarkStore(input.restoredRoot), input.work_id, now);
  return recoverWork(input);
}
