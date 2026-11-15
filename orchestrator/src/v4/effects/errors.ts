/**
 * Fail-closed errors for the M03 Effect Ledger.
 * Codes are stable for callers (M04 recovery, M13 dispatch); they are not HTTP statuses.
 */

export class EffectLedgerError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "EffectLedgerError";
    this.code = code;
    this.details = details;
  }
}

export const EFFECT_ERROR = {
  NOT_FOUND: "NOT_FOUND",
  INVALID: "INVALID",
  CONFLICT: "CONFLICT",
  FORBIDDEN: "FORBIDDEN",
  EVIDENCE_REQUIRED: "EVIDENCE_REQUIRED",
  EVIDENCE_NOT_CP_SIDE: "EVIDENCE_NOT_CP_SIDE",
  EVIDENCE_UNRESOLVED: "EVIDENCE_UNRESOLVED",
  IDEMPOTENCY_IN_FLIGHT: "IDEMPOTENCY_IN_FLIGHT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  BLIND_RETRY_BLOCKED: "BLIND_RETRY_BLOCKED",
  FENCE_REQUIRED: "FENCE_REQUIRED",
  FENCED: "FENCED",
  AUTHORIZATION_REQUIRED: "AUTHORIZATION_REQUIRED",
  AUTHORIZATION_REUSED: "AUTHORIZATION_REUSED",
} as const;

export type EffectErrorCode = (typeof EFFECT_ERROR)[keyof typeof EFFECT_ERROR];
