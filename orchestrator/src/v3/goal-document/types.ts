/**
 * Goal Document v1 — human-readable goal artefact persisted alongside Goal Contract.
 * Structural validation is the authority; LLM booleans are never proof.
 */

export interface GoalDocumentStructuralChecks {
  has_objective: boolean;
  has_scope: boolean;
  has_acceptance: boolean;
  scan_completed: boolean;
  grill_gate_status: "satisfied" | "exempt" | "blocked" | "missing";
  /** Always false in valid docs — presence of true elsewhere is rejected by validator. */
  llm_boolean_accepted_as_proof: false;
}

export interface GoalDocumentAcceptance {
  id: string;
  description: string;
  verification_kind: "test" | "diff" | "manual" | "static" | "command" | "other";
  evidence_required: string[];
}

export interface GoalDocument {
  kind: "GoalDocument";
  goal_document_id: string;
  goal_contract_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  title: string;
  objective: string;
  context_from_scan: {
    languages: string[];
    package_managers: string[];
    git_branch?: string;
    dirty: boolean;
  };
  scope_in: string[];
  scope_out: string[];
  acceptance: GoalDocumentAcceptance[];
  constraints: string[];
  structural_checks: GoalDocumentStructuralChecks;
}

export interface GoalDocumentValidation {
  ok: boolean;
  reasons: string[];
}
