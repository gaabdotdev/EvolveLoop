/**
 * Effect Record v1 — internal/external side effect with explicit confirmation state
 * (constitution §4.4, §7.3; ADR-V4-0008). Producer: M03 Effect Ledger.
 *
 * NO EXACTLY-ONCE CLAIM. The platform offers at-most-once *dispatch decisions* per
 * effect_id plus idempotency keys, reconciliation and compensation where the target
 * integration supports them. UNKNOWN blocks blind retry.
 */

import {
  type ContractHeader,
  type ExecutorRef,
  type IsoTimestamp,
  type Sha256Hex,
  isAllowedTransition,
  isSha256,
  validateWith,
  type ValidationResult,
} from "./common.js";

export const EFFECT_RECORD_SCHEMA_VERSION = "1.0.0";

/**
 * Semantics (normative, ADR-V4-0008):
 * - PLANNED       intent recorded; nothing authorized or sent.
 * - AUTHORIZED    a PolicyDecision (and approval, if required) permits dispatch.
 * - DISPATCHED    the request may have left the platform boundary; outcome not yet observed.
 * - COMMITTED     positive evidence the effect took place at the target.
 * - REJECTED      positive evidence the target refused / did not apply it.
 * - NOT_EXECUTED  positive knowledge it never reached the target (never dispatched, or provably not delivered).
 * - UNKNOWN       possibly delivered; neither COMMITTED nor REJECTED/NOT_EXECUTED can be shown.
 * - PARTIAL       evidence that only part of a multi-part effect applied.
 * - ESCALATED     reconciliation exhausted; human/authorized resolution required. No automatic action.
 * - COMPENSATED   a linked compensating effect COMMITTED and neutralised this effect.
 */
export type EffectState =
  | "PLANNED"
  | "AUTHORIZED"
  | "DISPATCHED"
  | "COMMITTED"
  | "REJECTED"
  | "NOT_EXECUTED"
  | "UNKNOWN"
  | "PARTIAL"
  | "ESCALATED"
  | "COMPENSATED";

export const EFFECT_STATES: readonly EffectState[] = [
  "PLANNED",
  "AUTHORIZED",
  "DISPATCHED",
  "COMMITTED",
  "REJECTED",
  "NOT_EXECUTED",
  "UNKNOWN",
  "PARTIAL",
  "ESCALATED",
  "COMPENSATED",
];

export const EFFECT_TRANSITIONS: Readonly<Record<EffectState, readonly EffectState[]>> = {
  PLANNED: ["AUTHORIZED", "NOT_EXECUTED"],
  AUTHORIZED: ["DISPATCHED", "NOT_EXECUTED"],
  DISPATCHED: ["COMMITTED", "REJECTED", "UNKNOWN", "PARTIAL", "NOT_EXECUTED"],
  UNKNOWN: ["COMMITTED", "REJECTED", "NOT_EXECUTED", "PARTIAL", "ESCALATED"],
  PARTIAL: ["COMMITTED", "COMPENSATED", "ESCALATED"],
  ESCALATED: ["COMMITTED", "REJECTED", "NOT_EXECUTED", "PARTIAL", "COMPENSATED"],
  COMMITTED: ["COMPENSATED"],
  REJECTED: [],
  NOT_EXECUTED: [],
  COMPENSATED: [],
};

/** Transitions out of these states must cite observed evidence (INV-EFF-03). */
export const EFFECT_STATES_REQUIRING_EVIDENCE_TO_LEAVE: readonly EffectState[] = ["DISPATCHED", "UNKNOWN", "ESCALATED", "PARTIAL"];

/** States that are "open": a checkpoint/capsule must declare them (INV-CKPT-04, INV-CAP-04). */
export const OPEN_EFFECT_STATES: readonly EffectState[] = ["AUTHORIZED", "DISPATCHED", "UNKNOWN", "PARTIAL", "ESCALATED"];

export type EffectClass = "INTERNAL" | "EXTERNAL";

