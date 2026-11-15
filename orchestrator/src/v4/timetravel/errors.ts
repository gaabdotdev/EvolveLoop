/**
 * Fail-closed errors for M05 time travel / fork / replay.
 * Codes are stable for callers (M15, tests); they are not HTTP statuses.
 */

export class TimeTravelError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TimeTravelError";
    this.code = code;
    this.details = details;
  }
}

export const TIMETRAVEL_ERROR = {
  NOT_FOUND: "NOT_FOUND",
  INVALID: "INVALID",
  INSPECT_READONLY: "INSPECT_READONLY",
  FORK_IDENTITY: "INV-WORK-05",
  CHECKPOINT_INCONSISTENT: "CHECKPOINT_INCONSISTENT",
  EFFECTS_REQUIRED: "EFFECTS_REQUIRED",
  AUTHORIZATION_REQUIRED: "AUTHORIZATION_REQUIRED",
  REPLAY_FORBIDDEN: "REPLAY_FORBIDDEN",
  APPEND_FAILED: "APPEND_FAILED",
  STRUCT: "STRUCT",
} as const;

export type TimeTravelErrorCode = (typeof TIMETRAVEL_ERROR)[keyof typeof TIMETRAVEL_ERROR];
