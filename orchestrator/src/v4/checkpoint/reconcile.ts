/**
 * Checkpoint reconciliation (ADR-V4-0005, INV-CKPT-*).
 *
 * VERIFIED only when the high-water mark is in the log, every artifact ref
 * resolves with a matching hash, open effects are listed, and state_digest
 * matches the projection at that seq. context_hint is ignored (INV-CKPT-02).
 */

import {
  checkCheckpointAgainst,
  openEffects,
  validateCheckpoint,
  type Checkpoint,
  type CheckpointConsistency,
} from "../contracts/checkpoint.js";
import type { ArtifactStorePort } from "../contracts/ports.js";
import { computeStateDigest, openEffectIds, type LedgerProjection } from "../ledger/projection.js";

export interface ReconcileReport {
  consistency: CheckpointConsistency;
  problems: string[];
}

export async function reconcileCheckpoint(
  checkpoint: Checkpoint,
  ctx: {
    projection: LedgerProjection;
    last_event_seq: number;
    artifacts: ArtifactStorePort;
  },
): Promise<ReconcileReport> {
  const problems: string[] = [];
  const schema = validateCheckpoint(checkpoint);
  if (!schema.valid) {
    for (const i of schema.issues) problems.push(`${i.code}:${i.path}`);
  }

  const hashes = new Set(ctx.projection.artifact_refs.map((a) => a.sha256));
  problems.push(
    ...checkCheckpointAgainst(checkpoint, {
      work_id: ctx.projection.work_id,
      last_event_seq: ctx.last_event_seq,
      available_artifact_hashes: hashes,
    }),
  );

  for (const ref of checkpoint.artifact_refs) {
    const v = await ctx.artifacts.verify(ref);
    if (v === "MISSING") problems.push(`INV-CKPT-03:missing_artifact:${ref.sha256}`);
    if (v === "MISMATCH") problems.push(`INV-CKPT-03:hash_mismatch:${ref.sha256}`);
  }

  const expectedOpen = new Set(openEffectIds(ctx.projection));
  const listedOpen = new Set(openEffects(checkpoint));
  for (const id of expectedOpen) {
    if (!listedOpen.has(id)) problems.push(`INV-CKPT-04:missing_open_effect:${id}`);
  }

  const expectedDigest = computeStateDigest(ctx.projection);
  if (checkpoint.state_digest !== expectedDigest) {
    problems.push("INV-CKPT-05:state_digest_mismatch");
  }

  if (checkpoint.event_seq !== ctx.projection.event_seq) {
    problems.push("INV-CKPT-01:projection_seq_mismatch");
  }

  // INV-CKPT-02: context_hint is intentionally not consulted.
  const consistency: CheckpointConsistency = problems.length === 0 ? "VERIFIED" : "INCONSISTENT";
  return { consistency, problems };
}
