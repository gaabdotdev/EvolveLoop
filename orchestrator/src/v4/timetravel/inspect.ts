/**
 * Read-only time-travel inspect over the M02 event log (ADR-V4-0007).
 * Never appends to the inspected work. Timestamps never order (ADR-V4-0003).
 */

import {
  isSha256,
  isValidId,
  type AppendOutcome,
  type ArtifactStorePort,
  type Checkpoint,
  type CheckpointStorePort,
  type EventLedgerPort,
  type WorkEvent,
  type WorkEventDraft,
} from "../contracts/index.js";
import { M01_EVENT_TYPES, applyEvents, emptyProjection, type WorkProjection } from "../work/index.js";
import { projectEvents, type LedgerProjection } from "../ledger/index.js";
import { TIMETRAVEL_ERROR, TimeTravelError } from "./errors.js";
import type { InspectQuery, InspectionView, ReferencedArtifact, TimeTravelDeps, TimelineEntry } from "./types.js";

class InspectOnlyLedger implements EventLedgerPort {
  constructor(private readonly inner: EventLedgerPort) {}

  async append(_work_id: string, _drafts: WorkEventDraft[], _opts: { expected_head_seq: number }): Promise<AppendOutcome> {
    throw new TimeTravelError(
      TIMETRAVEL_ERROR.INSPECT_READONLY,
      "time-travel inspect must not append to the event log",
    );
  }

  read(work_id: string, opts?: { from_seq?: number; to_seq?: number }): Promise<WorkEvent[]> {
    return this.inner.read(work_id, opts);
  }

  head(work_id: string): Promise<number> {
    return this.inner.head(work_id);
  }
}

function isM01Type(type: string): boolean {
  return (M01_EVENT_TYPES as readonly string[]).includes(type);
}

export function projectReferencedHistory(work_id: string, events: readonly WorkEvent[]): WorkProjection {
  const proj = emptyProjection();
  const m01 = events.filter((e) => e.work_id === work_id && isM01Type(e.type));
  applyEvents(proj, m01);
  return proj;
}

export async function resolveCheckpoint(
  checkpoints: CheckpointStorePort,
  query: InspectQuery,
): Promise<Checkpoint | undefined> {
  if (!query.checkpoint_id) return undefined;
  if (!isValidId("checkpoint", query.checkpoint_id)) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "checkpoint_id failed isValidId", {
      checkpoint_id: query.checkpoint_id,
    });
  }
  const cp = await checkpoints.get(query.checkpoint_id);
  if (!cp) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.NOT_FOUND, "checkpoint not found", {
      checkpoint_id: query.checkpoint_id,
    });
  }
  if (cp.work_id !== query.work_id) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "checkpoint does not belong to this work", {
      checkpoint_id: query.checkpoint_id,
      work_id: query.work_id,
      checkpoint_work_id: cp.work_id,
    });
  }
  return cp;
}

export function collectArtifactRefs(
  checkpoint: Checkpoint | undefined,
  ledgerProjection: LedgerProjection,
): Array<{ sha256: string; size_bytes?: number; media_type?: string }> {
  const byHash = new Map<string, { sha256: string; size_bytes?: number; media_type?: string }>();
  for (const ref of checkpoint?.artifact_refs ?? []) {
    if (isSha256(ref.sha256)) byHash.set(ref.sha256, { ...ref });
  }
  for (const ref of ledgerProjection.artifact_refs) {
    if (isSha256(ref.sha256) && !byHash.has(ref.sha256)) byHash.set(ref.sha256, { ...ref });
  }
  return [...byHash.values()];
}

export async function verifyArtifactRefs(
  artifacts: ArtifactStorePort | undefined,
  refs: Array<{ sha256: string; size_bytes?: number; media_type?: string }>,
): Promise<ReferencedArtifact[]> {
  const out: ReferencedArtifact[] = [];
  for (const ref of refs) {
    if (!artifacts) {
      out.push({ ...ref, verify: "UNCHECKED" });
      continue;
    }
    const verify = await artifacts.verify({ sha256: ref.sha256, size_bytes: ref.size_bytes, media_type: ref.media_type });
    out.push({ ...ref, verify });
  }
  return out;
}

export function toTimeline(events: readonly WorkEvent[]): TimelineEntry[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      seq: e.seq,
      event_id: e.event_id,
      type: e.type,
      occurred_at: e.occurred_at,
      recorded_at: e.recorded_at,
      actor: e.actor,
    }));
}

export async function inspectWork(deps: TimeTravelDeps, query: InspectQuery): Promise<InspectionView> {
  if (!isValidId("work", query.work_id)) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "work_id failed isValidId", { work_id: query.work_id });
  }
  if (query.at_seq !== undefined && (!Number.isInteger(query.at_seq) || query.at_seq < 1)) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "at_seq must be an integer >= 1", { at_seq: query.at_seq });
  }

  const ledger = new InspectOnlyLedger(deps.ledger);
  const head_seq = await ledger.head(query.work_id);
  const checkpoint = await resolveCheckpoint(deps.checkpoints, query);
  const at_seq = checkpoint?.event_seq ?? query.at_seq ?? (head_seq >= 1 ? head_seq : 0);

  if (at_seq > head_seq) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "inspect seq is beyond log head", {
      at_seq,
      head_seq,
    });
  }

  const events = at_seq < 1 ? [] : await ledger.read(query.work_id, { to_seq: at_seq });
  const ledger_projection = projectEvents(query.work_id, events, at_seq >= 1 ? at_seq : undefined);
  const workProj = projectReferencedHistory(query.work_id, events);
  const referenced_artifacts = await verifyArtifactRefs(
    deps.artifacts,
    collectArtifactRefs(checkpoint, ledger_projection),
  );

  const head_after = await ledger.head(query.work_id);
  if (head_after !== head_seq) {
    throw new TimeTravelError(
      TIMETRAVEL_ERROR.INSPECT_READONLY,
      "log head changed during inspect; inspect itself does not append",
      { head_seq, head_after },
    );
  }

  return {
    work_id: query.work_id,
    at_seq,
    head_seq,
    mutated_log: false,
    checkpoint,
    events,
    timeline: toTimeline(events),
    ledger_projection,
    work: workProj.work,
    work_snapshot: {
      work: workProj.work,
      goals: [...workProj.goals.values()].sort((a, b) => a.version - b.version),
      tasks: [...workProj.tasks.values()],
      accepted_version: workProj.accepted_version,
    },
    referenced_artifacts,
    order_key: "seq",
  };
}
