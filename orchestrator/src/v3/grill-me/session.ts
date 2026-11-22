/**
 * V0 Grill-Me session (deterministic, no LLM).
 * Internal prompts: English telegraphic. User UX: Portuguese.
 * Adaptive: detailed intents → review-only; vague → 2–3 high-impact questions.
 */

import type { SilentScanResult } from "../workspace-scan/silent-scan.js";
import type { GrillMeResult } from "./types.js";
import {
  assessIntentDetail,
  deriveScopeFromIntent,
  scrubInternalJargon,
} from "./adaptive.js";

export const GRILL_ME_MIN_QUESTIONS = 2;
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
  /** Optional select choices for interactive UX (Ink Select / MultiSelect). */
  choices?: string[];
}

export interface GrillMeAnswer {
  id: string;
  value: string;
  used_default: boolean;
}

function clampQuestions(qs: GrillMeQuestion[], max: number): GrillMeQuestion[] {
  const capped = qs.slice(0, Math.min(max, GRILL_ME_MAX_QUESTIONS));
  if (capped.length >= GRILL_ME_MIN_QUESTIONS) return capped;
  return capped;
}

/**
 * Build high-impact questions from intent + silent scan.
 * Never asks what the scan already answered (language, package manager, git dirty).
 * Never embeds internal EvolveLoop roadmap jargon in defaults.
 */
export function buildGrillMeQuestions(intent: string, scan: SilentScanResult): GrillMeQuestion[] {
  const objective = intent.trim();
  const assessment = assessIntentDetail(objective);
  const langHint = scan.languages[0] ?? "stack detectada no scan";
  const constraintDefault =
    scan.git.dirty || scan.languages.length > 1
      ? `Não editar fora do repo; sem push; dirty=${scan.git.dirty}; langs=${scan.languages.join(",") || langHint}.`
      : "Não editar fora do repo; sem push; preservar working tree coerente.";

  const oosDefault = scrubInternalJargon(
    "Mudanças fora do pedido; push remoto; refactors amplos não solicitados.",
  );

  // Anti-echo: never default scope to a verbatim copy of the objective.
  const derivedScope = deriveScopeFromIntent(objective);
  const scopeDefault = scrubInternalJargon(
    derivedScope.length > 0
      ? derivedScope.join("; ")
      : "Só o mínimo viável para fechar o objetivo",
  );
  const scopeChoiceEchoSafe = scrubInternalJargon(
    derivedScope[0] ??
      `Alinhado ao objetivo (${objective.slice(0, 48)}${objective.length > 48 ? "…" : ""})`,
  );

  const all: GrillMeQuestion[] = [
    {
      id: "q-scope",
      prompt_pt: `Qual é o escopo IN (o que entra nesta entrega)?`,
      internal_en: `scope.in intent="${objective.slice(0, 80)}"`,
      default_answer: scopeDefault,
      field: "scope",
      choices: [
        scopeChoiceEchoSafe,
        "Só o mínimo viável para fechar o objetivo",
        "Incluir testes + docs curta",
        "Outro...",
      ],
    },
    {
      id: "q-oos",
      prompt_pt: `O que fica FORA de escopo nesta rodada?`,
      internal_en: `scope.out skip_repo_facts lang=${langHint}`,
      default_answer: oosDefault,
      field: "out_of_scope",
      choices: [
        oosDefault,
        "Sem alterações de dependências / lockfiles",
        "Sem mudanças de API pública",
        "Outro...",
      ],
    },
    {
      id: "q-accept",
      prompt_pt: `Qual critério de aceite verificável fecha esta entrega?`,
      internal_en: `acceptance.default build+unit_tests green`,
      default_answer: "Build e testes relevantes verdes.",
      field: "acceptance",
      choices: [
        "Build e testes relevantes verdes",
        "Comportamento descrito reproduzível manualmente",
        "Diff revisável + testes pontuais",
        "Outro...",
      ],
    },
    {
      id: "q-constraints",
      prompt_pt: `Quais restrições operacionais valem para esta execução?`,
      internal_en: `constraints.git_dirty=${scan.git.dirty} langs=${scan.languages.join(",")}`,
      default_answer: constraintDefault,
      field: "constraints",
      choices: [
        constraintDefault,
        "Permitir editar só ficheiros já tocados pelo pedido",
        "Sem instalar pacotes novos",
        "Outro...",
      ],
    },
  ];

  // Optional 5th when ambiguous — still ≤ max
  if (objective.length > 90 || /\b(talvez|maybe|ou|or)\b/i.test(objective)) {
    all.push({
      id: "q-confirm",
      prompt_pt: `Confirma entendimento partilhado do objetivo "${objective.slice(0, 60)}${objective.length > 60 ? "…" : ""}"?`,
      internal_en: `confirm.shared_understanding=true`,
      default_answer: "ok",
      field: "confirm",
      choices: ["ok", "Preciso ajustar o objetivo", "Outro..."],
    });
  }

  const max =
    assessment.mode === "detailed_review"
      ? Math.min(4, all.length) // still materialize defaults for the review card
      : Math.max(GRILL_ME_MIN_QUESTIONS, Math.min(assessment.max_questions, 3));

  return clampQuestions(all, max);
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
      return {
        id: q.id,
        value: scrubInternalJargon(q.default_answer),
        used_default: !trimmed || trimmed.toLowerCase() === "ok",
      };
    }
    return { id: q.id, value: scrubInternalJargon(trimmed), used_default: false };
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

/** User-facing interview label — never the internal skill name. */
export function formatInterviewLabel(index: number, total: number): string {
  return `Pergunta ${index}/${total}`;
}

export function formatQuestionForUser(q: GrillMeQuestion, index: number, total: number): string {
  // User UX: numbered clarification prompts + recommended default (Enter to accept).
  return [
    `[${formatInterviewLabel(index, total)}] ${q.prompt_pt}`,
    `  Padrão recomendado: ${q.default_answer} (pressione Enter para aceitar)`,
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
  // Defer Objetivo/Escopo formatting to goal-display (no echo).
  // Lazy import avoided: keep summarize thin; callers that need anti-echo
  // should prefer buildGoalDisplay. Here we still strip exact scope==objective.
  const obj = input.objective.trim();
  const title = obj.split(/(?<=[.!?])\s+/)[0]?.split("\n")[0]?.trim() ?? obj;
  const shortTitle = title.length <= 72 ? title : `${title.slice(0, 71)}…`;
  const scopeItems = input.scope
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const n = s.toLowerCase();
      const objN = obj.toLowerCase();
      const titleN = shortTitle.toLowerCase();
      if (n === objN || n === titleN) return false;
      const stripped = n.replace(/^entregar:\s*/i, "").trim();
      return stripped !== objN && stripped !== titleN;
    });
  return [
    `Contrato: ${input.goal_contract_id}`,
    `Objetivo: ${shortTitle}`,
    `Escopo: ${scopeItems.length ? scopeItems.join("; ") : "—"}`,
    `Fora: ${input.out_of_scope.join("; ") || "—"}`,
    `Aceite: ${input.acceptance}`,
    `Estado: ${input.db_path}`,
  ].slice(0, 6);
}
