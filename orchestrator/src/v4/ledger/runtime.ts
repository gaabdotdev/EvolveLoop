/**
 * Compose M02 stores for a data-dir. Wiring only; M19 owns process-wide composition.
 */

import { randomUUID } from "node:crypto";
import type { V37ArtifactPort, V37LeaseFencingPort } from "../contracts/adapters-v37.js";
import type { Artifact } from "../contracts/artifact.js";
import type { AppendOutcome, WorkEventDraft } from "../contracts/ports.js";
import { DEFAULT_TENANT_ID } from "../contracts/common.js";
import { computePayloadDigest, WORK_EVENT_SCHEMA_VERSION } from "../contracts/work-event.js";
import { FileArtifactStore } from "../artifacts/artifact-store.js";
import { FileCheckpointStore } from "../checkpoint/checkpoint-store.js";
import { FileEventLedger, type Clock } from "./event-ledger.js";
import { TombstoneStore } from "./tombstones.js";

export interface M02RuntimeOptions {
  root: string;
  clock?: Clock;
  leases?: V37LeaseFencingPort;
  v37Artifacts?: V37ArtifactPort;
}

export interface M02Runtime {
  root: string;
  ledger: FileEventLedger;
  artifacts: FileArtifactStore;
  checkpoints: FileCheckpointStore;
  tombstones: TombstoneStore;
}

export function openM02(opts: M02RuntimeOptions): M02Runtime {
  const ledger = new FileEventLedger({
    root: opts.root,
    clock: opts.clock,
    leases: opts.leases,
  });
  const artifacts = new FileArtifactStore({
    root: opts.root,
    clock: opts.clock,
    v37: opts.v37Artifacts,
  });
  const checkpoints = new FileCheckpointStore({
    root: opts.root,
    ledger,
    artifacts,
    clock: opts.clock,
  });
  const tombstones = new TombstoneStore(opts.root);
  return { root: opts.root, ledger, artifacts, checkpoints, tombstones };
}

/** Write-then-reference helper (ADR-V4-0004 sequence constraint 1). */
export async function putAndRegisterArtifact(
  runtime: M02Runtime,
  input: { work_id: string; bytes: Uint8Array; media_type: string; origin: Artifact["origin"] },
): Promise<{ artifact: Artifact; outcome: AppendOutcome }> {
  const artifact = await runtime.artifacts.put(input);
  const payload = {
    artifact_id: artifact.artifact_id,
    content: {
      sha256: artifact.content.sha256,
      size_bytes: artifact.content.size_bytes,
      media_type: artifact.content.media_type,
    },
  };
  const head = await runtime.ledger.head(input.work_id);
  const draft: WorkEventDraft = {
    kind: "WorkEvent",
    schema_version: WORK_EVENT_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    event_id: `evt_${randomUUID()}`,
    work_id: input.work_id,
    type: "artifact.registered",
    type_version: 1,
    occurred_at: artifact.created_at,
    actor: { kind: "PLATFORM", id: "v4-m02-artifacts" },
    correlation_id: artifact.artifact_id,
    payload,
    payload_digest: computePayloadDigest(payload),
    prev_event_digest: "GENESIS",
    event_digest: "0".repeat(64),
  };
  const outcome = await runtime.ledger.append(input.work_id, [draft], { expected_head_seq: head });
  return { artifact, outcome };
}
