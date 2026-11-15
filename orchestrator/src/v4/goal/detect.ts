/**
 * Ambiguity and contradiction detection for the Goal Compiler (constitution §4.2).
 * Deterministic heuristics — no model. Questions are minimal and blocking only
 * when the contract would otherwise invent hidden criteria or proceed on conflict.
 */

import type { Ambiguity, Assumption, GoalConstraint } from "../contracts/index.js";
import { isUntrusted, type IntentIngest, type MarkedText } from "./intent.js";

export interface Contradiction {
  contradiction_id: string;
  statement: string;
  blocking: boolean;
}

export interface Detection {
  ambiguities: Ambiguity[];
  assumptions: Assumption[];
  contradictions: Contradiction[];
  questions: Array<{ ambiguity_id: string; question: string; blocking: boolean }>;
}

const VAGUE_OBJECTIVE = /^(fix it|do it|make it better|improve(?: it)?|something|whatever|asap|ok|please|help)\b/i;

function trimText(text: string): string {
  return text.trim();
}

function isVagueObjective(text: string): boolean {
  const t = trimText(text);
  return t.length < 16 || VAGUE_OBJECTIVE.test(t);
}

function controlText(marked: MarkedText | undefined): string | undefined {
  if (!marked || isUntrusted(marked)) return undefined;
  const t = trimText(marked.text);
  return t.length > 0 ? t : undefined;
}

