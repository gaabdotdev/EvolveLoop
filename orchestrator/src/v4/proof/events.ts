/**
 * M06-owned event payloads for `evidence.recorded` and `proof.issued`.
 * Typed DATA — no CONTROL, no self-asserted trust, no confidence (ADR-V4-0017, F09, F16).
 */

import {
  computePayloadDigest,
  DEFAULT_TENANT_ID,
  sha256Canonical,
  WORK_EVENT_SCHEMA_VERSION,
  type ActorRef,
  type EvidenceMethodKind,
  type EvidenceResult,
  type IsoTimestamp,
  type ProofStatus,
  type WorkEventDraft,
} from "../contracts/index.js";

export interface EvidenceRecordedPayload {
  evidence_id: string;
  work_id: string;
  criterion_id?: string;
  evidence_kind: string;
  method_kind: EvidenceMethodKind;
  result: EvidenceResult;
}

export interface ProofIssuedPayload {
  proof_id: string;
  work_id: string;
  final_status: ProofStatus;
  goal_contract_id: string;
  goal_contract_version: number;
}

export function evidenceRecordedDraft(input: {
  event_id: string;
  work_id: string;
  occurred_at: IsoTimestamp;
  actor: ActorRef;
  correlation_id: string;
  prev_event_digest: WorkEventDraft["prev_event_digest"];
  payload: EvidenceRecordedPayload;
}): WorkEventDraft {
  return proofEventDraft({ ...input, type: "evidence.recorded" });
}

export function proofIssuedDraft(input: {
  event_id: string;
  work_id: string;
  occurred_at: IsoTimestamp;
  actor: ActorRef;
  correlation_id: string;
  prev_event_digest: WorkEventDraft["prev_event_digest"];
  payload: ProofIssuedPayload;
}): WorkEventDraft {
  return proofEventDraft({ ...input, type: "proof.issued" });
}

function proofEventDraft(input: {
  event_id: string;
  work_id: string;
  type: "evidence.recorded" | "proof.issued";
  occurred_at: IsoTimestamp;
  actor: ActorRef;
  correlation_id: string;
  prev_event_digest: WorkEventDraft["prev_event_digest"];
  payload: EvidenceRecordedPayload | ProofIssuedPayload;
}): WorkEventDraft {
  const payload = { ...input.payload } as Record<string, unknown>;
  const draft: WorkEventDraft = {
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
    payload,
    payload_digest: computePayloadDigest(payload),
    prev_event_digest: input.prev_event_digest,
    event_digest: "0".repeat(64),
  };
  const { event_digest: _ignored, ...body } = draft;
  void _ignored;
  return { ...draft, event_digest: sha256Canonical(body) };
}
