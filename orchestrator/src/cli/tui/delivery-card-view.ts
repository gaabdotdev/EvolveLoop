/**
 * Pure view-model for the final delivery card (testable without Ink).
 */

export type DeliveryStatus = "PASS" | "BLOCKED" | "FAILED";

export interface DeliveryCardViewInput {
  status: DeliveryStatus;
  diff_stat: string;
  verification?: { command: string; exit_code: number };
  tokens_mso?: number;
  tokens_workers?: number;
}

export interface DeliveryCardView {
  title: string;
  status: DeliveryStatus;
  diff_stat: string;
  verification_line: string;
  tokens_line: string;
  shortcuts: string;
  lines: string[];
}

export const DELIVERY_SHORTCUTS =
  "[Enter] Nova tarefa · [D] Ver diff completo · [Q] Sair";

export function formatDeliveryTokens(
  tokens_mso?: number,
  tokens_workers?: number,
): string {
  const mso =
    tokens_mso !== undefined && tokens_mso > 0 ? String(tokens_mso) : "—";
  const workers =
    tokens_workers !== undefined && tokens_workers > 0
      ? String(tokens_workers)
      : "—";
  return `Tokens: MSO ${mso} · Workers ${workers}`;
}

export function formatDeliveryVerification(
  verification?: { command: string; exit_code: number },
): string {
  if (!verification) return "Verificação: —";
  return `Verificação: ${verification.command} (exit ${verification.exit_code})`;
}

export function buildDeliveryCardView(
  input: DeliveryCardViewInput,
): DeliveryCardView {
  const verification_line = formatDeliveryVerification(input.verification);
  const tokens_line = formatDeliveryTokens(
    input.tokens_mso,
    input.tokens_workers,
  );
  const title = `Entrega Final · ${input.status}`;
  const lines = [
    title,
    "Arquivos alterados",
    ...input.diff_stat.split("\n"),
    verification_line,
    tokens_line,
    DELIVERY_SHORTCUTS,
  ];
  return {
    title,
    status: input.status,
    diff_stat: input.diff_stat,
    verification_line,
    tokens_line,
    shortcuts: DELIVERY_SHORTCUTS,
    lines,
  };
}
