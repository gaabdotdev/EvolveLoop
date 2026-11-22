/**
 * Pure view-model for the final delivery card (testable without Ink).
 * V4.1: honest PASS, Agents (not Workers), process≠validated copy.
 * V4.2 P0-5: token provenance medido/estimado/indisponível (HonestMetric).
 */

import {
  deliveryStatusTitle,
  type DeliveryStatus,
} from "./delivery-status.js";
import type {
  HonestMetric,
  MetricProvenance,
} from "../../v3/evolve-shell/footer.js";

export type { DeliveryStatus };

export interface DeliveryCardViewInput {
  status: DeliveryStatus;
  diff_stat: string;
  verification?: { command: string; exit_code: number };
  tokens_mso?: number;
  tokens_workers?: number;
  /** Prefer when provenance is known (overrides bare numbers). */
  tok_mso?: HonestMetric;
  tok_workers?: HonestMetric;
  /** Optional process-vs-validated note (defaults from status). */
  process_note?: string;
}

export interface DeliveryCardView {
  title: string;
  status: DeliveryStatus;
  status_label: string;
  process_outcome_line: string;
  objective_validated_line: string;
  diff_stat: string;
  verification_line: string;
  tokens_line: string;
  shortcuts: string;
  lines: string[];
}

export const DELIVERY_SHORTCUTS =
  "[Enter] Nova Task · [D] Ver diff completo · [Q] Sair";

function provenanceLabel(p: MetricProvenance): string {
  if (p === "estimated") return "estimated";
  if (p === "reported") return "reported";
  return "indisponível";
}

function coerceHonest(
  metric: HonestMetric | undefined,
  bare: number | undefined,
): HonestMetric {
  if (metric) return metric;
  if (bare !== undefined && bare > 0) {
    return { value: bare, provenance: "reported" };
  }
  return { provenance: "UNAVAILABLE" };
}

function formatOneTok(metric: HonestMetric): string {
  if (
    metric.provenance === "UNAVAILABLE" ||
    metric.value === undefined ||
    metric.value === null ||
    metric.value === "" ||
    (typeof metric.value === "number" && metric.value <= 0)
  ) {
    return `— (${provenanceLabel("UNAVAILABLE")})`;
  }
  const body =
    typeof metric.value === "number"
      ? String(metric.value)
      : String(metric.value);
  return `${body} (${provenanceLabel(metric.provenance)})`;
}

export function formatDeliveryTokens(
  tokens_mso?: number | HonestMetric,
  tokens_workers?: number | HonestMetric,
): string {
  const mso =
    typeof tokens_mso === "object" && tokens_mso !== null
      ? tokens_mso
      : coerceHonest(undefined, tokens_mso as number | undefined);
  const agents =
    typeof tokens_workers === "object" && tokens_workers !== null
      ? tokens_workers
      : coerceHonest(undefined, tokens_workers as number | undefined);
  return `Tokens: Orchestrator ${formatOneTok(mso)} · Agents ${formatOneTok(agents)}`;
}

export function formatDeliveryVerification(
  verification?: { command: string; exit_code: number },
): string {
  if (!verification) return "Verificação: — (objetivo não validado)";
  return `Verificação: ${verification.command} (exit ${verification.exit_code})`;
}

function processOutcomeLine(status: DeliveryStatus): string {
  if (status === "BLOCKED") return "Processo: bloqueado";
  if (status === "FAILED") return "Processo: falhou";
  return "Processo: terminou";
}

function objectiveValidatedLine(status: DeliveryStatus): string {
  if (status === "PASS") return "Objetivo: validado";
  if (status === "ATTESTED") return "Objetivo: atestado externo (não verificado localmente)";
  return "Objetivo: não validado";
}

export function buildDeliveryCardView(
  input: DeliveryCardViewInput,
): DeliveryCardView {
  const verification_line = formatDeliveryVerification(input.verification);
  const tokens_line = formatDeliveryTokens(
    input.tok_mso ?? input.tokens_mso,
    input.tok_workers ?? input.tokens_workers,
  );
  const status_label = deliveryStatusTitle(input.status);
  const title = `Delivery · ${status_label}`;
  const process_outcome_line =
    input.process_note ?? processOutcomeLine(input.status);
  const objective_validated_line = objectiveValidatedLine(input.status);
  const lines = [
    title,
    process_outcome_line,
    objective_validated_line,
    "Arquivos alterados",
    ...input.diff_stat.split("\n"),
    verification_line,
    tokens_line,
    DELIVERY_SHORTCUTS,
  ];
  return {
    title,
    status: input.status,
    status_label,
    process_outcome_line,
    objective_validated_line,
    diff_stat: input.diff_stat,
    verification_line,
    tokens_line,
    shortcuts: DELIVERY_SHORTCUTS,
    lines,
  };
}
