/**
 * V5-M06 — Verification & Delivery projection types (ADR-005).
 * PASS never from agent claim; provenance rules from REMED-M5.
 */

import type {
  DeliveryEvidenceProvenance,
  DeliveryStatus,
  DeliveryVerification,
} from "../../cli/tui/delivery-status.js";
import type { CriterionState, WorkState } from "../goal-contract/types.js";
import type { EvidenceRecordRow } from "../state-db/types.js";

export type {
  DeliveryStatus,
  DeliveryEvidenceProvenance,
  DeliveryVerification,
};

export interface CriterionEvidenceLink {
  criterion_id: string;
  evidence_id: string;
  required: boolean;
  present_in_statedb: boolean;
  evidence_status?: EvidenceRecordRow["status"];
  evidence_kind?: string;
}

export interface CriterionEvaluationRow {
  criterion_id: string;
  description: string;
  mandatory: boolean;
  state: CriterionState;
  evidence_ids: string[];
  evidence_required: string[];
  evidence_links: CriterionEvidenceLink[];
}

export interface WorkCriteriaEvaluation {
  kind: "WorkCriteriaEvaluation";
  work_id: string;
  goal_contract_id?: string;
  goal_contract_version?: number;
  eligible_true_full_pass: boolean;
  work_state: WorkState;
  reasons: string[];
  criteria: CriterionEvaluationRow[];
  /** Honesty: agent prose / claims are ignored. */
  agent_claim_ignored: true;
  evaluated_at: string;
}

export type IgnoredEvidenceReason =
  | "stale_row"
  | "stale_provenance"
  | "invalid_provenance"
  | "absent_provenance"
  | "other_work"
  | "association_mismatch"
  | "wrong_kind"
  | "unparseable";

export interface IgnoredEvidenceEntry {
  evidence_id: string;
  work_id: string;
  reason: IgnoredEvidenceReason;
  detail?: string;
}

export interface EvidenceProvenanceView {
  kind: "EvidenceProvenanceView";
  work_id: string;
  evidence_id: string;
  status: EvidenceRecordRow["status"];
  evidence_kind?: string;
  provenance: DeliveryEvidenceProvenance;
  verification?: DeliveryVerification;
  created_at: string;
  updated_at: string;
}

export interface UnifiedEvidenceRead {
  kind: "UnifiedEvidenceRead";
  work_id: string;
  workspace: string;
  records: EvidenceProvenanceView[];
  /** REMED-M5: stale / other-work / incompatible — never used for PASS. */
  ignored: IgnoredEvidenceEntry[];
  delivery_verification?: {
    evidence_id: string;
    verification: DeliveryVerification;
    provenance: DeliveryEvidenceProvenance;
  };
  limitations: string[];
  read_at: string;
}

/**
 * Delivery projection — statuses from delivery-status.ts.
 * FAIL maps to FAILED for API naming clarity (same enum value FAILED).
 */
export type DeliveryProjectionStatus =
  | "PASS"
  | "FAIL"
  | "UNVERIFIED"
  | "ATTESTED"
  | "BLOCKED";

export interface DeliveryProjection {
  kind: "DeliveryProjection";
  work_id?: string;
  workspace: string;
  status: DeliveryProjectionStatus;
  /** Underlying DeliveryStatus (FAILED ↔ FAIL). */
  delivery_status: DeliveryStatus;
  provenance: DeliveryEvidenceProvenance;
  verification?: DeliveryVerification;
  evidence_id?: string;
  from_evidence: boolean;
  /** Always true — agent claim never yields PASS. */
  agent_claim_cannot_pass: true;
  message_pt: string;
  projected_at: string;
  limitations: string[];
}

export type VerifierImplementation =
  | "local_command"
  | "custom"
  | "native_stub"
  | "custom_hook"
  | "unsupported";

export interface VerifierRecord {
  kind: "VerifierRecord";
  verifier_id: string;
  display_name: string;
  implementation: VerifierImplementation;
  honesty: "supported" | "partial" | "unsupported" | "unknown";
  notes: string[];
  limitations: string[];
  enabled: boolean;
}

export interface VerifierRegistrySnapshot {
  kind: "VerifierRegistry";
  version: number;
  updated_at: string;
  verifiers: VerifierRecord[];
  limitations: string[];
}

/**
 * Custom verifier interface — caller supplies; Core does not invent PASS.
 * Must never upgrade external_attestation / agent claim to local_execution.
 */
export interface CustomVerifier {
  verifier_id: string;
  run(input: {
    workspace: string;
    work_id?: string;
    command?: string;
  }): Promise<{
    exit_code: number;
    provenance: DeliveryEvidenceProvenance;
    command: string;
    notes?: string[];
  }>;
}

/** @deprecated Prefer CustomVerifier — kept as alias. */
export type CustomVerifierHook = CustomVerifier;

export interface VerifierRunResult {
  kind: "VerifierRunResult";
  verifier_id: string;
  exit_code: number;
  provenance: DeliveryEvidenceProvenance;
  command: string;
  notes: string[];
  /**
   * True only when provenance=local_execution AND exit 0.
   * Does NOT by itself mint Delivery PASS — projection / attach still required.
   */
  may_contribute_to_pass: boolean;
  /** When native local_command ran validateDelivery, projection status if known. */
  delivery_status?: DeliveryProjectionStatus;
  evidence_id?: string;
}
