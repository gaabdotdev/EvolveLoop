/**
 * Compact TUI footer — 1 line idle · 2 lines executing.
 * Never prints UNAVAILABLE in idle; only real metrics while executing.
 */

import type { FooterTelemetry } from "../../v3/evolve-shell/footer.js";
import { formatTokDisplay, isFooterIdle } from "../../v3/evolve-shell/footer.js";

export interface CompactFooterLines {
  lines: string[];
  mode: "idle" | "executing";
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

function metricTok(metric: FooterTelemetry["tok_mso"]): string | undefined {
  if (
    metric.provenance === "UNAVAILABLE" ||
    metric.value === undefined ||
    metric.value === null ||
    metric.value === ""
  ) {
    return undefined;
  }
  if (typeof metric.value === "number") {
    if (metric.value <= 0) return undefined;
    return formatTokDisplay(metric.value);
  }
  return String(metric.value);
}

/**
 * Idle: `~/path · Ollama · bwrap ON`  |  `/config · Ctrl+C Sair`
 * Executing: phase + real tokens; shortcuts on line 2.
 */
export function renderCompactFooter(
  telemetry: FooterTelemetry,
  extras?: {
    providers_ready?: string;
    idle_shortcuts?: string;
  },
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
    const pad = Math.max(2, 72 - left.length - right.length);
    const line = `${left}${" ".repeat(pad)}${right}`;
    return { mode: "idle", lines: [line] };
  }

  const execParts: string[] = [`[${telemetry.mso_state}]`];
  if (telemetry.tasks.length > 0) {
    execParts.push(telemetry.tasks.map((t) => t.name).join(", "));
  }
  const mso = metricTok(telemetry.tok_mso);
  if (mso) execParts.push(`tok MSO ${mso}`);
  const workers = metricTok(telemetry.tok_workers);
  if (workers) execParts.push(`Workers ${workers}`);
  if (sand) execParts.push(sand);

  const line1 = execParts.join(" · ");
  const line2 = telemetry.shortcuts || "Ctrl+P Pause · Ctrl+C Stop · Ctrl+D Detach";
  return { mode: "executing", lines: [line1, line2] };
}
