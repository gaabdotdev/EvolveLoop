/**
 * Plan review card (Goal Contract view-model) — V4.1 P0-3.
 * Enter = confirm+execute · E = edit · Esc = cancel.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { GoalDisplayFields } from "./goal-display.js";
import {
  buildPlanCardView,
  buildPlanDisplay,
  type PlanDisplayFields,
} from "./plan-display.js";
import { narrowCardPadding } from "./layout-narrow.js";

export type GoalReviewAction = "confirm_execute" | "edit" | "cancel";

export interface GoalContractReviewProps {
  /** Preferred structured fields (no objective/scope echo). */
  display?: GoalDisplayFields | PlanDisplayFields;
  /** Legacy plain lines fallback. */
  cardLines?: string[];
  onAction: (action: GoalReviewAction) => void;
  focus?: boolean;
  narrow?: boolean;
}

const OPTIONS: Array<{ key: GoalReviewAction; label: string }> = [
  { key: "confirm_execute", label: "[Enter] Confirmar Plan e executar" },
  { key: "edit", label: "[E] Ajustar escopo / restrições" },
  { key: "cancel", label: "[Esc] Cancelar" },
];

function toPlanFields(
  display: GoalDisplayFields | PlanDisplayFields,
): PlanDisplayFields {
  if ("steps" in display && "agents" in display && "autonomy" in display) {
    return display as PlanDisplayFields;
  }
  return buildPlanDisplay({
    objective: display.objective_title,
    scope: display.scope_items,
    criteria: display.criteria,
    risks: display.risks,
    version: display.version,
    approval_needed: true,
  });
}

export function GoalContractReview({
  display,
  cardLines,
  onAction,
  focus = true,
  narrow = false,
}: GoalContractReviewProps): React.ReactElement {
  const [idx, setIdx] = useState(0);
  const pad = narrowCardPadding(narrow);

  useInput(
    (input, key) => {
      if (!focus) return;
      if (key.upArrow) {
        setIdx((i) => (i <= 0 ? OPTIONS.length - 1 : i - 1));
        return;
      }
      if (key.downArrow) {
        setIdx((i) => (i + 1) % OPTIONS.length);
        return;
      }
      if (key.return) {
        onAction(OPTIONS[idx]!.key);
        return;
      }
      if (key.escape) {
        onAction("cancel");
        return;
      }
      if (input.toLowerCase() === "e") {
        onAction("edit");
      }
    },
    { isActive: focus },
  );

  const plan = display ? toPlanFields(display) : null;
  const view = plan ? buildPlanCardView(plan) : null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={pad.paddingX}
      paddingY={pad.paddingY}
      marginBottom={1}
    >
      <Text bold>Plan</Text>
      <Text dimColor>revisão antes da execução</Text>
      {view ? (
        <Box flexDirection="column" marginTop={1}>
          {view.sections.map((sec) => (
            <Text key={sec.label}>
              <Text bold>{sec.label}: </Text>
              {sec.label === "Critérios" ||
              sec.label === "Riscos / permissões" ||
              sec.label === "Versão" ||
              sec.label === "Escopo" ? (
                <Text dimColor>{sec.body}</Text>
              ) : (
                sec.body
              )}
            </Text>
          ))}
        </Box>
      ) : (
        (cardLines ?? []).map((l, i) => <Text key={`gc-${i}`}>{l}</Text>)
      )}
      <Box flexDirection="column" marginTop={1}>
        {OPTIONS.map((opt, i) => (
          <Text key={opt.key} color={i === idx ? "cyan" : undefined}>
            {i === idx ? "❯ " : "  "}
            {opt.label}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
