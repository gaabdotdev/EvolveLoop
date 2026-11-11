/**
 * Structured Grill-Me result — Core intake for Goal Contract (V3.0).
 * Mirrors host skill GRILL_ME_RESULT; Core validates fail-closed.
 */

export interface GrillMeResult {
  kind: "GRILL_ME_RESULT";
  problem_understood: boolean;
  requirements_challenged: boolean;
  ambiguities_found: string[];
  assumptions_exposed: string[];
  risks_identified: string[];
  open_questions: string[];
  accepted_scope: string[];
  rejected_scope: string[];
  readiness_for_planning: boolean;
  user_confirmed_shared_understanding: boolean;
  /** Optional structured criteria seeds from the interview. */
  acceptance_criteria?: Array<{
    id: string;
    description: string;
    mandatory?: boolean;
    evidence_required?: string[];
  }>;
  functional_requirements?: string[];
  non_functional_requirements?: string[];
  constraints?: string[];
  dependencies?: string[];
  objective?: string;
}

export type GrillMeIntakeStatus = "satisfied" | "blocked" | "failed" | "exempt";

export interface GrillMeValidation {
  status: GrillMeIntakeStatus;
  allow_goal_contract: boolean;
  reasons: string[];
}
