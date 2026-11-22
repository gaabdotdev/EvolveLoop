/**
 * Official V0 MSO states (EVOLVELOOP-PRODUCT-GOALS §7.2) + hardcoded transition matrix (§7.3).
 * PENDING_DISPATCH is an outbox status, not an MSO state.
 */

export const MSO_STATES = [
  "INIT",
  "LOADING_GOALS",
  "ANALYZING",
  "DECOMPOSING",
  "DELEGATING",
  "WAITING_AGENTS",
  "VALIDATING",
  "BLOCKED",
  "RECOVERING",
  "TRUE-FULL-PASS",
] as const;

export type MsoState = (typeof MSO_STATES)[number];

/** Hardcoded legal transitions — runtime rejects anything outside this matrix. */
export const MSO_TRANSITIONS: Readonly<Record<MsoState, readonly MsoState[]>> = {
  INIT: ["LOADING_GOALS"],
  LOADING_GOALS: ["ANALYZING"],
  ANALYZING: ["DECOMPOSING"],
  DECOMPOSING: ["DELEGATING"],
  DELEGATING: ["WAITING_AGENTS"],
  WAITING_AGENTS: ["VALIDATING"],
  VALIDATING: ["TRUE-FULL-PASS", "DECOMPOSING", "DELEGATING", "BLOCKED"],
  BLOCKED: ["RECOVERING"],
  RECOVERING: ["DELEGATING"],
  "TRUE-FULL-PASS": [],
};

export function isMsoState(value: string): value is MsoState {
  return (MSO_STATES as readonly string[]).includes(value);
}

export function canTransitionMso(from: MsoState, to: MsoState): boolean {
  return MSO_TRANSITIONS[from].includes(to);
}
