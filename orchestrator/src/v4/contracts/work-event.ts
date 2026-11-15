/**
 * Work Event v1 — append-only record of a transition/action (constitution §5, §6.1; ADR-V4-0003).
 * Storage owner: M02 Event Ledger. Each event type has exactly one producing meta (EVENT_TYPE_CATALOG).
 *
 * Semantics (ADR-V4-0003; TM-V4-F07):
 *   identity        = event_id
 *   ordering        = per-work contiguous `seq` (timestamps NEVER order)
 *   dedup           = same event_id + same payload_digest is a duplicate; different digest is a conflict
 *   causality       = causation_id / correlation_id
 *   tamper-evidence = hash chain `prev_event_digest` → `event_digest`
 *   immutability    = events are never updated or deleted (compaction via checkpoints + archive)
 */

import {
  type ContractHeader,
  type ActorRef,
  type IsoTimestamp,
  type Sha256Hex,
  isSha256,
  sha256Canonical,
  validateWith,
  type ValidationResult,
} from "./common.js";
import { FORBIDDEN_SELF_TRUST_FIELDS, rejectForbiddenFields } from "./field-class.js";

export const WORK_EVENT_SCHEMA_VERSION = "1.0.0";

export type MetaId =
  | "M00" | "M01" | "M02" | "M03" | "M04" | "M05" | "M06" | "M07" | "M08" | "M09" | "M10"
  | "M11" | "M12" | "M13" | "M14" | "M15" | "M16" | "M17" | "M18" | "M19" | "M20";

/**
 * Event type registry v1. Types are `<aggregate>.<verb>`; payload versions evolve via `type_version`.
 * Adding a type = minor; changing a payload incompatibly = new type_version (ADR-V4-0001).
 * `x.<meta>.<name>` is reserved for experimental, non-authoritative events.
 * Payload *schemas* are owned by the producing meta. They MUST NOT put executor-authored
 * CONTROL into payload (ADR-V4-0017); `next_action` / `objective` as authority are forbidden
 * (TM-V4-F12). Header-level self-trust fields are rejected by `validateWorkEvent` (INV-EVT-05).
 */
export const EVENT_TYPE_CATALOG = {
  "work.created": { owner: "M01" },
  "work.state_changed": { owner: "M01" },
  "work.forked": { owner: "M05" },
  "goal_contract.versioned": { owner: "M01" },
  "goal_contract.accepted": { owner: "M01" },
  "task.planned": { owner: "M01" },
  "task.state_changed": { owner: "M01" },
  "plan.revised": { owner: "M07" },
  "execution.scheduled": { owner: "M13" },
  "execution.state_changed": { owner: "M13" },
  "execution.failure_classified": { owner: "M04" },
  "checkpoint.created": { owner: "M02" },
  "capsule.sealed": { owner: "M04" },
  "handoff.requested": { owner: "M04" },
  "handoff.accepted": { owner: "M04" },
  "recovery.started": { owner: "M04" },
  "recovery.decided": { owner: "M04" },
  "effect.planned": { owner: "M03" },
  "effect.state_changed": { owner: "M03" },
  "effect.reconciliation_attempted": { owner: "M03" },
  "artifact.registered": { owner: "M02" },
  "evidence.recorded": { owner: "M06" },
  "proof.issued": { owner: "M06" },
  "policy.decided": { owner: "M10" },
  "policy.changed": { owner: "M10" },
  "approval.requested": { owner: "M10" },
  "approval.decided": { owner: "M10" },
  "grant.revoked": { owner: "M10" },
  "replay.started": { owner: "M05" },
  "operator.command": { owner: "M15" },
} as const satisfies Record<string, { owner: MetaId }>;

export type WorkEventType = keyof typeof EVENT_TYPE_CATALOG;

export function isKnownEventType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPE_CATALOG, type) || /^x\.m\d{2}\.[a-z0-9_.]+$/.test(type);
}

export interface WorkEvent<P extends Record<string, unknown> = Record<string, unknown>> extends ContractHeader<"WorkEvent"> {
  event_id: string;
  work_id: string;
  /** Per-work contiguous sequence assigned by the ledger on append (starts at 1). */
  seq: number;
  type: string;
  type_version: number;
  occurred_at: IsoTimestamp;
  recorded_at: IsoTimestamp;
  actor: ActorRef;
  correlation_id: string;
  causation_id?: string;
  idempotency_key?: string;
  /** V3.7 fencing binding; the ledger rejects appends with a stale epoch (ADR-V4-0004). */
  fencing?: { lease_id: string; fencing_epoch: number };
  payload: P;
  payload_digest: string;
  /**
   * Tamper-evidence chain (INV-EVT-06). Seq 1 is `"GENESIS"`; every later event cites
   * the previous event's `event_digest`. Edits, deletions and reordering are detectable
   * by an independent verifier (M06/M20) without trusting the storage layer.
   */
  prev_event_digest: Sha256Hex | "GENESIS";
  /** sha256 of canonical JSON of this event excluding `event_digest` itself. */
  event_digest: Sha256Hex;
}

export function computePayloadDigest(payload: Record<string, unknown>): string {
  return sha256Canonical(payload);
}

