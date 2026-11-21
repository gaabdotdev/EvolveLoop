/**
 * V0 Grill-Me session (deterministic, no LLM).
 * Internal prompts: English telegraphic. User UX: Portuguese.
 * Hard cap 3–5 high-impact questions; each has a default (Enter/ok).
 */

import type { SilentScanResult } from "../workspace-scan/silent-scan.js";
import type { GrillMeResult } from "./types.js";

export const GRILL_ME_MIN_QUESTIONS = 3;
export const GRILL_ME_MAX_QUESTIONS = 5;

export interface GrillMeQuestion {
  id: string;
  /** User-facing Portuguese prompt */
  prompt_pt: string;
  /** Internal English telegraphic label (for logs / future LLM) */
  internal_en: string;
  /** Default recommendation (Enter / ok) */
  default_answer: string;
  field: "scope" | "out_of_scope" | "acceptance" | "constraints" | "confirm";
}

export interface GrillMeAnswer {
  id: string;
  value: string;
  used_default: boolean;
}

function clampQuestions(qs: GrillMeQuestion[]): GrillMeQuestion[] {
  if (qs.length <= GRILL_ME_MAX_QUESTIONS) {
    if (qs.length >= GRILL_ME_MIN_QUESTIONS) return qs;
    // Ensure minimum by keeping confirm last; pad should not happen with builder
    return qs;
  }
  return qs.slice(0, GRILL_ME_MAX_QUESTIONS);
}

/**
 * Build high-impact questions from intent + silent scan.
 * Never asks what the scan already answered (language, package manager, git dirty).
 */
export function buildGrillMeQuestions(intent: string, scan: SilentScanResult): GrillMeQuestion[] {
  const objective = intent.trim();
  const langHint = scan.languages[0] ?? "stack detectada no scan";
  // V0 ready path: exactly 4 high-impact questions (within rigid 3–5 cap).
  // Repo facts (lang/pm/git) come from silent scan — never re-asked here.
  const constraintDefault =
    scan.git.dirty || scan.languages.length > 1
      ? `Não editar fora do repo; sem push; dirty=${scan.git.dirty}; langs=${scan.languages.join(",") || langHint}.`
      : "Não editar fora do repo; sem push; preservar working tree coerente.";

  const qs: GrillMeQuestion[] = [
    {
      id: "q-scope",
      prompt_pt: `Qual é o escopo IN (o que entra nesta entrega)?`,
      internal_en: `scope.in intent="${objective.slice(0, 80)}"`,
      default_answer: `Entregar: ${objective}`,
      field: "scope",
    },
    {
      id: "q-oos",
      prompt_pt: `O que fica FORA de escopo nesta rodada?`,
      internal_en: `scope.out skip_repo_facts lang=${langHint}`,
      default_answer: "Sem Bloco 3 / adapters E2E / refactors amplos; só o necessário para o objetivo.",
      field: "out_of_scope",
    },
    {
      id: "q-accept",
      prompt_pt: `Qual critério de aceite verificável fecha o Goal Contract?`,
      internal_en: `acceptance.default build+unit_tests green`,
      default_answer: "Build e testes relevantes verdes; Goal Contract validado no SQLite.",
      field: "acceptance",
    },
    {
      id: "q-constraints",
      prompt_pt: `Quais restrições operacionais valem para esta execução?`,
      internal_en: `constraints.git_dirty=${scan.git.dirty} langs=${scan.languages.join(",")}`,
      default_answer: constraintDefault,
      field: "constraints",
    },
  ];

  // Optional 5th (still ≤5): shared-understanding confirm when intent is long/ambiguous
  if (objective.length > 90 || /\b(talvez|maybe|ou|or)\b/i.test(objective)) {
    qs.push({
      id: "q-confirm",
      prompt_pt: `Confirma entendimento partilhado do objetivo "${objective.slice(0, 60)}${objective.length > 60 ? "…" : ""}"?`,
      internal_en: `confirm.shared_understanding=true`,
      default_answer: "ok",
      field: "confirm",
    });
  }

  return clampQuestions(qs);
}

export function resolveAnswers(
  questions: GrillMeQuestion[],
  rawAnswers?: Array<string | undefined> | Record<string, string>,
): GrillMeAnswer[] {
  return questions.map((q, i) => {
    let value: string | undefined;
    if (Array.isArray(rawAnswers)) {
      value = rawAnswers[i];
    } else if (rawAnswers && typeof rawAnswers === "object") {
      value = rawAnswers[q.id] ?? rawAnswers[String(i)];
    }
    const trimmed = value?.trim();
    if (!trimmed || trimmed.toLowerCase() === "ok" || trimmed === "") {
      return { id: q.id, value: q.default_answer, used_default: !trimmed || trimmed.toLowerCase() === "ok" };
    }
    return { id: q.id, value: trimmed, used_default: false };
  });
}

export function buildGrillMeResultFromAnswers(
  intent: string,
  scan: SilentScanResult,
  questions: GrillMeQuestion[],
  answers: GrillMeAnswer[],
): GrillMeResult {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const scope = byId.get("q-scope")?.value ?? intent;
  const oos = byId.get("q-oos")?.value ?? "out of scope defaults";
  const acceptance = byId.get("q-accept")?.value ?? "build+tests";
  const constraints = byId.get("q-constraints")?.value;
  const confirmQ = questions.find((q) => q.id === "q-confirm");
  const confirm = byId.get("q-confirm")?.value;
  // Absent confirm question ⇒ implied shared understanding after high-impact answers.
  const confirmed = !confirmQ
    ? true
    : Boolean(
        confirm &&
          (confirm.toLowerCase() === "ok" ||
            confirm.toLowerCase() === "sim" ||
            confirm.toLowerCase() === "yes" ||
            confirm === confirmQ.default_answer),
      );

  return {
    kind: "GRILL_ME_RESULT",
    problem_understood: true,
    requirements_challenged: true,
    ambiguities_found: [],
    assumptions_exposed: [
      `scan.languages=${scan.languages.join(",") || "unknown"}`,
      `scan.package_managers=${scan.package_managers.join(",") || "none"}`,
      `defaults_applied=${answers.filter((a) => a.used_default).length}/${answers.length}`,
    ],
    risks_identified: scan.git.dirty ? ["workspace_dirty"] : [],
    open_questions: [],
    accepted_scope: [scope],
    rejected_scope: [oos],
    readiness_for_planning: confirmed,
    user_confirmed_shared_understanding: confirmed,
    objective: intent.trim(),
    constraints: constraints ? [constraints] : ["no_push", "repo_local_only"],
    acceptance_criteria: [
      {
        id: "c-accept",
        description: acceptance,
        mandatory: true,
        evidence_required: ["acceptance-evidence"],
      },
    ],
  };
}

export function formatQuestionForUser(q: GrillMeQuestion, index: number, total: number): string {
  return [
    `Pergunta ${index}/${total} [${q.id}]`,
    q.prompt_pt,
    `Recomendação (Enter/ok): ${q.default_answer}`,
    `(interno: ${q.internal_en})`,
  ].join("\n");
}

export function summarizeContractLines(input: {
  goal_contract_id: string;
  objective: string;
  scope: string[];
  out_of_scope: string[];
  acceptance: string;
  db_path: string;
}): string[] {
  return [
    `Goal Contract: ${input.goal_contract_id}`,
    `Objetivo: ${input.objective}`,
    `Escopo: ${input.scope.join("; ") || "—"}`,
    `Fora: ${input.out_of_scope.join("; ") || "—"}`,
    `Aceite: ${input.acceptance}`,
    `SQLite: ${input.db_path}`,
  ].slice(0, 6);
}
