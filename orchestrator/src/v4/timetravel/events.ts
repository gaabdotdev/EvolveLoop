/**
 * WorkEvent drafts for M05 producers (`work.forked`, `replay.started`).
 * M02 assigns seq / recorded_at / hash chain. Chain is tamper-evidence, not
 * non-repudiation (R1).
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
import { allocateId } from "../goal/ids.js";
import {
  allowlistM05Payload,
  assertNoControlFields,
  type M05EventType,
} from "./payloads.js";

const PLACEHOLDER_DIGEST = "0".repeat(64) as Sha256Hex;

export function draftM05Event(input: {
  work_id: string;
  type: M05EventType;
  occurred_at: IsoTimestamp;
  actor: ActorRef;
  correlation_id: string;
  causation_id?: string;
  payload: Record<string, unknown>;
  event_id?: string;
}): WorkEventDraft {
  assertNoControlFields(input.payload);
  const payload = allowlistM05Payload(input.type, input.payload);
  assertNoControlFields(payload);
  return {
    kind: "WorkEvent",
    schema_version: WORK_EVENT_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    event_id: input.event_id ?? allocateId("event"),
    work_id: input.work_id,
    type: input.type,
    type_version: 1,
    occurred_at: input.occurred_at,
    actor: input.actor,
    correlation_id: input.correlation_id,
    causation_id: input.causation_id,
    payload,
    payload_digest: computePayloadDigest(payload),
    prev_event_digest: "GENESIS",
    event_digest: PLACEHOLDER_DIGEST,
  };
}
