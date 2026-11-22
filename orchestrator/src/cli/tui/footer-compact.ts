/**
 * Compact TUI footer — 1 line idle · 2–3 lines executing.
 * V4.1 P0-4: Task / Agent / Session · Agents (not Workers).
 * Never prints UNAVAILABLE in idle; only real metrics while executing.
 */

import type {
  FooterTelemetry,
  HonestMetric,
} from "../../v3/evolve-shell/footer.js";
import { formatTokDisplay, isFooterIdle } from "../../v3/evolve-shell/footer.js";

export interface CompactFooterLines {
  lines: string[];
  mode: "idle" | "executing";
}

export interface CompactFooterExtras {
  providers_ready?: string;
  idle_shortcuts?: string;
  /** Product Task label (objective / contract) — not work_id alone. */
  task_label?: string;
  /** Session (MSO) phase translated or literal. */
  session_label?: string;
  /** Agent count or short status. */
  agents_label?: string;
  /** Readable block reason when blocked. */
  block_reason?: string;
  /** Stack lines when terminal is narrow. */
  narrow?: boolean;
}

function sandboxShort(status: FooterTelemetry["sandbox"]): string | undefined {
  if (status === "ON") return "bwrap ON";
  if (status === "OFF") return "bwrap OFF";
  if (status === "WARN") return "bwrap WARN";
  return undefined;
}

function providersFromModel(tel: FooterTelemetry): string | undefined {
  if (!tel.mso_model || tel.mso_model === "UNAVAILABLE") return undefined;
  return tel.mso_model;
}

/**
 * Format token metric with provenance (V4.2 P0-5).
 * Idle callers still skip UNAVAILABLE via undefined return.
 */
export function formatCompactHonestTok(
  metric: HonestMetric,
): string | undefined {
  if (
    metric.provenance === "UNAVAILABLE" ||
    metric.value === undefined ||
    metric.value === null ||
    metric.value === ""
  ) {
    return undefined;
  }
  let body: string;
  if (typeof metric.value === "number") {
    if (metric.value <= 0) return undefined;
    body = formatTokDisplay(metric.value);
  } else {
    body = String(metric.value);
  }
  if (metric.provenance === "estimated") return `${body} (estimated)`;
  if (metric.provenance === "reported") return `${body} (reported)`;
  return body;
}

function metricTok(metric: FooterTelemetry["tok_mso"]): string | undefined {
  return formatCompactHonestTok(metric);
}

function translateSessionPhase(raw?: string): string | undefined {
  if (!raw) return undefined;
  const map: Record<string, string> = {
    INIT: "Session: início",
    LOADING_GOALS: "Session: carregando",
    ANALYZING: "Session: analisando",
    DECOMPOSING: "Session: decompondo",
    DELEGATING: "Session: delegando",
    WAITING_AGENTS: "Session: aguardando agents",
    VALIDATING: "Session: validando",
    BLOCKED: "Session: bloqueada",
    RECOVERING: "Session: recuperando",
    "TRUE-FULL-PASS": "Session: concluída (verificada)",
  };
  return map[raw] ?? `Session: ${raw}`;
}

/**
 * Idle: `~/path · Ollama · bwrap ON`  |  `/config · Ctrl+C Sair`
 * Executing: Task · Session · Agents + real tokens; shortcuts on last line.
 */
export function renderCompactFooter(
  telemetry: FooterTelemetry,
  extras?: CompactFooterExtras,
): CompactFooterLines {
  const idle = isFooterIdle(telemetry);
  const leftParts: string[] = [telemetry.workspace_display];

  const providers =
    extras?.providers_ready && extras.providers_ready !== "UNAVAILABLE"
      ? extras.providers_ready
      : providersFromModel(telemetry);
  if (providers) leftParts.push(providers);

  const sand = sandboxShort(telemetry.sandbox);
  if (sand) leftParts.push(sand);

  if (idle) {
    const left = leftParts.join(" · ");
    const right = extras?.idle_shortcuts ?? "/config · Ctrl+C Sair";
    if (extras?.narrow) {
      return { mode: "idle", lines: [left, right] };
    }
    const pad = Math.max(2, 72 - left.length - right.length);
    const line = `${left}${" ".repeat(pad)}${right}`;
    return { mode: "idle", lines: [line] };
  }

  const taskLabel =
    extras?.task_label ??
    (telemetry.tasks.length > 0
      ? `Task: ${telemetry.tasks.map((t) => t.name).join(", ")}`
      : undefined);
  const sessionLabel =
    extras?.session_label ?? translateSessionPhase(telemetry.mso_state);
  const agentsFromTasks =
    telemetry.tasks.length > 0
      ? `Agents: ${telemetry.tasks.length}`
      : undefined;
  const agentsLabel = extras?.agents_label ?? agentsFromTasks;

  const lineParts: string[] = [];
  if (taskLabel) lineParts.push(taskLabel);
  if (sessionLabel) lineParts.push(sessionLabel);
  else if (telemetry.mso_state) lineParts.push(`[${telemetry.mso_state}]`);
  if (agentsLabel) lineParts.push(agentsLabel);

  const orch = metricTok(telemetry.tok_mso);
  if (orch) lineParts.push(`tok Orchestrator ${orch}`);
  const agentsTok = metricTok(telemetry.tok_workers);
  if (agentsTok) lineParts.push(`Agents tok ${agentsTok}`);
  if (sand) lineParts.push(sand);

  const lines: string[] = [];
  if (extras?.narrow) {
    for (const p of lineParts) lines.push(p);
  } else {
    lines.push(lineParts.join(" · ") || `[${telemetry.mso_state ?? "…"}]`);
  }
  if (extras?.block_reason) {
    lines.push(`■ Bloqueio: ${extras.block_reason}`);
  }
  lines.push(
    telemetry.shortcuts || "Ctrl+P Pause · Ctrl+C Stop · Ctrl+D Detach",
  );
  return { mode: "executing", lines };
}
