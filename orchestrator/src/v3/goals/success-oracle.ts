/**
 * SuccessOracle — evaluate criteria against evidence refs (no LLM).
 * Stub oracle types: presence_of_evidence | boolean_predicate | external_callback_ref
 *
 * AR-C01 / SEC-003: presence_of_evidence MUST NOT treat synthetic `run:<id>` strings
 * or bare filesystem paths as satisfying evidence. Eligible refs MUST start with
 * `evidence:`, `lineage:`, or `check:` (validated EvidenceLineage / engine Evidence).
 */

import { V3_API_VERSION, V3_SCHEMA_VERSION } from "../contracts/common.js";
import type {
  GoalContract,
  GoalSatisfactionProof,
  OracleCriterionStatus,
  SatisfactionDecision,
  SuccessOracleCriterion,
} from "../contracts/types.js";
import {
  validateGoalSatisfactionProof,
  validateSuccessOracleCriterion,
} from "../contracts/validators.js";

export const ORACLE_STUB_TYPES = [
  "presence_of_evidence",
  "boolean_predicate",
  "external_callback_ref",
] as const;

export type OracleStubType = (typeof ORACLE_STUB_TYPES)[number];

/**
 * Synthetic run-status stamps (e.g. `run:feature:finished`) and bare paths are NOT evidence.
 * SEC-003 / AR-C01: eligible refs MUST start with `evidence:`, `lineage:`, or `check:`.
 */
export function isEligibleEvidenceRef(ref: string): boolean {
  const trimmed = ref.trim();
  if (trimmed.length === 0) return false;
  // Explicit synthetic stamp from agency-runtime / engine status alone
  if (/^run:/i.test(trimmed)) return false;
  return /^(evidence|lineage|check):/i.test(trimmed);
}

export function filterEligibleEvidenceRefs(refs: readonly string[]): string[] {
  return refs.filter(isEligibleEvidenceRef);
}

export interface EvidenceRefBundle {
  /** Evidence refs available for this evaluation round. */
  evidence_refs: string[];
  /**
   * For boolean_predicate: map criterion_id → observed boolean.
   * Missing key ⇒ uncertain.
   */
  boolean_results?: Record<string, boolean>;
  /**
   * For external_callback_ref: map callback key (threshold or evidence_source) → result.
   * Missing key ⇒ uncertain.
   */
  callback_results?: Record<string, boolean>;
}

export interface CriterionEvalResult {
  criterion_id: string;
  stub_type: OracleStubType;
  status: OracleCriterionStatus;
  pass: boolean;
  evidence_ref: string;
  rationale: string;
}

export interface OracleEvalResult {
  decision: SatisfactionDecision;
  proof: GoalSatisfactionProof;
  criteria: CriterionEvalResult[];
}

function resolveStubType(criterion: SuccessOracleCriterion): OracleStubType {
  const method = criterion.spec.verification_method.trim().toLowerCase();
  if ((ORACLE_STUB_TYPES as readonly string[]).includes(method)) {
    return method as OracleStubType;
  }
  // Fallback: treat as presence_of_evidence when method is automated/evidence-like.
  if (method === "automated" || method === "evidence" || method === "presence") {
    return "presence_of_evidence";
  }
  if (method === "predicate" || method === "boolean") {
    return "boolean_predicate";
  }
  if (method === "callback" || method === "external") {
    return "external_callback_ref";
  }
  // Default deterministic stub.
  return "presence_of_evidence";
}

function pickEvidenceRef(refs: string[], criterionId: string): string {
  const eligible = filterEligibleEvidenceRefs(refs);
  if (eligible.length === 0) return "";
  const match = eligible.find((r) => r.includes(criterionId));
  return match ?? eligible[0]!;
}

