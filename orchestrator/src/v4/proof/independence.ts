/**
 * Independence enforcement (ADR-V4-0009, constitution §8.3).
 * Uses the frozen `isIndependent` predicate — never a local reimplementation.
 */

import { isIndependent, isValidId, type Evidence } from "../contracts/index.js";
import { SelfVerificationRefused, VerifierIdentityError } from "./errors.js";

export function requireExecutorId(id: string): string {
  if (!isValidId("executor", id)) throw new VerifierIdentityError(id);
  return id;
}

/**
 * Fail closed: missing ids or identity equality refuse verification.
 * Version differences do not create independence (executor_id compared only).
 */
export function assertIndependentVerifier(verifier_id: string, subject_executor_id: string): void {
  if (!verifier_id || !subject_executor_id) {
    throw new SelfVerificationRefused(verifier_id || "<missing>", subject_executor_id || "<missing>");
  }
  if (verifier_id === subject_executor_id) {
    throw new SelfVerificationRefused(verifier_id, subject_executor_id);
  }
}

/** True when evidence cannot qualify (self-reported, same executor, or missing subject). */
export function cannotQualify(evidence: Pick<Evidence, "method" | "produced_by" | "subject_executor_ref" | "provenance">): boolean {
  return !isIndependent(evidence);
}
