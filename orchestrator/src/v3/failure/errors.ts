/**
 * Explicit failure-domain errors — never silent.
 */

export class FailureDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FailureDomainError";
    this.code = code;
  }
}

/** Raised when a caller attempts to treat a non-PASS outcome as success. */
export class SilentPassForbiddenError extends FailureDomainError {
  readonly outcome: string;

  constructor(outcome: string) {
    super(
      "SILENT_PASS_FORBIDDEN",
      `Zero Silent Failure: cannot treat outcome "${outcome}" as PASS`,
    );
    this.name = "SilentPassForbiddenError";
    this.outcome = outcome;
  }
}

export class InvalidSafetyTransitionError extends FailureDomainError {
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string, detail?: string) {
    super(
      "INVALID_SAFETY_TRANSITION",
      `Invalid SafetyState transition: ${from} → ${to}${detail ? ` (${detail})` : ""}`,
    );
    this.name = "InvalidSafetyTransitionError";
    this.from = from;
    this.to = to;
  }
}

export class RecoveryExhaustedError extends FailureDomainError {
  constructor(lastStep: string) {
    super(
      "RECOVERY_EXHAUSTED",
      `Recovery hierarchy exhausted after step "${lastStep}"; human_gate is terminal`,
    );
    this.name = "RecoveryExhaustedError";
  }
}
