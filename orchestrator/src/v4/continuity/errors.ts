/**
 * Fail-closed errors for M04 capsule / handoff / recovery.
 * Codes are stable for tests and M19 wiring; they are not HTTP statuses.
 */

import type { ValidationResult } from "../contracts/index.js";

export const CONTINUITY_ERROR = {
  VERIFY_FAILED: "VERIFY_FAILED",
  SEAL_FAILED: "SEAL_FAILED",
  ACCEPT_FAILED: "ACCEPT_FAILED",
  REPLAY_REUSED: "REPLAY_REUSED",
  SUPERSEDED: "SUPERSEDED",
  LEASE_REQUIRED: "LEASE_REQUIRED",
  CHECKPOINT_NOT_VERIFIED: "CHECKPOINT_NOT_VERIFIED",
  CHECKPOINT_MISMATCH: "CHECKPOINT_MISMATCH",
  DIGEST_MISMATCH: "DIGEST_MISMATCH",
  UNKNOWN_KEY: "UNKNOWN_KEY",
  GRANT_MATERIAL: "GRANT_MATERIAL",
  RECOVERY_UNVERIFIED: "RECOVERY_UNVERIFIED",
  CONFORMANCE: "CONFORMANCE",
} as const;

export type ContinuityErrorCode = (typeof CONTINUITY_ERROR)[keyof typeof CONTINUITY_ERROR];

export class ContinuityError extends Error {
  readonly code: ContinuityErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ContinuityErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ContinuityError";
    this.code = code;
    this.details = details;
  }
}

export class CapsuleVerifyFailed extends ContinuityError {
  readonly validation: ValidationResult;

  constructor(validation: ValidationResult) {
    super(
      CONTINUITY_ERROR.VERIFY_FAILED,
      `capsule verify failed: ${validation.issues.map((i) => `${i.code}@${i.path}`).join(",")}`,
      { issues: validation.issues },
    );
    this.validation = validation;
  }
}
