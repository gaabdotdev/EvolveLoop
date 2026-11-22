/**
 * Home de retomada — workspace + Tasks curtas + CTA (V4.1 P0-1).
 */

import React from "react";
import { Box, Text } from "ink";
import type { HomeResumeView } from "./home-resume.js";

export interface HomeResumeProps {
  view: HomeResumeView;
  narrow?: boolean;
}

export function HomeResume({
  view,
  narrow = false,
}: HomeResumeProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle={narrow ? undefined : "round"}
      paddingX={narrow ? 0 : 1}
      paddingY={0}
    >
      <Text bold>Retomada</Text>
      <Text>
        Workspace: <Text color="cyan">{view.workspace_display}</Text>
      </Text>
      <Text dimColor>
        cwd / .evolveloop/ — ≠ evolve workspace (integration)
      </Text>
      <Text dimColor>
        {view.initialized
          ? "Estado: retomável"
          : "Estado: Aguardando entrada — evolve setup se necessário"}
      </Text>
      {view.tasks.length === 0 ? (
        <Text dimColor>Tasks: nenhuma em andamento</Text>
      ) : (
        <Box flexDirection="column" marginTop={0}>
          <Text bold>Tasks</Text>
          {view.tasks.map((t) => {
            const mark =
              t.kind === "needs_intervention"
                ? "!"
                : t.kind === "in_progress"
                  ? "→"
                  : "·";
            const color =
              t.kind === "needs_intervention"
                ? "yellow"
                : t.kind === "in_progress"
                  ? "cyan"
                  : undefined;
            return (
              <Text key={t.id} color={color}>
                {"  "}
                {mark} {t.title}
                <Text dimColor> — {t.detail}</Text>
              </Text>
            );
          })}
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">{view.cta_primary}</Text>
        {view.tasks.length > 0 ? (
          <Text dimColor>{view.cta_secondary}</Text>
        ) : null}
      </Box>
    </Box>
  );
}