/** Hash-chain digest (INV-EVT-06). Drop `event_digest` so the field is not self-referential. */
export function computeEventDigest(event: Omit<WorkEvent, "event_digest"> | WorkEvent): Sha256Hex {
  const { event_digest: _ignored, ...body } = event as WorkEvent;
  void _ignored;
  return sha256Canonical(body);
}

export function validateWorkEvent(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("WorkEvent");
    c.id("event_id", "event");
    c.id("work_id", "work");
    c.integer("seq", 1);
    const type = c.string("type");
    if (type) c.ensure(isKnownEventType(type), "INV-EVT-04", "type", `unregistered event type ${type}`);
    c.integer("type_version", 1);
    c.timestamp("occurred_at");
    c.timestamp("recorded_at");
    c.nested("actor", (cc) => {
      cc.oneOf("kind", ["PLATFORM", "EXECUTOR", "HUMAN", "POLICY_ENGINE", "VERIFIER"] as const);
      cc.string("id");
    });
    c.string("correlation_id");
    c.string("causation_id", { optional: true });
    c.string("idempotency_key", { optional: true });
    c.nested(
      "fencing",
      (cc) => {
        cc.string("lease_id");
        cc.integer("fencing_epoch", 0);
      },
      { optional: true },
    );
    const payload = c.record("payload");
    const digest = c.get("payload_digest");
    c.ensure(isSha256(digest), "STRUCT", "payload_digest", "must be sha256");
    if (payload && isSha256(digest)) {
      c.ensure(computePayloadDigest(payload) === digest, "INV-EVT-03", "payload_digest", "payload digest mismatch (mutated event?)");
    }
    const prev = c.get("prev_event_digest");
    const seq = c.get("seq");
    if (seq === 1) {
      c.ensure(prev === "GENESIS", "INV-EVT-06", "prev_event_digest", "seq 1 must have prev_event_digest GENESIS");
    } else {
      c.ensure(
        prev === "GENESIS" || isSha256(prev),
        "INV-EVT-06",
        "prev_event_digest",
        'prev_event_digest must be "GENESIS" or sha256',
      );
      if (typeof seq === "number" && seq > 1) {
        c.ensure(isSha256(prev), "INV-EVT-06", "prev_event_digest", "seq > 1 cannot use GENESIS");
      }
    }
    const eventDigest = c.get("event_digest");
    c.ensure(isSha256(eventDigest), "INV-EVT-06", "event_digest", "event_digest must be sha256");
    if (isSha256(eventDigest)) {
      let computed: string | null = null;
      try {
        computed = computeEventDigest(c.value() as unknown as WorkEvent);
      } catch {
        computed = null;
      }
      c.ensure(computed === eventDigest, "INV-EVT-06", "event_digest", "event digest mismatch (tampered or non-canonical)");
    }
    rejectForbiddenFields(c, FORBIDDEN_SELF_TRUST_FIELDS, "INV-EVT-05", (f) => `self-asserted trust field "${f}" is forbidden (ADR-V4-0017)`);
    if (payload) {
      for (const f of FORBIDDEN_SELF_TRUST_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(payload, f)) {
          c.fail("INV-EVT-05", `payload.${f}`, `self-asserted trust field "${f}" is forbidden in event payload (ADR-V4-0017)`);
        }
      }
    }
  });
}

export interface StreamIssue {
  code: "INV-EVT-01" | "INV-EVT-02" | "INV-EVT-06";
  seq: number;
  message: string;
}

/**
 * Stream invariants for one work: contiguous seq from 1 (INV-EVT-01), event_id uniqueness
 * with digest-consistent duplicates only (INV-EVT-02), and hash-chain integrity (INV-EVT-06).
 */
export function checkEventStream(
  events: readonly Pick<WorkEvent, "event_id" | "seq" | "work_id" | "payload_digest" | "prev_event_digest" | "event_digest">[],
): StreamIssue[] {
  const issues: StreamIssue[] = [];
  const seen = new Map<string, string>();
  const workIds = new Set(events.map((e) => e.work_id));
  if (workIds.size > 1) issues.push({ code: "INV-EVT-01", seq: 0, message: "stream mixes works" });
  events.forEach((e, i) => {
    if (e.seq !== i + 1) issues.push({ code: "INV-EVT-01", seq: e.seq, message: `expected seq ${i + 1}` });
    const prior = seen.get(e.event_id);
    if (prior !== undefined) {
      issues.push({
        code: "INV-EVT-02",
        seq: e.seq,
        message: prior === e.payload_digest ? "duplicate event persisted twice" : "event_id reused with different payload",
      });
    }
    seen.set(e.event_id, e.payload_digest);
    if (i === 0) {
      if (e.prev_event_digest !== "GENESIS") {
        issues.push({ code: "INV-EVT-06", seq: e.seq, message: "seq 1 must have prev_event_digest GENESIS" });
      }
    } else if (e.prev_event_digest !== events[i - 1].event_digest) {
      issues.push({
        code: "INV-EVT-06",
        seq: e.seq,
        message: "hash chain broken (prev_event_digest does not match previous event_digest)",
      });
    }
  });
  return issues;
}
