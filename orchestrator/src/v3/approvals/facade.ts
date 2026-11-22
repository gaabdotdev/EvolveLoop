/**
 * Approval UX facade over ApprovalStore (ADR Q4) — does not migrate consent/Goal gates.
 */

import { ApprovalStore } from "./store.js";
import type { ApprovalRequest } from "./types.js";

export interface ApprovalCardView {
  approval_id: string;
  /** O quê */
  what: string;
  /** Porquê */
  why: string;
  /** Impacto */
  impact: string;
  risk: ApprovalRequest["risk"];
  state: ApprovalRequest["state"];
  work_id: string;
  resource: string;
  operation: string;
  expires_at: string;
}

export function toApprovalCardView(req: ApprovalRequest): ApprovalCardView {
  return {
    approval_id: req.approval_id,
    what: `${req.operation} → ${req.resource}`,
    why: req.justification || "(sem justificação)",
    impact: req.impact?.trim()
      ? req.impact
      : riskImpactFallback(req.risk, req.permissions_requested),
    risk: req.risk,
    state: req.state,
    work_id: req.work_id,
    resource: req.resource,
    operation: String(req.operation),
    expires_at: req.expires_at,
  };
}

function riskImpactFallback(
  risk: ApprovalRequest["risk"],
  perms: string[],
): string {
  const p = perms?.length ? perms.join(", ") : "permissões pedidas";
  switch (risk) {
    case "critical":
      return `Impacto crítico — ${p}. Rejeitar bloqueia a operação.`;
    case "high":
      return `Impacto alto — ${p}. Aprovar autoriza só este recurso/janela.`;
    case "low":
      return `Impacto baixo — ${p}.`;
    default:
      return `Impacto médio — ${p}.`;
  }
}

export function formatApprovalCardLines(card: ApprovalCardView): string[] {
  return [
    `Approval ${card.approval_id} [${card.state}]`,
    `  O quê:    ${card.what}`,
    `  Porquê:   ${card.why}`,
    `  Impacto:  ${card.impact}`,
    `  Risco:    ${card.risk}`,
    `  work_id:  ${card.work_id}`,
    `  Expira:   ${card.expires_at}`,
    "  Ações: approve | reject  (Ctrl+D = detach ≠ kill Agent)",
  ];
}

export class ApprovalFacade {
  constructor(private readonly store: ApprovalStore) {}

  listPending(workId?: string): ApprovalCardView[] {
    return this.store
      .list({ work_id: workId, state: "PENDING" })
      .map(toApprovalCardView);
  }

  inspect(approvalId: string): ApprovalCardView | undefined {
    const req = this.store.get(approvalId);
    return req ? toApprovalCardView(req) : undefined;
  }

  approve(approvalId: string, actor = "tui", note?: string): ApprovalCardView {
    return toApprovalCardView(this.store.approve(approvalId, actor, note));
  }

  reject(approvalId: string, actor = "tui", note?: string): ApprovalCardView {
    return toApprovalCardView(this.store.reject(approvalId, actor, note));
  }
}
