/**
 * SafetyState transition helper (§254 / §256).
 * Coherent with SAFETY_STATES in contracts/types.
 * Proíbe QUARANTINED → NORMAL/RESTORED jump without progressive recovery.
 */

import { SAFETY_STATES, type SafetyState } from "../contracts/types.js";
import { InvalidSafetyTransitionError } from "./errors.js";
import type { SafetyTransitionResult } from "./types.js";

/**
 * Allowed directed edges.
 * Degradation may skip (escalate fast); recovery must be progressive.
 */
const ALLOWED: Readonly<Record<SafetyState, readonly SafetyState[]>> = {
  NORMAL: ["SUSPECT", "RESTRICTED", "QUARANTINED"],
  SUSPECT: ["NORMAL", "RESTRICTED", "QUARANTINED"],
  RESTRICTED: ["SUSPECT", "QUARANTINED", "RECOVERING"],
  QUARANTINED: ["RECOVERING"], // §256: no jump to FULL_AUTONOMY
  RECOVERING: ["RESTORED", "QUARANTINED", "RESTRICTED"],
  RESTORED: ["NORMAL", "SUSPECT", "RESTRICTED", "QUARANTINED"],
};

export function isSafetyState(value: string): value is SafetyState {
  return (SAFETY_STATES as readonly string[]).includes(value);
}

export function allowedSafetyTransitions(from: SafetyState): readonly SafetyState[] {
  return ALLOWED[from];
}

export function canTransitionSafetyState(from: SafetyState, to: SafetyState): boolean {
  if (from === to) return true; // idempotent stay
  return ALLOWED[from].includes(to);
}

/**
 * Evaluate a proposed transition. Does not mutate external state.
 * reason explains allow/deny for audit.
 */
export function evaluateSafetyTransition(
  from: SafetyState,
  to: SafetyState,
): SafetyTransitionResult {
  if (from === to) {
    return {
      from,
      to,
      allowed: true,
      reason: "idempotent stay",
    };
  }

  if (from === "QUARANTINED" && (to === "NORMAL" || to === "RESTORED" || to === "SUSPECT")) {
    return {
      from,
      to,
      allowed: false,
      reason:
        "§256 Autonomy Recovery: QUARANTINED must enter RECOVERING before authority restore",
    };
  }

  if (ALLOWED[from].includes(to)) {
    return {
      from,
      to,
      allowed: true,
      reason: `allowed edge ${from} → ${to}`,
    };
  }

  return {
    from,
    to,
    allowed: false,
    reason: `no allowed edge ${from} → ${to}`,
  };
}

/**
 * Apply transition or throw InvalidSafetyTransitionError.
 * Inegociável: refuse silent illegal jumps.
 */
export function transitionSafetyState(from: SafetyState, to: SafetyState): SafetyState {
  const result = evaluateSafetyTransition(from, to);
  if (!result.allowed) {
    throw new InvalidSafetyTransitionError(from, to, result.reason);
  }
  return to;
}

/**
 * Suggest next degradation step (narrower autonomy).
 * QUARANTINED has no further degrade — returns QUARANTINED.
 */
export function suggestDegrade(from: SafetyState): SafetyState {
  switch (from) {
    case "NORMAL":
    case "RESTORED":
      return "SUSPECT";
    case "SUSPECT":
      return "RESTRICTED";
    case "RESTRICTED":
    case "RECOVERING":
      return "QUARANTINED";
    case "QUARANTINED":
      return "QUARANTINED";
    default: {
      const _exhaustive: never = from;
      return _exhaustive;
    }
  }
}

/**
 * Suggest next recovery step (progressive restore).
 * NORMAL stays NORMAL; QUARANTINED → RECOVERING.
 */
export function suggestRecover(from: SafetyState): SafetyState {
  switch (from) {
    case "QUARANTINED":
      return "RECOVERING";
    case "RECOVERING":
      return "RESTORED";
    case "RESTORED":
      return "NORMAL";
    case "RESTRICTED":
      return "RECOVERING";
    case "SUSPECT":
      return "NORMAL";
    case "NORMAL":
      return "NORMAL";
    default: {
      const _exhaustive: never = from;
      return _exhaustive;
    }
  }
}
