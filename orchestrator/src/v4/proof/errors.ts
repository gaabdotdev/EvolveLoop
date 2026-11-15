/** Typed failures for the M06 WorkProof engine. Codes are stable for tests. */

export class ProofError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Executor cannot verify its own work; self-declaration never reaches PROVEN (ADR-V4-0009). */
export class SelfVerificationRefused extends ProofError {
  constructor(verifier_id: string, subject_executor_id: string) {
    super(
      "SELF_VERIFICATION_REFUSED",
      `verifier ${verifier_id} cannot judge subject ${subject_executor_id}; executor self-declaration cannot reach PROVEN`,
    );
  }
}

export class VerifierIdentityError extends ProofError {
  constructor(id: string) {
    super("INVALID_VERIFIER_ID", `verifier_id must be a valid executor id (got ${id})`);
  }
}

export class WorkNotFound extends ProofError {
  constructor(work_id: string) {
    super("WORK_NOT_FOUND", `work ${work_id} not found`);
  }
}

export class GoalContractNotFound extends ProofError {
  constructor(id: string, version: number) {
    super("GOAL_CONTRACT_NOT_FOUND", `goal contract ${id}@${version} not found`);
  }
}

export class ImmutableProofError extends ProofError {
  constructor(proof_id: string) {
    super("INV-PROOF-05", `WorkProof ${proof_id} is immutable; emit a successor with supersedes_proof_id`);
  }
}

export class InvalidEvidenceError extends ProofError {
  constructor(message: string) {
    super("INVALID_EVIDENCE", message);
  }
}

export class ProofValidationError extends ProofError {
  constructor(message: string) {
    super("INVALID_PROOF", message);
  }
}

export class AmbiguousSubjectExecutor extends ProofError {
  constructor(work_id: string) {
    super(
      "AMBIGUOUS_SUBJECT_EXECUTOR",
      `work ${work_id} has multiple executors; pass subjectExecutorId to avoid guessing`,
    );
  }
}
