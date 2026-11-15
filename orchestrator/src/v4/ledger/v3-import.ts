/**
 * Optional importer for historical V3 JSONL events (ADR-V4-0003).
 *
 * Imported records are appended as experimental `x.m02.v3_imported` and are
 * non-authoritative: they do not mutate the projection. V3 ids that fail the
 * V4 grammar are rejected (ADR-V4-0015) rather than used as path components.
 */

import { randomUUID } from "node:crypto";
import {
  DEFAULT_TENANT_ID,
  isValidId,
  type ActorRef,
} from "../contracts/common.js";
import { computePayloadDigest, WORK_EVENT_SCHEMA_VERSION } from "../contracts/work-event.js";
import type { WorkEventDraft } from "../contracts/ports.js";

export const V3_IMPORTED_EVENT_TYPE = "x.m02.v3_imported";

export interface V3HistoricalEvent {
  work_id: string;
  type: string;
  payload?: Record<string, unknown>;
  ts?: string;
  actor?: string;
}

export function draftV3Imported(
  work_id: string,
  source: V3HistoricalEvent,
  opts?: { occurred_at?: string; actor?: ActorRef },
): WorkEventDraft | { error: string } {
  if (!isValidId("work", work_id)) return { error: "invalid_work_id" };
  if (isValidId("work", source.work_id) && source.work_id !== work_id) {
    return { error: "work_mismatch" };
  }
  const payload = {
    source_type: source.type,
    source_work_id: source.work_id,
    source_payload: source.payload ?? {},
    imported: true,
    authoritative: false,
  };
  const occurred_at = opts?.occurred_at ?? source.ts ?? new Date().toISOString();
  return {
    kind: "WorkEvent",
    schema_version: WORK_EVENT_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    event_id: `evt_${randomUUID()}`,
    work_id,
    type: V3_IMPORTED_EVENT_TYPE,
    type_version: 1,
    occurred_at,
    actor: opts?.actor ?? { kind: "PLATFORM", id: "v4-m02-v3-import" },
    correlation_id: "v3-import",
    payload,
    payload_digest: computePayloadDigest(payload),
    prev_event_digest: "GENESIS",
    event_digest: "0".repeat(64),
  };
}
