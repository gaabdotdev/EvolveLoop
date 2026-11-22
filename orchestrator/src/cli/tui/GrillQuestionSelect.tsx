/**
 * Select / MultiSelect-style Grill-Me question (arrows + space + Outro...).
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { MultilineInput } from "./MultilineInput.js";
import type { GrillMeQuestion } from "../../v3/grill-me/session.js";

export interface GrillQuestionSelectProps {
  question: GrillMeQuestion;
  index: number;
  total: number;
  onAnswer: (value: string) => void;
}

export function GrillQuestionSelect({
  question,
  index,
  total,
  onAnswer,
}: GrillQuestionSelectProps): React.ReactElement {
  const choices = question.choices?.length
    ? question.choices
    : [question.default_answer, "Outro..."];
  const [idx, setIdx] = useState(0);
  const [custom, setCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");

  useInput(
    (input, key) => {
      if (custom) return;
      if (key.upArrow) {
        setIdx((i) => (i <= 0 ? choices.length - 1 : i - 1));
        return;
      }
      if (key.downArrow) {
        setIdx((i) => (i + 1) % choices.length);
        return;
      }
      if (key.return || input === " ") {
        const picked = choices[idx]!;
        if (/^outro/i.test(picked)) {
          setCustom(true);
          return;
        }
        onAnswer(picked);
      }
    },
    { isActive: !custom },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={2}
      paddingY={1}
      marginBottom={1}
    >
      <Text bold>
        Pergunta {index}/{total}
      </Text>
      <Text>{question.prompt_pt}</Text>
      {custom ? (
        <Box marginTop={1}>
          <MultilineInput
            prompt="→ "
            value={customVal}
            onChange={setCustomVal}
            onSubmit={(v) => onAnswer(v.trim() || question.default_answer)}
            placeholder="escreva a resposta"
          />
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>↑↓ navegar · Enter/Espaço selecionar</Text>
          {choices.map((c, i) => (
            <Text key={`ch-${i}`} color={i === idx ? "cyan" : undefined}>
              {i === idx ? "❯ " : "  "}
              [{i === idx ? "x" : " "}] {c}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
