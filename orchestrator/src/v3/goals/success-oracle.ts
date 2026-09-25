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
 * Narrative / agent-claim strings (whitespace in the ref) are never eligible.
 */
export function isEligibleEvidenceRef(ref: string): boolean {
  const trimmed = ref.trim();
  if (trimmed.length === 0) return false;
  // Agent narrative / free-text claims are not evidence refs
  if (/\s/.test(trimmed)) return false;
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
  /**
   * Executor identity that produced effects/evidence.
   * Required (with verifier_id) for decision=success — executor≠verifier.
   */
  executor_id?: string;
  /**
   * Verifier identity that evaluated criteria.
   * Must differ from executor_id for decision=success.
   */
  verifier_id?: string;
  /**
   * Goal revision under which evidence was collected.
   * When set and older than goal.spec.goal_version.revision → stale (no success).
   */
  evidence_goal_revision?: number;
  /**
   * Explicit binding that desired_outcome was observed met.
   * When false, presence-only criteria must not yield success.
   * When undefined, left to caller policy (adversarial suite treats missing as fail-closed for outcome attacks).
   */
  outcome_met?: boolean;
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

  const decisionRaw = decideSatisfaction(results, requiredIds);
  let decision = decisionRaw;
  const assumptions = ["stub oracle — no LLM"];
  const uncertain_criteria = results
    .filter((r) => r.status === "uncertain")
    .map((r) => r.criterion_id);

  // Contract: executor≠verifier — success requires distinct identities.
  if (decision === "success") {
    const exec = evidence.executor_id?.trim() ?? "";
    const ver = evidence.verifier_id?.trim() ?? "";
    if (!exec || !ver) {
      decision = "uncertain";
      assumptions.push("success withheld — executor_id and verifier_id required (executor≠verifier)");
      if (!uncertain_criteria.includes("__executor_verifier__")) {
        uncertain_criteria.push("__executor_verifier__");
      }
    } else if (exec === ver) {
      decision = "failure";
      assumptions.push("success rejected — executor_id === verifier_id (self-verification forbidden)");
    }
  }

  // RT-05b: evidence_goal_revision must match current goal_version.revision for success.
  // Missing stamp after mutation (or anytime) must not yield success.
  if (decision === "success") {
    const currentRev = goal.spec.goal_version.revision;
    const stamped = evidence.evidence_goal_revision;
    if (stamped === undefined || stamped === null || Number.isNaN(Number(stamped))) {
      decision = "failure";
      assumptions.push(
        `evidence_goal_revision required for success (goal.revision=${currentRev}) — omit stamp rejected`,
      );
    } else if (stamped !== currentRev) {
      decision = "failure";
      assumptions.push(
        stamped < currentRev
          ? `stale evidence_goal_revision=${stamped} < goal.revision=${currentRev}`
          : `evidence_goal_revision=${stamped} !== goal.revision=${currentRev}`,
      );
    }
  }

  // RT-09b / desired_outcome binding: presence_of_evidence alone is insufficient when
  // desired_outcome is set — require outcome_met:true or a non-presence criterion pass.
  if (decision === "success" && evidence.outcome_met === false) {
    decision = "failure";
    assumptions.push("desired_outcome unmet (outcome_met=false) — false success rejected");
  } else if (decision === "success") {
    const desired = goal.spec.desired_outcome?.trim() ?? "";
    if (desired.length > 0) {
      const hasOutcomeCriterionPass = results.some(
        (r) =>
          r.pass &&
          (r.stub_type === "boolean_predicate" || r.stub_type === "external_callback_ref"),
      );
      if (evidence.outcome_met !== true && !hasOutcomeCriterionPass) {
        decision = "partial_success";
        assumptions.push(
          "desired_outcome set but unproven — require outcome_met:true or boolean_predicate/callback covering outcome (presence_of_evidence alone insufficient)",
        );
      }
    }
  }

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
      assumptions,
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
