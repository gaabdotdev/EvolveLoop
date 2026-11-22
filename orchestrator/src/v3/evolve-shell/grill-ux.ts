/**
 * Grill-Me micro-interactions (UX spec §5.1).
 * Pure render helpers — scan line, question labels, Goal Contract card.
 */

import { colorEnabled } from "./colors.js";
import {
  buildGoalDisplay,
  formatGoalDisplayLines,
} from "../../cli/tui/goal-display.js";

/** Exact local zero-token tag (UX spec §5.2). */
export const LOCAL_ZERO_TOK_TAG = "[local · 0 tok]";

export interface ScanLineOptions {
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  /** Force spinner on/off; default = colorEnabled (NO_COLOR / !TTY → no spinner). */
  animated?: boolean;
}

/** One-line workspace scan indicator (§5.1). No spinner when NO_COLOR / non-TTY. */
export function renderWorkspaceScanLine(opts: ScanLineOptions = {}): string {
  const animated =
    opts.animated ?? colorEnabled({ env: opts.env, isTTY: opts.isTTY });
  const prefix = animated ? "⠋ " : "";
  return `${prefix}Lendo workspace (git, stack, símbolos)...`;
}

export interface GrillMeUxQuestion {
  prompt_pt: string;
  default_answer: string;
  /** Optional alternatives line (already formatted). */
  alternatives_pt?: string;
}

/** User-facing label: `[Pergunta N/M]` + recommended default (no skill-name leak). */
export function formatGrillMeQuestionUx(
  q: GrillMeUxQuestion,
  index: number,
  total: number,
): string {
  const lines = [
    `[Pergunta ${index}/${total}] ${q.prompt_pt}`,
    `  Padrão recomendado: ${q.default_answer} (pressione Enter para aceitar)`,
  ];
  if (q.alternatives_pt) {
    lines.push(`  Alternativas: ${q.alternatives_pt}`);
  }
  return lines.join("\n");
}

export interface GoalContractCardInput {
  objective: string;
  /** Pre-joined scope string and/or structured items. */
  scope: string | string[];
  criteria: string;
  risks?: string;
  version?: string;
}

/** Compact ~5-line review card — short Objetivo, Escopo sem eco do prompt. */
export function renderGoalContractCard(input: GoalContractCardInput): string {
  const scopeItems = Array.isArray(input.scope)
    ? input.scope
    : input.scope
        .split(/\s*;\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
  const display = buildGoalDisplay({
    objective: input.objective,
    scope: scopeItems,
    criteria: input.criteria,
    risks: input.risks,
    version: input.version,
  });
  // V4.3 P1-2 — product label Plan (runtime Goal Contract IDs unchanged).
  return ["Plan", ...formatGoalDisplayLines(display)].join("\n");
}

export function isGoalContractConfirmAnswer(raw: string): boolean {
  const t = raw.trim();
  return t === "" || /^(sim|s|ok|yes|y)$/i.test(t);
}

/** Append exact local tag once (operational 0-tok responses). */
export function withLocalZeroTokTag(message: string): string {
  if (message.includes(LOCAL_ZERO_TOK_TAG)) return message;
  return `${message} ${LOCAL_ZERO_TOK_TAG}`;
}
