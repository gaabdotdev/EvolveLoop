/**
 * Final delivery card after an authorized execution finishes.
 * V4.1: no false PASS; Agents label; process ≠ validated.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { spawnSync } from "node:child_process";
import {
  buildDeliveryCardView,
  DELIVERY_SHORTCUTS,
  type DeliveryStatus,
} from "./delivery-card-view.js";
import { deliveryStatusColor } from "./delivery-status.js";
import { narrowCardPadding } from "./layout-narrow.js";

export type { DeliveryStatus };

export interface DeliveryCardProps {
  status: DeliveryStatus;
  workspace: string;
  verification?: { command: string; exit_code: number };
  tokens_mso?: number;
  tokens_workers?: number;
  onNewTask: () => void;
  onQuit: () => void;
  focus?: boolean;
  narrow?: boolean;
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
  narrow = false,
}: DeliveryCardProps): React.ReactElement {
  const [showDiff, setShowDiff] = useState(false);
  const stat = gitDiffStat(workspace);
  const view = buildDeliveryCardView({
    status,
    diff_stat: stat,
    verification,
    tokens_mso,
    tokens_workers,
  });
  const statusColor = deliveryStatusColor(status);
  const pad = narrowCardPadding(narrow);

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
      paddingX={pad.paddingX}
      paddingY={pad.paddingY}
      marginBottom={1}
    >
      <Text bold>
        Delivery · <Text color={statusColor}>{view.status_label}</Text>
      </Text>
      <Text dimColor>{view.process_outcome_line}</Text>
      <Text dimColor>{view.objective_validated_line}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Arquivos alterados</Text>
        {view.diff_stat.split("\n").map((l, i) => (
          <Text key={`st-${i}`}>{l}</Text>
        ))}
      </Box>
      <Text>{view.verification_line}</Text>
      <Text>{view.tokens_line}</Text>
      {showDiff ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>diff completo (trecho)</Text>
          {gitDiffFull(workspace)
            .split("\n")
            .slice(0, narrow ? 20 : 40)
            .map((l, i) => (
              <Text key={`df-${i}`}>{l}</Text>
            ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>{DELIVERY_SHORTCUTS}</Text>
      </Box>
    </Box>
  );
}
