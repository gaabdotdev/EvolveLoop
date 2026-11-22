/**
 * Goal Contract — versioned acceptance artefact (V3.0).
 * Agent prose cannot set TRUE_FULL_PASS; only criterion evaluation can.
 */

export type CriterionState =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PASS"
  | "FAIL"
  | "NOT_PASS"
  | "BLOCKED"
  | "NOT_APPLICABLE";

export type TaskState =
  | "PENDING"
  | "IN_PROGRESS"
  | "PARTIAL_PASS"
  | "TRUE_PASS"
  | "BLOCKED"
  | "FAILED"
  | "CANCELLED";

export type WorkState =
  | "NOT_PASS"
  | "IN_PROGRESS"
  | "VERIFICATION"
  | "RECOVERY"
  | "BLOCKED"
  | "CANCELLED"
  | "TRUE_FULL_PASS";

export interface VerificationMethod {
  id: string;
  kind: "test" | "diff" | "manual" | "static" | "command" | "other";
  description: string;
  command?: string;
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
  mandatory: boolean;
  verification: VerificationMethod[];
  evidence_required: string[];
  state: CriterionState;
  evidence_ids: string[];
  updated_at: string;
}

export interface GoalContract {
  kind: "GoalContract";
  goal_contract_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  objective: string;
  scope: string[];
  out_of_scope: string[];
  functional_requirements: string[];
  non_functional_requirements: string[];
  constraints: string[];
  dependencies: string[];
  risks: string[];
  criteria: AcceptanceCriterion[];
  /** Immutable parent version when this is a revision. */
  supersedes_version?: number;
  work_id?: string;
  /**
   * V2-QUAL-01 — When true, TRUE_FULL_PASS / VERIFIED_PASS require a valid
   * IndependentReviewGate submission (distinct agent_id and session_id).
   */
  require_independent_review?: boolean;
  /**
   * V2-QUAL-02 — When true, TRUE_FULL_PASS requires mutation battery score
   * >= mutation_score_threshold (default 1.0). Weak tests → block.
   */
  require_mutation_gate?: boolean;
  /** Kill ratio required when require_mutation_gate is set (0..1). Default 1.0. */
  mutation_score_threshold?: number;
}

export interface GoalContractCreateInput {
  goal_contract_id: string;
  objective: string;
  scope?: string[];
  out_of_scope?: string[];
  functional_requirements?: string[];
  non_functional_requirements?: string[];
  constraints?: string[];
  dependencies?: string[];
  risks?: string[];
  criteria: Array<Omit<AcceptanceCriterion, "state" | "evidence_ids" | "updated_at"> & {
    state?: CriterionState;
  }>;
  work_id?: string;
  /** V2-QUAL-01 — require IndependentReviewGate before verified pass. */
  require_independent_review?: boolean;
  /** V2-QUAL-02 — require selective mutation battery before TRUE_FULL_PASS. */
  require_mutation_gate?: boolean;
  /** V2-QUAL-02 — minimum mutation kill ratio (0..1). */
  mutation_score_threshold?: number;
}

export function evaluateTrueFullPass(contract: GoalContract): {
  eligible: boolean;
  work_state: WorkState;
  reasons: string[];
} {
  const reasons: string[] = [];
  const applicable = contract.criteria.filter((c) => c.state !== "NOT_APPLICABLE");
  const mandatory = applicable.filter((c) => c.mandatory);

  if (mandatory.length === 0) {
    reasons.push("no_mandatory_applicable_criteria");
  }

  for (const c of mandatory) {
    if (c.state === "BLOCKED") reasons.push(`mandatory_blocked:${c.id}`);
    if (c.state === "FAIL" || c.state === "NOT_PASS") reasons.push(`mandatory_not_pass:${c.id}`);
    if (c.state !== "PASS") reasons.push(`mandatory_incomplete:${c.id}:${c.state}`);
    if (c.evidence_required.length > 0 && c.evidence_ids.length === 0) {
      reasons.push(`mandatory_missing_evidence:${c.id}`);
    }
  }

  const eligible = reasons.length === 0 && mandatory.length > 0;
  return {
    eligible,
    work_state: eligible ? "TRUE_FULL_PASS" : "NOT_PASS",
    reasons,
  };
}
