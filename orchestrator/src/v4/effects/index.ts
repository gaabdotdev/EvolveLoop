/**
 * M03 Effect Ledger (initial).
 *
 * Ownership: `orchestrator/src/v4/effects/**`.
 * Consumer interface: frozen `EffectLedgerPort`.
 * Normative retry: always `decideRetry` from contracts — never reimplemented.
 */

export { EffectLedger } from "./ledger.js";
export { EffectLedgerError, EFFECT_ERROR } from "./errors.js";
export {
  isCpSideEffectEvidence,
  isExecutorSourced,
  resolveCpSideEvidence,
} from "./evidence-gate.js";
export { assertNoControlFields } from "./events.js";
export { idempotencySlot, idempotencySlotDigest } from "./store.js";
export type {
  Clock,
  EffectAuditEntry,
  EffectDomainEvent,
  EffectFence,
  EffectLedgerOptions,
  EffectPlannedPayload,
  EffectReconciliationPayload,
  EffectStateChangedPayload,
  EvidenceStore,
} from "./types.js";
