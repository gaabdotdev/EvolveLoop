/**
 * Zero Silent Failure (Meta 36) — classifyOutcome is fail-closed.
 * UNKNOWN / null / undefined / empty MUST NOT map to PASS.
 */

import { SilentPassForbiddenError } from "./errors.js";
import {
  OUTCOME_STATUSES,
  type ClassifiedOutcome,
  type OutcomeStatus,
} from "./types.js";

const OUTCOME_SET = new Set<string>(OUTCOME_STATUSES);

/** Canonical aliases → OutcomeStatus (Meta 36 SUCCESS/FAILURE ↔ PASS/FAIL). */
const ALIASES: Readonly<Record<string, OutcomeStatus>> = {
  PASS: "PASS",
  SUCCESS: "PASS",
  OK: "PASS",
  FAIL: "FAIL",
  FAILURE: "FAIL",
  FAILED: "FAIL",
  ERROR: "FAIL",
  BLOCKED: "BLOCKED",
  BLOCK: "BLOCKED",
  UNCERTAIN: "UNCERTAIN",
  PARTIAL: "PARTIAL",
  DEGRADED: "DEGRADED",
  NOT_MEASURED: "NOT_MEASURED",
  UNMEASURED: "NOT_MEASURED",
};

function normalizeToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

/**
 * Classify an arbitrary raw outcome into OutcomeStatus.
 * Inegociável: null | undefined | "" | "UNKNOWN" → NOT_MEASURED (never PASS).
 * Unrecognized present tokens → UNCERTAIN (never PASS).
 */
export function classifyOutcome(raw: unknown): ClassifiedOutcome {
  if (raw === null || raw === undefined) {
    return {
      status: "NOT_MEASURED",
      is_pass: false,
      fail_closed: true,
      raw_kind: "nullish",
    };
  }

  if (typeof raw !== "string") {
    return {
      status: "NOT_MEASURED",
      is_pass: false,
      fail_closed: true,
      raw_kind: "non_string",
    };
  }

  const token = normalizeToken(raw);
  if (token.length === 0) {
    return {
      status: "NOT_MEASURED",
      is_pass: false,
      fail_closed: true,
      raw_kind: "empty",
    };
  }

  if (token === "UNKNOWN" || token === "N_A" || token === "NA" || token === "NONE") {
    return {
      status: "NOT_MEASURED",
      is_pass: false,
      fail_closed: true,
      raw_kind: "unknown_token",
    };
  }

  const aliased = ALIASES[token];
  if (aliased !== undefined) {
    return {
      status: aliased,
      is_pass: aliased === "PASS",
      fail_closed: false,
      raw_kind: "recognized",
    };
  }

  if (OUTCOME_SET.has(token)) {
    const status = token as OutcomeStatus;
    return {
      status,
      is_pass: status === "PASS",
      fail_closed: false,
      raw_kind: "recognized",
    };
  }

  return {
    status: "UNCERTAIN",
    is_pass: false,
    fail_closed: true,
    raw_kind: "unrecognized",
  };
}

/** Convenience: status only. */
export function classifyOutcomeStatus(raw: unknown): OutcomeStatus {
  return classifyOutcome(raw).status;
}

/**
 * Assert that a classified outcome is PASS.
 * Proíbe silent success — throws SilentPassForbiddenError otherwise.
 */
export function assertPassOutcome(raw: unknown): asserts raw is string {
  const classified = classifyOutcome(raw);
  if (!classified.is_pass) {
    throw new SilentPassForbiddenError(
      typeof raw === "string" ? raw : String(classified.status),
    );
  }
}

/** True only for explicit PASS (after classification). */
export function isExplicitPass(raw: unknown): boolean {
  return classifyOutcome(raw).is_pass;
}
