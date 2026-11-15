/**
 * Rebuildable per-work index over the hash-chained event log.
 * Broken chain / digest mismatch ⇒ UNTRUSTED; queries fail closed.
 */

import {
  checkEventStream,
  isValidId,
  validateWorkEvent,
  type WorkEvent,
} from "../contracts/index.js";
import { criterionKey, extractEvent, type ExtractedPayload } from "./extract.js";
import type { FailClosedReason, WorkStreamTrust } from "./types.js";

export interface IndexedEvent {
  event: WorkEvent;
  extracted: ExtractedPayload;
}

export interface WorkIndex extends WorkStreamTrust {
  events: IndexedEvent[];
  byEventId: Map<string, IndexedEvent>;
  byDecisionId: Map<string, IndexedEvent[]>;
  byArtifactId: Map<string, IndexedEvent[]>;
  byEffectId: Map<string, IndexedEvent[]>;
  byEvidenceId: Map<string, IndexedEvent[]>;
  byProofId: Map<string, IndexedEvent[]>;
  byGrantId: Map<string, IndexedEvent[]>;
  byApprovalId: Map<string, IndexedEvent[]>;
  byCriterion: Map<string, IndexedEvent[]>;
}

function pushMap(map: Map<string, IndexedEvent[]>, key: string | undefined, item: IndexedEvent): void {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

function emptyMaps(): Pick<
  WorkIndex,
  | "events"
  | "byEventId"
  | "byDecisionId"
  | "byArtifactId"
  | "byEffectId"
  | "byEvidenceId"
  | "byProofId"
  | "byGrantId"
  | "byApprovalId"
  | "byCriterion"
> {
  return {
    events: [],
    byEventId: new Map(),
    byDecisionId: new Map(),
    byArtifactId: new Map(),
    byEffectId: new Map(),
    byEvidenceId: new Map(),
    byProofId: new Map(),
    byGrantId: new Map(),
    byApprovalId: new Map(),
    byCriterion: new Map(),
  };
}

function untrusted(work_id: string, closed: FailClosedReason): WorkIndex {
  return {
    work_id,
    trusted: false,
    closed,
    ...emptyMaps(),
  };
}

function fillIndex(index: WorkIndex, events: readonly WorkEvent[]): void {
  for (const event of events) {
    const extracted = extractEvent(event);
    const item: IndexedEvent = { event, extracted };
    index.events.push(item);
    index.byEventId.set(event.event_id, item);
    for (const id of extracted.decision_ids) pushMap(index.byDecisionId, id, item);
    for (const id of extracted.artifact_ids) pushMap(index.byArtifactId, id, item);
    for (const id of extracted.supply_artifact_ids) pushMap(index.byArtifactId, id, item);
    for (const id of extracted.effect_ids) pushMap(index.byEffectId, id, item);
    for (const id of extracted.evidence_ids) pushMap(index.byEvidenceId, id, item);
    for (const id of extracted.proof_ids) pushMap(index.byProofId, id, item);
    for (const id of extracted.grant_ids) pushMap(index.byGrantId, id, item);
    for (const id of extracted.approval_ids) pushMap(index.byApprovalId, id, item);
    if (extracted.criterion_id && extracted.goal_contract_id && extracted.goal_contract_version !== undefined) {
      pushMap(
        index.byCriterion,
        criterionKey(extracted.goal_contract_id, extracted.goal_contract_version, extracted.criterion_id),
        item,
      );
    }
  }
}

function trustOf(work_id: string, events: readonly WorkEvent[]): { trusted: boolean; closed: FailClosedReason | null } {
  if (events.some((e) => e.work_id !== work_id)) return { trusted: false, closed: "hash_mismatch" };
  const streamIssues = checkEventStream(events);
  if (streamIssues.length > 0) {
    const chain = streamIssues.some((i) => i.code === "INV-EVT-06");
    return { trusted: false, closed: chain ? "chain_broken" : "hash_mismatch" };
  }
  for (const event of events) {
    const validation = validateWorkEvent(event);
    if (!validation.valid) {
      const digest = validation.issues.some((i) => i.code === "INV-EVT-03" || i.code === "INV-EVT-06");
      return { trusted: false, closed: digest ? "hash_mismatch" : "chain_broken" };
    }
  }
  return { trusted: true, closed: null };
}

export function indexWorkStream(work_id: string, events: readonly WorkEvent[]): WorkIndex {
  if (!isValidId("work", work_id)) return untrusted(work_id, "invalid_id");
  if (events.length === 0) {
    return {
      work_id,
      trusted: true,
      closed: null,
      ...emptyMaps(),
    };
  }
  const trust = trustOf(work_id, events);
  const index: WorkIndex = {
    work_id,
    trusted: trust.trusted,
    closed: trust.closed,
    ...emptyMaps(),
  };
  fillIndex(index, events);
  return index;
}

export const DECISION_EVENT_TYPES = new Set([
  "policy.decided",
  "approval.decided",
  "approval.requested",
  "grant.revoked",
  "policy.changed",
  "recovery.decided",
  "plan.revised",
  "goal_contract.accepted",
  "operator.command",
]);
