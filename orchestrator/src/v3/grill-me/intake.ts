/**
 * Grill-Me → Goal Contract intake (fail-closed).
 * Does not run an LLM interview; applies a validated GRILL_ME_RESULT artefact.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoalContractStore } from "../goal-contract/store.js";
import type { GoalContract, GoalContractCreateInput } from "../goal-contract/types.js";
import type { GrillMeResult, GrillMeValidation } from "./types.js";

export class GrillMeIntakeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GrillMeIntakeError";
  }
}

export function validateGrillMeResult(
  result: GrillMeResult,
  opts?: { exempt?: boolean; exempt_reason?: string },
): GrillMeValidation {
  if (opts?.exempt) {
    return {
      status: "exempt",
      allow_goal_contract: true,
      reasons: [opts.exempt_reason ?? "explicit_exempt"],
    };
  }

  const reasons: string[] = [];
  if (result.kind !== "GRILL_ME_RESULT") reasons.push("invalid_kind");
  if (!result.problem_understood) reasons.push("problem_not_understood");
  if (!result.requirements_challenged) reasons.push("requirements_not_challenged");
  if (!result.user_confirmed_shared_understanding) {
    reasons.push("shared_understanding_not_confirmed");
  }
  if (!result.readiness_for_planning) reasons.push("not_ready_for_planning");
  if (!result.accepted_scope?.length) reasons.push("accepted_scope_empty");
  // rejected_scope may be empty (nothing excluded) — allowed
  if (result.open_questions?.length) {
    reasons.push(`open_questions_remain:${result.open_questions.length}`);
  }

  if (reasons.length > 0) {
    return { status: "blocked", allow_goal_contract: false, reasons };
  }
  return { status: "satisfied", allow_goal_contract: true, reasons: [] };
}

export function goalContractInputFromGrillMe(
  goalContractId: string,
  objectiveFallback: string,
  result: GrillMeResult,
  workId?: string,
): GoalContractCreateInput {
  const objective = result.objective?.trim() || objectiveFallback;
  const criteria =
    result.acceptance_criteria && result.acceptance_criteria.length > 0
      ? result.acceptance_criteria.map((c) => ({
          id: c.id,
          description: c.description,
          mandatory: c.mandatory !== false,
          verification: [
            { id: `v-${c.id}`, kind: "manual" as const, description: "verifier evidence required" },
          ],
          evidence_required: c.evidence_required ?? ["acceptance-evidence"],
        }))
      : [
          {
            id: "c-objective",
            description: `Objective satisfied: ${objective}`,
            mandatory: true,
            verification: [
              { id: "v-manual", kind: "manual" as const, description: "verifier evidence required" },
            ],
            evidence_required: ["acceptance-evidence"],
          },
        ];

  return {
    goal_contract_id: goalContractId,
    objective,
    scope: result.accepted_scope ?? [],
    out_of_scope: result.rejected_scope ?? [],
    functional_requirements: result.functional_requirements ?? [],
    non_functional_requirements: result.non_functional_requirements ?? [],
    constraints: result.constraints ?? [],
    dependencies: result.dependencies ?? [],
    risks: result.risks_identified ?? [],
    criteria,
    work_id: workId,
  };
}

export interface ApplyGrillMeOptions {
  dataGoalContractsDir: string;
  evidenceDir: string;
  goal_contract_id: string;
  objective: string;
  work_id?: string;
  result: GrillMeResult;
  exempt?: boolean;
  exempt_reason?: string;
}

export interface ApplyGrillMeOutcome {
  validation: GrillMeValidation;
  contract?: GoalContract;
  evidence_path: string;
}

/**
 * Validates Grill-Me result, writes gate evidence, creates Goal Contract when allowed.
 */
export function applyGrillMeToGoalContract(opts: ApplyGrillMeOptions): ApplyGrillMeOutcome {
  const validation = validateGrillMeResult(opts.result, {
    exempt: opts.exempt,
    exempt_reason: opts.exempt_reason,
  });

  mkdirSync(opts.evidenceDir, { recursive: true });
  const evidence_path = join(opts.evidenceDir, "gate.grill-me.json");
  const evidence = {
    gate: "grill-me",
    required: !opts.exempt,
    status: validation.status,
    skill_id: "grill-me",
    skill_version: "2.0.0",
    timestamp: new Date().toISOString(),
    work_id: opts.work_id,
    goal_contract_id: opts.goal_contract_id,
    reasons: validation.reasons,
    result: opts.result,
  };
  writeFileSync(evidence_path, JSON.stringify(evidence, null, 2), "utf-8");

  if (!validation.allow_goal_contract) {
    throw new GrillMeIntakeError(
      "GRILL_ME_BLOCKED",
      `Esclarecimento bloqueou o contrato: ${validation.reasons.join(", ")}`,
    );
  }

  const store = new GoalContractStore(opts.dataGoalContractsDir);
  const input = goalContractInputFromGrillMe(
    opts.goal_contract_id,
    opts.objective,
    opts.result,
    opts.work_id,
  );
  const contract = store.create(input);
  return { validation, contract, evidence_path };
}