export function evaluateCriterion(
  criterion: SuccessOracleCriterion,
  evidence: EvidenceRefBundle,
): CriterionEvalResult {
  const validation = validateSuccessOracleCriterion(criterion);
  if (!validation.valid) {
    return {
      criterion_id: criterion.spec.criterion_id,
      stub_type: "presence_of_evidence",
      status: "uncertain",
      pass: false,
      evidence_ref: "",
      rationale: `invalid criterion: ${validation.errors.join("; ")}`,
    };
  }

  const stub_type = resolveStubType(criterion);
  const id = criterion.spec.criterion_id;

  if (stub_type === "presence_of_evidence") {
    const evidence_ref = pickEvidenceRef(evidence.evidence_refs, id);
    if (evidence_ref) {
      return {
        criterion_id: id,
        stub_type,
        status: "met",
        pass: true,
        evidence_ref,
        rationale: "eligible evidence ref present",
      };
    }
    const hadSyntheticOnly =
      evidence.evidence_refs.length > 0 &&
      filterEligibleEvidenceRefs(evidence.evidence_refs).length === 0;
    return {
      criterion_id: id,
      stub_type,
      status: "unmet",
      pass: false,
      evidence_ref: "",
      rationale: hadSyntheticOnly
        ? "refs rejected — presence_of_evidence requires evidence:|lineage:|check: prefixes (run:* / bare paths ineligible)"
        : "no eligible evidence refs provided",
    };
  }

  if (stub_type === "boolean_predicate") {
    const results = evidence.boolean_results ?? {};
    if (!(id in results)) {
      return {
        criterion_id: id,
        stub_type,
        status: "uncertain",
        pass: false,
        evidence_ref: pickEvidenceRef(evidence.evidence_refs, id),
        rationale: "boolean_predicate result missing",
      };
    }
    const ok = results[id] === true;
    return {
      criterion_id: id,
      stub_type,
      status: ok ? "met" : "unmet",
      pass: ok,
      evidence_ref: pickEvidenceRef(evidence.evidence_refs, id) || `predicate:${id}`,
      rationale: ok ? "predicate true" : "predicate false",
    };
  }

  // external_callback_ref
  const key = criterion.spec.threshold || criterion.spec.evidence_source || id;
  const callbacks = evidence.callback_results ?? {};
  if (!(key in callbacks) && !(id in callbacks)) {
    return {
      criterion_id: id,
      stub_type,
      status: "uncertain",
      pass: false,
      evidence_ref: pickEvidenceRef(evidence.evidence_refs, id),
      rationale: `external_callback_ref missing for key ${key}`,
    };
  }
  const cbOk = callbacks[key] === true || callbacks[id] === true;
  return {
    criterion_id: id,
    stub_type,
    status: cbOk ? "met" : "unmet",
    pass: cbOk,
    evidence_ref: pickEvidenceRef(evidence.evidence_refs, id) || `callback:${key}`,
    rationale: cbOk ? "callback returned true" : "callback returned false",
  };
}

function decideSatisfaction(
  criteria: CriterionEvalResult[],
  requiredIds: Set<string>,
): SatisfactionDecision {
  if (criteria.length === 0) return "uncertain";

  const required = criteria.filter((c) => requiredIds.has(c.criterion_id));
  const pool = required.length > 0 ? required : criteria;

  if (pool.some((c) => c.status === "uncertain")) return "uncertain";
  if (pool.every((c) => c.pass)) return "success";
  if (pool.some((c) => c.pass)) return "partial_success";
  return "failure";
}

/**
 * Evaluate a goal's success criteria against evidence.
 * Criteria not in `criteriaById` are treated as uncertain for referenced ids.
 */
export function evaluateGoal(
  goal: GoalContract,
  criteriaById: Map<string, SuccessOracleCriterion>,
  evidence: EvidenceRefBundle,
): OracleEvalResult {
  const results: CriterionEvalResult[] = [];
  const requiredIds = new Set<string>();

  for (const ref of goal.spec.success_criteria_refs) {
    const criterion = criteriaById.get(ref);
    if (!criterion) {
      results.push({
        criterion_id: ref,
        stub_type: "presence_of_evidence",
        status: "uncertain",
        pass: false,
        evidence_ref: "",
        rationale: "criterion not found in registry",
      });
      continue;
    }
    if (criterion.spec.required) requiredIds.add(criterion.spec.criterion_id);
    results.push(evaluateCriterion(criterion, evidence));
  }

  const decision = decideSatisfaction(results, requiredIds);
  const uncertain_criteria = results.filter((r) => r.status === "uncertain").map((r) => r.criterion_id);

  const proof: GoalSatisfactionProof = {
    apiVersion: V3_API_VERSION,
    kind: "GoalSatisfactionProof",
    metadata: {
      schema_version: V3_SCHEMA_VERSION,
      goal_id: goal.metadata.id,
    },
    spec: {
      requested_outcome: goal.spec.desired_outcome,
      observed_changes: evidence.evidence_refs.slice(),
      observation_summary: `oracle decision=${decision}; evaluated=${results.length}`,
      criterion_evidence: results.map((r) => ({
        criterion_id: r.criterion_id,
        evidence_ref: r.evidence_ref || "none",
        status: r.status,
      })),
      uncertain_criteria,
      assumptions: ["stub oracle — no LLM"],
      decision,
    },
  };

  const proofValidation = validateGoalSatisfactionProof(proof);
  if (!proofValidation.valid) {
    throw new Error(`GoalSatisfactionProof invalid: ${proofValidation.errors.join("; ")}`);
  }

  return { decision, proof, criteria: results };
}

export class SuccessOracle {
  evaluateCriterion = evaluateCriterion;
  evaluateGoal = evaluateGoal;
}
