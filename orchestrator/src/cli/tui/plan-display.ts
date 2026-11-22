/**
 * Plan view-model over Goal Contract fields (V4.1 P0-3 / D2 / Q7).
 * Presentation only — runtime Goal Contract IDs unchanged (ADR Q2).
 */

import {
  buildGoalDisplay,
  type GoalDisplayFields,
} from "./goal-display.js";

export interface PlanDisplayFields extends GoalDisplayFields {
  steps: string[];
  agents: string[];
  autonomy: string;
  approval_needed: boolean;
}

export interface PlanCardView {
  title: string;
  sections: Array<{ label: string; body: string }>;
  lines: string[];
}

export function buildPlanDisplay(input: {
  objective: string;
  scope: string[];
  criteria: string;
  risks?: string;
  version?: string;
  steps?: string[];
  agents?: string[];
  approval_needed?: boolean;
  autonomy?: string;
}): PlanDisplayFields {
  const base = buildGoalDisplay(input);
  const steps =
    input.steps && input.steps.length > 0
      ? input.steps
      : input.scope.length > 0
        ? input.scope.map((s) => s.trim()).filter(Boolean)
        : [];
  const approval_needed = input.approval_needed ?? true;
  const autonomy =
    input.autonomy ??
    (approval_needed
      ? "Após Approval: execução autónomo até bloqueio/Delivery"
      : "Execução autónomo até bloqueio/Delivery");
  return {
    ...base,
    steps,
    agents: input.agents ?? [],
    autonomy,
    approval_needed,
  };
}

export function buildPlanCardView(plan: PlanDisplayFields): PlanCardView {
  const scope =
    plan.scope_items.length > 0
      ? plan.scope_items.map((s) => `· ${s}`).join(" ")
      : "—";
  const steps =
    plan.steps.length > 0
      ? plan.steps.map((s, i) => `${i + 1}. ${s}`).join(" · ")
      : "—";
  const agents =
    plan.agents.length > 0 ? plan.agents.join(", ") : "a definir na delegação";

  const sections: Array<{ label: string; body: string }> = [
    { label: "Objetivo", body: plan.objective_title },
    { label: "Critérios", body: plan.criteria },
    { label: "Etapas", body: steps },
    { label: "Agents", body: agents },
    { label: "Riscos / permissões", body: plan.risks },
    {
      label: "Autónomo vs Approval",
      body: plan.approval_needed
        ? `Approval necessária · ${plan.autonomy}`
        : plan.autonomy,
    },
    { label: "Escopo", body: scope },
    { label: "Versão", body: plan.version },
  ];

  const lines = [
    "Plan",
    "revisão antes da execução",
    ...sections.map((s) => `${s.label}: ${s.body}`),
  ];

  return { title: "Plan", sections, lines };
}
