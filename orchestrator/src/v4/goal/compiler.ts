/**
 * Goal Compiler — intent → versioned Goal Contract (constitution §4.2, §7.1).
 *
 * Does not invent acceptance criteria without making origin visible (ASSUMED).
 * Blocking ambiguities produce NEEDS_CLARIFICATION and the minimal question set.
 * Effective autonomy is Policy (M10); this field is vocabulary only.
 */

import {
  DEFAULT_TENANT_ID,
  GOAL_CONTRACT_SCHEMA_VERSION,
  type ActorRef,
  type GoalConstraint,
  type GoalContract,
  type IsoTimestamp,
  type AcceptanceCriterion,
  validateGoalContract,
} from "../contracts/index.js";
import { constraintKindConflict, detectIntentIssues, type Contradiction } from "./detect.js";
import { isUntrusted, type IntentIngest, type MarkedText } from "./intent.js";

export interface ClarifyingQuestion {
  ambiguity_id: string;
  question: string;
  blocking: boolean;
}

export interface CompileInput {
  work_id: string;
  goal_contract_id: string;
  version: number;
  supersedes_version?: number;
  now: IsoTimestamp;
  actor: ActorRef;
}

export interface CompileResult {
  contract: GoalContract;
  questions: ClarifyingQuestion[];
  contradictions: Contradiction[];
}

function controlOrUndefined(marked: MarkedText | undefined): string | undefined {
  if (!marked || isUntrusted(marked)) return undefined;
  const t = marked.text.trim();
  return t.length > 0 ? t : undefined;
}

function controlList(items: MarkedText[] | undefined): string[] {
  return (items ?? []).map((i) => controlOrUndefined(i)).filter((s): s is string => Boolean(s));
}

export function compileIntent(intent: IntentIngest, input: CompileInput): CompileResult {
  const detected = detectIntentIssues(intent);
  const questions = detected.questions;
  const blockingOpen = detected.ambiguities.some((a) => a.status === "OPEN" && a.blocking);

  const objective =
    controlOrUndefined(intent.objective) ??
    "Unconfirmed intent (quoted untrusted text is not CONTROL; see ambiguities)";

  const constraints: GoalConstraint[] = [];
  for (const [i, c] of (intent.constraints ?? []).entries()) {
    const statement = controlOrUndefined(c.statement);
    if (!statement) continue;
    constraints.push({
      constraint_id: `cst_${i + 1}`,
      kind: c.kind,
      statement,
      origin: "USER_STATED",
      value: c.value,
    });
  }
  const extraConflicts = constraintKindConflict(constraints);

  const criteria: AcceptanceCriterion[] = [];
  for (const [i, c] of (intent.acceptance_criteria ?? []).entries()) {
    const statement = controlOrUndefined(c.statement);
    if (!statement) continue;
    criteria.push({
      criterion_id: `crit_${i + 1}`,
      statement,
      mandatory: c.mandatory !== false,
      origin: "USER_STATED",
      verification_methods: c.verification_methods ?? ["AUTOMATED_TEST"],
      evidence_required: c.evidence_required ?? ["test_report"],
    });
  }

  const status = blockingOpen || extraConflicts.some((c) => c.blocking) ? "NEEDS_CLARIFICATION" : "DRAFT";

  const contract: GoalContract = {
    kind: "GoalContract",
    schema_version: GOAL_CONTRACT_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    goal_contract_id: input.goal_contract_id,
    version: input.version,
    supersedes_version: input.supersedes_version,
    work_id: input.work_id,
    status,
    objective,
    scope: controlList(intent.scope),
    out_of_scope: controlList(intent.out_of_scope),
    constraints,
    acceptance_criteria: criteria,
    assumptions: detected.assumptions,
    ambiguities: detected.ambiguities,
    risks: [
      ...(intent.risks ?? []),
      ...detected.contradictions.map((c) => `contradiction:${c.statement}`),
      ...extraConflicts.map((c) => `contradiction:${c.statement}`),
    ],
    dependencies: intent.dependencies ?? [],
    budget: intent.budget,
    deadline: intent.deadline,
    execution: {
      autonomy: intent.autonomy ?? "L1_EXECUTE",
      verification: intent.verification ?? "INDEPENDENT",
      recovery_enabled: intent.recovery_enabled ?? true,
    },
    stop_conditions: intent.stop_conditions ?? [],
    created_at: input.now,
    created_by: input.actor,
  };

  const validated = validateGoalContract(contract);
  if (!validated.valid) {
    contract.status = "NEEDS_CLARIFICATION";
    contract.ambiguities = [
      ...contract.ambiguities,
      {
        ambiguity_id: "amb_contract_invalid",
        question: `Goal Contract failed structural validation: ${validated.issues.map((i) => i.code).join(", ")}`,
        status: "OPEN",
        blocking: true,
      },
    ];
    questions.push({
      ambiguity_id: "amb_contract_invalid",
      question: contract.ambiguities[contract.ambiguities.length - 1]!.question,
      blocking: true,
    });
  }

  return {
    contract,
    questions: questions.filter((q, i, arr) => arr.findIndex((x) => x.ambiguity_id === q.ambiguity_id) === i),
    contradictions: [...detected.contradictions, ...extraConflicts],
  };
}

export function blockingQuestions(result: CompileResult): ClarifyingQuestion[] {
  return result.questions.filter((q) => q.blocking);
}