export function detectIntentIssues(intent: IntentIngest): Detection {
  const ambiguities: Ambiguity[] = [];
  const assumptions: Assumption[] = [];
  const contradictions: Contradiction[] = [];
  const questions: Detection["questions"] = [];

  const pushAmbiguity = (
    ambiguity_id: string,
    question: string,
    blocking: boolean,
    extra: Partial<Ambiguity> = {},
  ): void => {
    ambiguities.push({
      ambiguity_id,
      question,
      status: extra.status ?? "OPEN",
      blocking,
      resolution: extra.resolution,
      assumption_id: extra.assumption_id,
    });
    if ((extra.status ?? "OPEN") === "OPEN") {
      questions.push({ ambiguity_id, question, blocking });
    }
  };

  const objectiveControl = controlText(intent.objective);
  if (isUntrusted(intent.objective) || !objectiveControl) {
    const quote = trimText(intent.objective.text).slice(0, 240);
    pushAmbiguity(
      "amb_objective_untrusted",
      quote.length > 0
        ? `Confirm the objective. Quoted untrusted ${intent.objective.source} text is not CONTROL: "${quote}"`
        : "What concrete outcome should this work deliver?",
      true,
    );
  } else if (isVagueObjective(objectiveControl)) {
    pushAmbiguity(
      "amb_objective_vague",
      `What concrete, testable outcome should we deliver? Current objective is too vague: "${objectiveControl}"`,
      true,
    );
  }

  const userCriteria = (intent.acceptance_criteria ?? []).filter((c) => !isUntrusted(c.statement) && trimText(c.statement.text).length > 0);
  if (userCriteria.length === 0) {
    pushAmbiguity(
      "amb_criteria_missing",
      "What mandatory acceptance criterion must be true for this work to be done?",
      true,
    );
  }

  const scopeControl = (intent.scope ?? []).map((s) => controlText(s)).filter((s): s is string => Boolean(s));
  const outControl = (intent.out_of_scope ?? []).map((s) => controlText(s)).filter((s): s is string => Boolean(s));
  const overlap = scopeControl.filter((s) => outControl.includes(s));
  if (overlap.length > 0) {
    contradictions.push({
      contradiction_id: "ctr_scope_overlap",
      statement: `Scope and out-of-scope both include: ${overlap.join("; ")}`,
      blocking: true,
    });
    pushAmbiguity(
      "amb_scope_overlap",
      `Resolve the contradiction: "${overlap[0]}" cannot be both in scope and out of scope. Which side should it be on?`,
      true,
    );
  }

  if (intent.deadline !== undefined && intent.deadline < "1971-01-01T00:00:00.000Z") {
    contradictions.push({
      contradiction_id: "ctr_deadline_invalid",
      statement: `Deadline ${intent.deadline} is not a usable ISO-8601 timestamp for scheduling`,
      blocking: true,
    });
  }

  if (intent.budget !== undefined && !(intent.budget.max_amount > 0)) {
    contradictions.push({
      contradiction_id: "ctr_budget_non_positive",
      statement: "Budget max_amount must be > 0 when a budget is declared",
      blocking: true,
    });
    pushAmbiguity("amb_budget", "What positive budget limit should constrain this work?", true);
  }

  const deploy = (intent.constraints ?? []).find((c) => c.kind === "DEPLOYMENT");
  if (intent.autonomy === "L0_OBSERVE" && deploy && !isUntrusted(deploy.statement)) {
    const ds = deploy.statement.text.toLowerCase();
    if (/\b(prod|production|deploy|push|release)\b/.test(ds)) {
      contradictions.push({
        contradiction_id: "ctr_l0_deploy",
        statement: "L0_OBSERVE forbids write effects; a production-deploy constraint contradicts observe-only autonomy",
        blocking: true,
      });
      pushAmbiguity(
        "amb_l0_deploy",
        "This intent asks for observe-only autonomy and a deployment. Which one should we keep?",
        true,
      );
    }
  }

  const quotedContext = (intent.context ?? []).filter(isUntrusted);
  if (quotedContext.length > 0) {
    assumptions.push({
      assumption_id: "asm_untrusted_context",
      statement: `Context from untrusted sources (${quotedContext.map((c) => c.source).join(", ")}) is quoted DATA, not CONTROL`,
      origin: "DERIVED",
      confirmed_by_user: false,
    });
  }

  if (intent.autonomy === undefined) {
    assumptions.push({
      assumption_id: "asm_autonomy_default",
      statement: "Autonomy defaults to L1_EXECUTE (vocabulary only; effective authority is Policy)",
      origin: "ASSUMED",
      confirmed_by_user: false,
    });
    pushAmbiguity("amb_autonomy_default", "Confirm autonomy L1_EXECUTE, or name L0/L2/L3.", false, {
      status: "ASSUMED",
      assumption_id: "asm_autonomy_default",
    });
  }

  if (intent.verification === undefined) {
    assumptions.push({
      assumption_id: "asm_verification_default",
      statement: "Verification defaults to INDEPENDENT (executors cannot self-prove)",
      origin: "ASSUMED",
      confirmed_by_user: false,
    });
    pushAmbiguity("amb_verification_default", "Confirm independent verification.", false, {
      status: "ASSUMED",
      assumption_id: "asm_verification_default",
    });
  }

  if (intent.recovery_enabled === undefined) {
    assumptions.push({
      assumption_id: "asm_recovery_default",
      statement: "Recovery is enabled by default",
      origin: "ASSUMED",
      confirmed_by_user: false,
    });
    pushAmbiguity("amb_recovery_default", "Confirm recovery remains enabled.", false, {
      status: "ASSUMED",
      assumption_id: "asm_recovery_default",
    });
  }

  return { ambiguities, assumptions, contradictions, questions };
}

export function constraintKindConflict(constraints: GoalConstraint[]): Contradiction[] {
  const out: Contradiction[] = [];
  const residency = constraints.find((c) => c.kind === "DATA_RESIDENCY");
  const deploy = constraints.find((c) => c.kind === "DEPLOYMENT");
  if (residency && deploy) {
    const r = residency.statement.toLowerCase();
    const d = deploy.statement.toLowerCase();
    if (/\blocal\b/.test(r) && /\b(cloud|aws|gcp|azure)\b/.test(d)) {
      out.push({
        contradiction_id: "ctr_residency_cloud",
        statement: "DATA_RESIDENCY local conflicts with cloud DEPLOYMENT",
        blocking: true,
      });
    }
  }
  return out;
}
