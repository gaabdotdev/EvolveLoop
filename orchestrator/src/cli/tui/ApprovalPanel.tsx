/**
 * P1-1 — Approval panel: o quê / porquê / impacto + approve/reject.
 */

import React from "react";
import { Box, Text, useInput } from "ink";
import type { ApprovalCardView } from "../../v3/approvals/facade.js";
import { approvalPanelTitle } from "./approval-display.js";

export type ApprovalPanelAction = "approve" | "reject" | "defer";

export interface ApprovalPanelProps {
  card: ApprovalCardView;
  onAction: (action: ApprovalPanelAction) => void;
  narrow?: boolean;
}

export function ApprovalPanel({
  card,
  onAction,
  narrow,
}: ApprovalPanelProps): React.ReactElement {
  useInput((input, key) => {
    if (key.return || input === "a" || input === "A" || input === "y" || input === "Y") {
      onAction("approve");
      return;
    }
    if (input === "r" || input === "R" || input === "n" || input === "N") {
      onAction("reject");
      return;
    }
    if (key.escape || input === "d" || input === "D") {
      onAction("defer");
    }
  });

  const pad = narrow ? 0 : 1;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={pad}
      paddingY={0}
      marginY={1}
    >
      <Text bold color="yellow">
        {approvalPanelTitle(card)}
      </Text>
      <Text>
        <Text dimColor>O quê:    </Text>
        {card.what}
      </Text>
      <Text>
        <Text dimColor>Porquê:   </Text>
        {card.why}
      </Text>
      <Text>
        <Text dimColor>Impacto:  </Text>
        {card.impact}
      </Text>
      <Text dimColor>
        id={card.approval_id} · work={card.work_id}
      </Text>
      <Box marginTop={0}>
        <Text>
          <Text color="green">[a]</Text> approve ·{" "}
          <Text color="red">[r]</Text> reject ·{" "}
          <Text dimColor>[d] defer</Text>
        </Text>
      </Box>
      <Text dimColor>Ctrl+D = detach (≠ kill Agent)</Text>
    </Box>
  );
}
