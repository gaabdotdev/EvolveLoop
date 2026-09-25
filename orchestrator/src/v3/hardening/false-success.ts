/**
 * Hardening helpers for false-success / silent-PASS red-team.
 * Prefer rejection assertions: a vulnerability exists when an attack yields success/PASS.
 */

import type { GoalContract } from "../contracts/types.js";
import {
  evaluateGoal,
  isEligibleEvidenceRef,
  type EvidenceRefBundle,
  type OracleEvalResult,
} from "../goals/success-oracle.js";
import type { SuccessOracleCriterion } from "../contracts/types.js";

/** Plausible-but-wrong prefixes that must never satisfy presence_of_evidence. */
export const FAKE_EVIDENCE_PREFIX_ATTACKS = [
  "evidance:run1:node1",
  "evidenz:run1:node1",
  "proof:run1:node1",
  "artifact:out/report.json",
  "file:/tmp/report.json",
  "evd:abc",
  "EvidenceRef:run1:node1",
  "provider:mock-docs",
  "run:feature:finished",
] as const;

/** Narrative / agent-claim strings that must not count as evidence. */
export const NARRATIVE_EVIDENCE_ATTACKS = [
  "Agent claims the feature is complete and all DoD items are green",
  "rationale: I verified success myself",
  "evidence: agent says done", // whitespace after colon → ineligible
  "I finished the goal; trust me",
] as const;

export const EXECUTOR_ID = "execution-engine";
export const VERIFIER_ID = "success-oracle";

/** Bundle that satisfies executor≠verifier for legitimate oracle success. */
export function legitimateEvidenceBundle(
  refs: string[],
  extra?: Partial<EvidenceRefBundle>,
): EvidenceRefBundle {
  return {
    evidence_refs: refs,
    executor_id: EXECUTOR_ID,
    verifier_id: VERIFIER_ID,
    ...extra,
  };
}

/** Same identity as executor and verifier — must be rejectable. */
export function executorIsVerifierBundle(refs: string[]): EvidenceRefBundle {
  return {
    evidence_refs: refs,
    executor_id: "agent-self",
    verifier_id: "agent-self",
  };
}

export function isFalseSuccess(decision: OracleEvalResult["decision"]): boolean {
  return decision === "success";
}

/**
 * Red-team assertion helper: oracle must refuse success for the attack bundle.
 * Returns the eval result for further inspection.
 */
export function evaluateExpectingRejection(
  goal: GoalContract,
  criteriaById: Map<string, SuccessOracleCriterion>,
  attack: EvidenceRefBundle,
): OracleEvalResult {
  return evaluateGoal(goal, criteriaById, attack);
}

/** True when every ref in the list is ineligible (prefix / narrative filter). */
export function allRefsIneligible(refs: readonly string[]): boolean {
  return refs.length > 0 && refs.every((r) => !isEligibleEvidenceRef(r));
}
