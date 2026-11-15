/**
 * WorkEvent drafts for M01 producers. The ledger (M02, or the isolation buffer)
 * assigns `seq` and `recorded_at` and recomputes `event_digest` / hash chain.
 * Hash chain is tamper-evidence, not non-repudiation (R1).
 */

import {
  DEFAULT_TENANT_ID,
  WORK_EVENT_SCHEMA_VERSION,
  computePayloadDigest,
  type ActorRef,
  type IsoTimestamp,
  type Sha256Hex,
  type WorkEventDraft,
} from "../contracts/index.js";
import type { M01EventType } from "./payloads.js";

const PLACEHOLDER_DIGEST = "0".repeat(64) as Sha256Hex;

export function draftM01Event(input: {
  event_id: string;
  work_id: string;
  type: M01EventType;
  occurred_at: IsoTimestamp;
  actor: ActorRef;
  correlation_id: string;
  causation_id?: string;
  payload: Record<string, unknown>;
}): WorkEventDraft {
  const payload_digest = computePayloadDigest(input.payload);
  return {
    kind: "WorkEvent",
    schema_version: WORK_EVENT_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    event_id: input.event_id,
    work_id: input.work_id,
    type: input.type,
    type_version: 1,
    occurred_at: input.occurred_at,
    actor: input.actor,
    correlation_id: input.correlation_id,
    causation_id: input.causation_id,
    payload: input.payload,
    payload_digest,
    prev_event_digest: "GENESIS",
    event_digest: PLACEHOLDER_DIGEST,
  };
}
