/**
 * Typed effect.* domain events (EVENT_TYPE_CATALOG owner = M03).
 *
 * Freeze R2: payloads are constructed here, never copied from executor objects.
 * F12 names (`next_action`, `objective`, …) are not fields of these payloads.
 *
 * Freeze R1: this module does **not** claim hash-chain non-repudiation. When an
 * EventLedgerPort is wired, M02 assigns seq / recorded_at / chain; we only supply
 * a typed payload. If the port is absent, events stay in the in-process journal.
 */

import { DEFAULT_TENANT_ID, type ActorRef } from "../contracts/common.js";
import type { EventLedgerPort, WorkEventDraft } from "../contracts/ports.js";
import {
  WORK_EVENT_SCHEMA_VERSION,
  computeEventDigest,
  computePayloadDigest,
  type WorkEvent,
} from "../contracts/work-event.js";
import type { EffectDomainEvent, EffectPlannedPayload, EffectReconciliationPayload, EffectStateChangedPayload } from "./types.js";

const FORBIDDEN_PAYLOAD_KEYS = ["next_action", "objective", "permissions", "credentials", "verified_task_state"] as const;

export function assertNoControlFields(payload: Record<string, unknown>): void {
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(`effect event payload must not carry CONTROL field "${key}" (TM-V4-F12 / freeze R2)`);
    }
  }
}

export async function appendEffectEvent(
  port: EventLedgerPort | undefined,
  journal: EffectDomainEvent[],
  event: EffectDomainEvent,
  actor: ActorRef,
  newEventId: () => string,
): Promise<void> {
  assertNoControlFields(event.payload as unknown as Record<string, unknown>);
  journal.push(event);
  if (!port) return;

  const payload = event.payload as unknown as Record<string, unknown>;
  const head = await port.head(event.work_id);
  const prevEvents = head >= 1 ? await port.read(event.work_id, { from_seq: head, to_seq: head }) : [];
  const prev = head === 0 ? "GENESIS" : (prevEvents[0]?.event_digest ?? "GENESIS");
  const draft: Omit<WorkEvent, "seq" | "recorded_at" | "event_digest"> = {
    kind: "WorkEvent",
    schema_version: WORK_EVENT_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    event_id: newEventId(),
    work_id: event.work_id,
    type: event.type,
    type_version: 1,
    occurred_at: event.occurred_at,
    actor,
    correlation_id: event.payload.effect_id,
    prev_event_digest: prev,
    payload,
    payload_digest: computePayloadDigest(payload),
  };
  const withDigest: WorkEventDraft = {
    ...draft,
    event_digest: computeEventDigest({ ...draft, seq: head + 1, recorded_at: event.occurred_at } as WorkEvent),
  };
  await port.append(event.work_id, [withDigest], { expected_head_seq: head });
}

export type { EffectPlannedPayload, EffectReconciliationPayload, EffectStateChangedPayload };
