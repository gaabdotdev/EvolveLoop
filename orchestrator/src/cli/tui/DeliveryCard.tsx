/**
 * Final delivery card after an authorized execution finishes.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { spawnSync } from "node:child_process";

export type DeliveryStatus = "PASS" | "BLOCKED" | "FAILED";

export interface DeliveryCardProps {
  status: DeliveryStatus;
  workspace: string;
  verification?: { command: string; exit_code: number };
  tokens_mso?: number;
  tokens_workers?: number;
  onNewTask: () => void;
  onQuit: () => void;
  focus?: boolean;
}

export function gitDiffStat(workspace: string): string {
  const r = spawnSync("git", ["diff", "--stat"], {
    cwd: workspace,
    encoding: "utf-8",
    timeout: 5000,
  });
  if (r.status !== 0) {
    return "(sem diff ou não é um repositório git)";
  }
  const out = (r.stdout ?? "").trim();
  return out || "(sem alterações)";
}

export function gitDiffFull(workspace: string): string {
  const r = spawnSync("git", ["diff"], {
    cwd: workspace,
    encoding: "utf-8",
    timeout: 8000,
  });
  if (r.status !== 0) return "(diff indisponível)";
  const out = (r.stdout ?? "").trim();
  return out || "(sem alterações)";
}

export function DeliveryCard({
  status,
  workspace,
  verification,
  tokens_mso,
  tokens_workers,
  onNewTask,
  onQuit,
  focus = true,
}: DeliveryCardProps): React.ReactElement {
  const [showDiff, setShowDiff] = useState(false);
  const stat = gitDiffStat(workspace);
  const statusColor =
    status === "PASS" ? "green" : status === "BLOCKED" ? "yellow" : "red";

  useInput(
    (input, key) => {
      if (!focus) return;
      if (key.return) {
        onNewTask();
        return;
      }
      if (input.toLowerCase() === "d") {
        setShowDiff((v) => !v);
        return;
      }
      if (input.toLowerCase() === "q") {
        onQuit();
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
      <Text bold>
        Entrega Final · <Text color={statusColor}>{status}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Arquivos alterados</Text>
        {stat.split("\n").map((l, i) => (
          <Text key={`st-${i}`}>{l}</Text>
        ))}
      </Box>
      {verification ? (
        <Text>
          <Text dimColor>Verificação: </Text>
          {verification.command} (exit {verification.exit_code})
        </Text>
      ) : (
        <Text dimColor>Verificação: —</Text>
      )}
      <Text>
        <Text dimColor>Tokens: </Text>
        MSO {tokens_mso !== undefined && tokens_mso > 0 ? tokens_mso : "—"}
        {" · "}
        Workers{" "}
        {tokens_workers !== undefined && tokens_workers > 0 ? tokens_workers : "—"}
      </Text>
      {showDiff ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>diff completo (trecho)</Text>
          {gitDiffFull(workspace)
            .split("\n")
            .slice(0, 40)
            .map((l, i) => (
              <Text key={`df-${i}`}>{l}</Text>
            ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>
          [Enter] Nova tarefa · [D] Ver diff completo · [Q] Sair
        </Text>
      </Box>
    </Box>
  );
}
