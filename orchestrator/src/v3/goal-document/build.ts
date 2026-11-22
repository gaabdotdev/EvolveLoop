/**
 * Build Goal Document v1 from intent flow artefacts (deterministic).
 */

import { createHash } from "node:crypto";
import type { GoalContract } from "../goal-contract/types.js";
import type { GrillMeValidation } from "../grill-me/types.js";
import type { SilentScanResult } from "../workspace-scan/silent-scan.js";
import type { GoalDocument } from "./types.js";

export function buildGoalDocument(input: {
  contract: GoalContract;
  scan: SilentScanResult;
  grill_validation: GrillMeValidation;
  title?: string;
}): GoalDocument {
  const ts = new Date().toISOString();
  const hash = createHash("sha256")
    .update(`${input.contract.goal_contract_id}:${input.contract.version}`)
    .digest("hex")
    .slice(0, 10);
  const grill =
    input.grill_validation.status === "exempt"
      ? "exempt"
      : input.grill_validation.allow_goal_contract
        ? "satisfied"
        : "blocked";

  return {
    kind: "GoalDocument",
    goal_document_id: `gd-${hash}`,
    goal_contract_id: input.contract.goal_contract_id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    title: input.title?.trim() || input.contract.objective.slice(0, 80),
    objective: input.contract.objective,
    context_from_scan: {
      languages: [...input.scan.languages],
      package_managers: [...input.scan.package_managers],
      git_branch: input.scan.git.branch,
      dirty: input.scan.git.dirty,
    },
    scope_in: [...input.contract.scope],
    scope_out: [...input.contract.out_of_scope],
    acceptance: input.contract.criteria.map((c) => ({
      id: c.id,
      description: c.description,
      verification_kind: c.verification[0]?.kind ?? "manual",
      evidence_required: [...c.evidence_required],
    })),
    constraints: [...input.contract.constraints],
    structural_checks: {
      has_objective: Boolean(input.contract.objective.trim()),
      has_scope: input.contract.scope.length > 0,
      has_acceptance: input.contract.criteria.length > 0,
      scan_completed: Boolean(input.scan.scanned_at),
      grill_gate_status: grill,
      llm_boolean_accepted_as_proof: false,
    },
  };
}
