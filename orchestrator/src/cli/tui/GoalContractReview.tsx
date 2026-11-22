/**
 * Single-card Goal Contract review (detailed Grill-Me path).
 * Enter = confirm+execute · E = edit · Esc = cancel.
 * Renders titles with bold/dim — no crude # markdown.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { GoalDisplayFields } from "./goal-display.js";

export type GoalReviewAction = "confirm_execute" | "edit" | "cancel";

export interface GoalContractReviewProps {
  /** Preferred structured fields (no objective/scope echo). */
  display?: GoalDisplayFields;
  /** Legacy plain lines fallback. */
  cardLines?: string[];
  onAction: (action: GoalReviewAction) => void;
  focus?: boolean;
}

const OPTIONS: Array<{ key: GoalReviewAction; label: string }> = [
  { key: "confirm_execute", label: "[Enter] Confirmar e executar agora" },
  { key: "edit", label: "[E] Ajustar escopo / restrições" },
  { key: "cancel", label: "[Esc] Cancelar" },
];

export function GoalContractReview({
  display,
  cardLines,
  onAction,
  focus = true,
}: GoalContractReviewProps): React.ReactElement {
  const [idx, setIdx] = useState(0);

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

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={2}
      paddingY={1}
      marginBottom={1}
    >
      <Text bold>Goal Contract</Text>
      <Text dimColor>revisão antes da execução</Text>
      {display ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text bold>Objetivo: </Text>
            {display.objective_title}
          </Text>
          <Text>
            <Text bold>Escopo: </Text>
            {display.scope_items.length > 0
              ? display.scope_items.map((s) => `· ${s}`).join(" ")
              : "—"}
          </Text>
          <Text>
            <Text dimColor>Critérios: </Text>
            {display.criteria}
          </Text>
          <Text>
            <Text dimColor>Riscos: </Text>
            {display.risks}
          </Text>
          <Text>
            <Text dimColor>Versão: </Text>
            {display.version}
          </Text>
        </Box>
      ) : (
        (cardLines ?? []).map((l, i) => (
          <Text key={`gc-${i}`}>{l}</Text>
        ))
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
