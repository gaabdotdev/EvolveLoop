/**
 * Third-party reassessment of a WorkProof (constitution §8).
 * Re-derives from evidence via frozen `deriveRequirementStatus` / `deriveFinalStatus`.
 * Does not trust `generated_by`, payload trust fields, or executor self-declaration.
 */

import {
  checkProofCoverage,
  deriveFinalStatus,
  deriveRequirementStatus,
  isIndependent,
  type Evidence,
  type GoalContract,
  type IsoTimestamp,
  type ProofStatus,
  type RequirementDerivation,
  type WorkProof,
} from "../contracts/index.js";
import { capProvenStatus, generatedByEqualsSubject } from "./authz.js";

export interface Reassessment {
  derived_final: ProofStatus;
  declared_final: ProofStatus;
  coverage: string[];
  requirements: Array<{ criterion_id: string; declared: ProofStatus; derived: RequirementDerivation }>;
  /** True iff declared statuses are not more optimistic than evidence-derived statuses. */
  honest: boolean;
  /** Independent qualifying evidence ids the third party accepted. */
  qualifying_evidence_ids: string[];
}

const OPTIMISM: Record<ProofStatus, number> = {
  UNVERIFIED: 0,
  FAILED: 1,
  PARTIAL: 2,
  PROVEN: 3,
};

function moreOptimistic(declared: ProofStatus, derived: ProofStatus): boolean {
  if (declared === derived) return false;
  if (declared === "FAILED" || derived === "FAILED") return true;
  return OPTIMISM[declared] > OPTIMISM[derived];
}

export function reassessProof(input: {
  proof: WorkProof;
  goal: GoalContract;
  evidence: readonly Evidence[];
  now: IsoTimestamp;
  current_artifact_hashes?: ReadonlySet<string>;
  /** Subject under judgement; compared to `proof.generated_by.verifier_id` (RR-W5-05). */
  subject_executor_id?: string;
  /** EXTERNAL effects that lacked verifiable authorization refs (D13). */
  unauthorized_external_effect_ids?: readonly string[];
}): Reassessment {
  const coverage = checkProofCoverage(input.proof, input.goal);
  const ctx = {
    goal_contract_ref: input.proof.goal_contract_ref,
    now: input.now,
    current_artifact_hashes: input.current_artifact_hashes,
  };
  const qualifying_evidence_ids: string[] = [];
  const requirements = input.goal.acceptance_criteria.map((criterion) => {
    const derived = deriveRequirementStatus(criterion, input.evidence, ctx);
    qualifying_evidence_ids.push(...derived.qualifying_evidence_ids.filter((id) => {
      const e = input.evidence.find((row) => row.evidence_id === id);
      return e ? isIndependent(e) : false;
    }));
    const declared = input.proof.requirements.find((r) => r.criterion_id === criterion.criterion_id)?.status ?? "UNVERIFIED";
    return { criterion_id: criterion.criterion_id, declared, derived };
  });

  const derivedReqs = requirements.map((r) => {
    const crit = input.goal.acceptance_criteria.find((c) => c.criterion_id === r.criterion_id)!;
    return { mandatory: crit.mandatory, status: r.derived.status };
  });
  let derived_final = deriveFinalStatus(derivedReqs, input.proof.effects);

  const subjectId = input.subject_executor_id ?? inferUniqueSubject(input.evidence);
  const selfGenerated = generatedByEqualsSubject(input.proof.generated_by.verifier_id, subjectId);
  const unauthorized = (input.unauthorized_external_effect_ids ?? []).length > 0;
  derived_final = capProvenStatus(derived_final, selfGenerated || unauthorized);

  const honest =
    coverage.length === 0 &&
    !moreOptimistic(input.proof.final_status, derived_final) &&
    requirements.every((r) => !moreOptimistic(r.declared, r.derived.status)) &&
    !(selfGenerated && input.proof.final_status === "PROVEN") &&
    !(unauthorized && input.proof.final_status === "PROVEN");

  return {
    derived_final,
    declared_final: input.proof.final_status,
    coverage,
    requirements,
    honest,
    qualifying_evidence_ids: [...new Set(qualifying_evidence_ids)],
  };
}

function inferUniqueSubject(evidence: readonly Evidence[]): string | undefined {
  const ids = [
    ...new Set(
      evidence
        .map((e) => e.subject_executor_ref?.executor_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  return ids.length === 1 ? ids[0] : undefined;
}
