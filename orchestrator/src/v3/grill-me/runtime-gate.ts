/**
 * V0-GRILL-01 — Runtime code gate before planning authorization.
 * Deterministic scale classification + structural evidence.
 * An LLM boolean alone is never sufficient proof for medium/large.
 */

import type { SilentScanResult } from "../workspace-scan/silent-scan.js";
import { matchTrivialIntent } from "./trivial-bypass.js";
import type { GrillMeValidation } from "./types.js";

export type RequestScale = "trivial" | "small" | "medium" | "large";

export interface PlanningAuthorization {
  planning_authorized: boolean;
  scale: RequestScale;
  gate_required: boolean;
  reasons: string[];
  /** True only when structural evidence (scan + grill) satisfied the gate. */
  structural_proof: boolean;
}

const LARGE_HINT =
  /\b(refactor|arquitect|architect|migra[cç][aã]o|multi[- ]?repo|plataforma|rewrite|reescrita|sistema completo)\b/i;
const MEDIUM_HINT =
  /\b(feature|endpoint|api|auth|login|dashboard|integra|persist|sqlite|cli|orchestr|worktree|pipeline|m[oó]dulo)\b/i;

/**
 * Classify intent scale. Trivial ops are detected first via regex (zero tokens).
 */
export function classifyRequestScale(intent: string): RequestScale {
  const text = intent.trim();
  if (!text) return "small";
  if (matchTrivialIntent(text)) return "trivial";

  const words = text.split(/\s+/).filter(Boolean).length;
  if (LARGE_HINT.test(text) || words >= 40) return "large";
  if (MEDIUM_HINT.test(text) || words >= 12) return "medium";
  return "small";
}

export interface AuthorizePlanningInput {
  intent: string;
  /** Completed silent scan (required for medium/large). */
  scan?: SilentScanResult;
  /** Grill-Me structural validation (required for medium/large). */
  grill_validation?: GrillMeValidation;
  /**
   * Optional LLM/self-claim that planning is ready.
   * Ignored as proof — if this is the only claim, gate rejects.
   */
  llm_claim_ready?: boolean;
}

/**
 * Authorize planning. Medium/large require runtime gate (scan + grill satisfied).
 * Rejects LLM boolean as sole proof.
 */
export function authorizePlanning(input: AuthorizePlanningInput): PlanningAuthorization {
  const scale = classifyRequestScale(input.intent);
  const reasons: string[] = [];

  if (scale === "trivial") {
    return {
      planning_authorized: false,
      scale,
      gate_required: false,
      reasons: ["trivial_ops_skip_planning"],
      structural_proof: false,
    };
  }

  const gate_required = scale === "medium" || scale === "large";

  const scanOk = Boolean(input.scan?.workspace_root && input.scan.scanned_at);
  const grillOk = Boolean(input.grill_validation?.allow_goal_contract);
  const structural_proof = scanOk && grillOk;

  if (input.llm_claim_ready === true && !structural_proof) {
    reasons.push("llm_boolean_not_proof");
  }

  if (!gate_required) {
    // Small: still require structural grill+scan before authorizing planning;
    // LLM boolean alone never suffices.
    if (!structural_proof) {
      if (!scanOk) reasons.push("runtime_scan_required");
      if (!grillOk) reasons.push("grill_validation_required");
    }
    return {
      planning_authorized: structural_proof,
      scale,
      gate_required: false,
      reasons,
      structural_proof,
    };
  }

  // Medium / large — mandatory runtime code gate
  if (!scanOk) reasons.push("runtime_scan_required");
  if (!input.grill_validation) {
    reasons.push("grill_validation_required");
  } else if (!input.grill_validation.allow_goal_contract) {
    reasons.push(`grill_blocked:${input.grill_validation.reasons.join(",") || "unknown"}`);
  }
  if (input.llm_claim_ready === true && structural_proof) {
    reasons.push("llm_claim_ignored_structural_proof_used");
  }
  if (!structural_proof && !reasons.includes("runtime_scan_required") && !reasons.includes("grill_validation_required")) {
    reasons.push("gate_not_satisfied");
  }

  return {
    planning_authorized: structural_proof,
    scale,
    gate_required: true,
    reasons,
    structural_proof,
  };
}

/** Narrow helper: planning authorized iff structural gate passed for the scale. */
export function assertPlanningAuthorized(auth: PlanningAuthorization): void {
  if (!auth.planning_authorized) {
    throw new Error(
      `PLANNING_BLOCKED scale=${auth.scale} gate_required=${auth.gate_required}: ${auth.reasons.join("; ")}`,
    );
  }
}
