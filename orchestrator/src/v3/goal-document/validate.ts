/**
 * Deterministic structural validation for Goal Document / Goal Contract v1.
 * Rejects LLM boolean fields as sole (or any) proof of readiness.
 */

import type { GoalContract } from "../goal-contract/types.js";
import type { GoalDocument, GoalDocumentValidation } from "./types.js";

const LLM_PROOF_KEYS = new Set([
  "llm_ready",
  "llm_says_ready",
  "llm_says_pass",
  "llm_boolean",
  "model_says_ready",
  "assistant_ready",
  "ai_confirmed",
]);

function collectLlmProofKeys(obj: unknown, path = ""): string[] {
  if (obj == null || typeof obj !== "object") return [];
  const found: string[] = [];
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => found.push(...collectLlmProofKeys(v, `${path}[${i}]`)));
    return found;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (LLM_PROOF_KEYS.has(k) && v === true) {
      found.push(p);
    }
    found.push(...collectLlmProofKeys(v, p));
  }
  return found;
}

export function validateGoalDocumentStructural(doc: unknown): GoalDocumentValidation {
  const reasons: string[] = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, reasons: ["not_an_object"] };
  }
  const d = doc as Partial<GoalDocument> & Record<string, unknown>;

  if (d.kind !== "GoalDocument") reasons.push("invalid_kind");
  if (!d.goal_document_id?.trim()) reasons.push("missing_goal_document_id");
  if (!d.goal_contract_id?.trim()) reasons.push("missing_goal_contract_id");
  if (typeof d.version !== "number" || d.version < 1) reasons.push("invalid_version");
  if (!d.objective?.trim()) reasons.push("missing_objective");
  if (!d.title?.trim()) reasons.push("missing_title");
  if (!Array.isArray(d.scope_in) || d.scope_in.length === 0) reasons.push("scope_in_empty");
  if (!Array.isArray(d.acceptance) || d.acceptance.length === 0) reasons.push("acceptance_empty");
  else {
    for (const a of d.acceptance) {
      if (!a?.id?.trim() || !a.description?.trim()) reasons.push("acceptance_item_incomplete");
      if (!a?.verification_kind) reasons.push("acceptance_missing_verification_kind");
      if (!Array.isArray(a?.evidence_required) || a.evidence_required.length === 0) {
        reasons.push(`acceptance_missing_evidence:${a?.id ?? "?"}`);
      }
    }
  }

  const checks = d.structural_checks;
  if (!checks || typeof checks !== "object") {
    reasons.push("structural_checks_missing");
  } else {
    if (checks.has_objective !== true) reasons.push("structural_has_objective_false");
    if (checks.has_scope !== true) reasons.push("structural_has_scope_false");
    if (checks.has_acceptance !== true) reasons.push("structural_has_acceptance_false");
    if (checks.scan_completed !== true) reasons.push("structural_scan_not_completed");
    if (checks.grill_gate_status !== "satisfied" && checks.grill_gate_status !== "exempt") {
      reasons.push(`structural_grill_gate:${checks.grill_gate_status}`);
    }
    if ((checks as { llm_boolean_accepted_as_proof?: unknown }).llm_boolean_accepted_as_proof !== false) {
      reasons.push("llm_boolean_accepted_as_proof_must_be_false");
    }
  }

  const llmKeys = collectLlmProofKeys(d);
  if (llmKeys.length > 0) {
    reasons.push(`llm_boolean_not_proof:${llmKeys.join(",")}`);
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Structural Goal Contract checks — criteria + verification required;
 * rejects LLM boolean proof fields embedded in payload.
 */
export function validateGoalContractStructural(contract: unknown): GoalDocumentValidation {
  const reasons: string[] = [];
  if (!contract || typeof contract !== "object") {
    return { ok: false, reasons: ["not_an_object"] };
  }
  const c = contract as Partial<GoalContract> & Record<string, unknown>;
  if (c.kind !== "GoalContract") reasons.push("invalid_kind");
  if (!c.goal_contract_id?.trim()) reasons.push("missing_goal_contract_id");
  if (!c.objective?.trim()) reasons.push("missing_objective");
  if (!Array.isArray(c.criteria) || c.criteria.length === 0) reasons.push("criteria_empty");
  else {
    for (const crit of c.criteria) {
      if (!crit?.id || !crit.description) reasons.push("criterion_incomplete");
      if (!Array.isArray(crit.verification) || crit.verification.length === 0) {
        reasons.push(`criterion_missing_verification:${crit?.id ?? "?"}`);
      }
      if (!Array.isArray(crit.evidence_required) || crit.evidence_required.length === 0) {
        reasons.push(`criterion_missing_evidence_required:${crit?.id ?? "?"}`);
      }
    }
  }

  const llmKeys = collectLlmProofKeys(c);
  if (llmKeys.length > 0) {
    reasons.push(`llm_boolean_not_proof:${llmKeys.join(",")}`);
  }

  // Explicit: readiness flags without criteria are not enough (already covered by criteria_empty)
  if (
    (c as { readiness_for_planning?: boolean }).readiness_for_planning === true &&
    (!Array.isArray(c.criteria) || c.criteria.length === 0)
  ) {
    reasons.push("llm_boolean_not_proof:readiness_for_planning");
  }

  return { ok: reasons.length === 0, reasons };
}