/** What the target integration can guarantee; drives retry/reconciliation (ADR-V4-0008). */
export interface IntegrationCapabilities {
  supports_idempotency_key: boolean;
  supports_status_query: boolean;
  supports_compensation: boolean;
}

export interface ReconciliationAttempt {
  at: IsoTimestamp;
  method: "STATUS_QUERY" | "IDEMPOTENT_REPLAY" | "MANUAL_INSPECTION" | "EXTERNAL_EVIDENCE";
  observed: string;
  evidence_ids: string[];
  outcome: "CONFIRMED_COMMITTED" | "CONFIRMED_REJECTED" | "CONFIRMED_NOT_EXECUTED" | "CONFIRMED_PARTIAL" | "INCONCLUSIVE";
}

export interface EffectRecord extends ContractHeader<"EffectRecord"> {
  effect_id: string;
  work_id: string;
  task_id: string;
  execution_id: string;
  executor_ref: ExecutorRef;
  effect_class: EffectClass;
  intent: { action: string; target_resource: string; parameters_digest: Sha256Hex; description: string };
  integration: { integration_id: string; capabilities: IntegrationCapabilities };
  authorization?: { policy_decision_id: string; approval_id?: string };
  idempotency_key?: string;
  state: EffectState;
  evidence_ids: string[];
  reconciliation: ReconciliationAttempt[];
  compensation?: { compensating_effect_id?: string; compensates_effect_id?: string };
  /** True when created inside a fork/replay; external dispatch then needs fresh authorization (ADR-V4-0007). */
  fork_inherited: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export function canTransitionEffect(from: EffectState, to: EffectState): boolean {
  return isAllowedTransition(EFFECT_TRANSITIONS, from, to);
}

export type RetryDecision =
  | { action: "DISPATCH_ALLOWED"; reason: string }
  | { action: "RETRY_WITH_SAME_IDEMPOTENCY_KEY"; reason: string }
  | { action: "RECONCILE_FIRST"; reason: string }
  | { action: "ESCALATE"; reason: string }
  | { action: "FORBIDDEN"; reason: string };

/**
 * Normative retry rule (constitution §4.4 "bloquear repetição cega"; §7.3).
 * Pure function: M03/M04 implementations must return the same action for the same input.
 */
export function decideRetry(
  effect: Pick<EffectRecord, "state" | "idempotency_key" | "integration" | "authorization" | "fork_inherited" | "effect_class">,
): RetryDecision {
  const caps = effect.integration.capabilities;
  if (effect.fork_inherited && effect.effect_class === "EXTERNAL") {
    return { action: "FORBIDDEN", reason: "fork_inherited_external_effect_requires_new_effect_and_authorization" };
  }
  switch (effect.state) {
    case "PLANNED":
      return { action: "FORBIDDEN", reason: "not_authorized" };
    case "AUTHORIZED":
      return effect.authorization
        ? { action: "DISPATCH_ALLOWED", reason: "authorized_never_dispatched" }
        : { action: "FORBIDDEN", reason: "authorization_reference_missing" };
    case "NOT_EXECUTED":
      return { action: "FORBIDDEN", reason: "terminal_create_new_effect_with_fresh_authorization" };
    case "DISPATCHED":
    case "UNKNOWN":
      if (caps.supports_idempotency_key && effect.idempotency_key) {
        return { action: "RETRY_WITH_SAME_IDEMPOTENCY_KEY", reason: "target_deduplicates_by_key" };
      }
      if (caps.supports_status_query) {
        return { action: "RECONCILE_FIRST", reason: "outcome_uncertain_query_target_before_any_retry" };
      }
      return { action: "ESCALATE", reason: "outcome_uncertain_and_no_safe_reconciliation_path" };
    case "PARTIAL":
      return caps.supports_compensation
        ? { action: "RECONCILE_FIRST", reason: "partial_compensate_or_complete_after_reconciliation" }
        : { action: "ESCALATE", reason: "partial_without_compensation" };
    case "ESCALATED":
      return { action: "ESCALATE", reason: "awaiting_authorized_resolution" };
    case "COMMITTED":
    case "REJECTED":
    case "COMPENSATED":
      return { action: "FORBIDDEN", reason: "terminal_or_confirmed" };
  }
}

export function validateEffectRecord(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("EffectRecord");
    const effectId = c.id("effect_id", "effect");
    c.id("work_id", "work");
    c.id("task_id", "task");
    c.id("execution_id", "execution");
    c.executorRef("executor_ref");
    const cls = c.oneOf("effect_class", ["INTERNAL", "EXTERNAL"] as const);
    c.nested("intent", (cc) => {
      cc.string("action");
      cc.string("target_resource");
      cc.ensure(isSha256(cc.get("parameters_digest")), "STRUCT", "parameters_digest", "must be sha256 (parameters themselves are not stored here)");
      cc.string("description");
    });
    c.nested("integration", (cc) => {
      cc.string("integration_id");
      cc.nested("capabilities", (ccc) => {
        ccc.boolean("supports_idempotency_key");
        ccc.boolean("supports_status_query");
        ccc.boolean("supports_compensation");
      });
    });
    c.nested(
      "authorization",
      (cc) => {
        cc.id("policy_decision_id", "policy_decision");
        cc.string("approval_id", { optional: true });
      },
      { optional: true },
    );
    c.string("idempotency_key", { optional: true });
    const state = c.oneOf("state", EFFECT_STATES);
    const evidence = c.stringArray("evidence_ids");
    c.each("reconciliation", (cc) => {
      cc.timestamp("at");
      cc.oneOf("method", ["STATUS_QUERY", "IDEMPOTENT_REPLAY", "MANUAL_INSPECTION", "EXTERNAL_EVIDENCE"] as const);
      cc.string("observed");
      cc.stringArray("evidence_ids");
      cc.oneOf("outcome", [
        "CONFIRMED_COMMITTED",
        "CONFIRMED_REJECTED",
        "CONFIRMED_NOT_EXECUTED",
        "CONFIRMED_PARTIAL",
        "INCONCLUSIVE",
      ] as const);
    });
    c.boolean("fork_inherited");
    c.timestamp("created_at");
    c.timestamp("updated_at");

    const authorizedOrBeyond: readonly EffectState[] = ["AUTHORIZED", "DISPATCHED", "COMMITTED", "REJECTED", "UNKNOWN", "PARTIAL", "ESCALATED", "COMPENSATED"];
    if (state && authorizedOrBeyond.includes(state)) {
      c.ensure(c.get("authorization") !== undefined, "INV-EFF-02", "authorization", `${state} requires an authorization reference`);
    }
    const confirmed: readonly EffectState[] = ["COMMITTED", "REJECTED", "PARTIAL", "COMPENSATED"];
    if (state && confirmed.includes(state)) {
      c.ensure((evidence?.length ?? 0) > 0, "INV-EFF-03", "evidence_ids", `${state} requires observed evidence`);
    }
    if (cls === "EXTERNAL" && state === "UNKNOWN") {
      const caps = (c.get("integration") as EffectRecord["integration"] | undefined)?.capabilities;
      if (caps && !caps.supports_idempotency_key && !caps.supports_status_query) {
        // UNKNOWN without any reconciliation path must not stay silently UNKNOWN: it must be escalated.
        c.fail("INV-EFF-04", "state", "UNKNOWN external effect without idempotency or status query must be ESCALATED");
      }
    }
    if (state === "COMPENSATED") {
      const comp = c.get("compensation") as EffectRecord["compensation"];
      c.ensure(Boolean(comp?.compensating_effect_id), "INV-EFF-05", "compensation", "COMPENSATED requires the compensating effect id");
      if (comp?.compensating_effect_id && effectId) {
        c.ensure(comp.compensating_effect_id !== effectId, "INV-EFF-05", "compensation", "an effect cannot compensate itself");
      }
    }
  });
}
