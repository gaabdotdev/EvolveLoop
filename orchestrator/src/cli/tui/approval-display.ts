/**
 * View-model helpers for Approval TUI panel (P1-1).
 */

import type { ApprovalCardView } from "../../v3/approvals/facade.js";

export function approvalPanelTitle(card: ApprovalCardView): string {
  return `Approval · ${card.risk.toUpperCase()} · ${card.state}`;
}

export function approvalSmokeLines(card: ApprovalCardView): string[] {
  return [
    approvalPanelTitle(card),
    `O quê: ${card.what}`,
    `Porquê: ${card.why}`,
    `Impacto: ${card.impact}`,
    "[a] approve  [r] reject  (Ctrl+D detach ≠ kill)",
  ];
}
