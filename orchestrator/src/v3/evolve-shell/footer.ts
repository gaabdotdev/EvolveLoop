/**
 * Fixed 3-line telemetry footer (UX spec §4).
 * Missing metrics → UNAVAILABLE (never silent 0 without provenance).
 */

import { colorEnabled, dim, green, red, yellow } from "./colors.js";
import { resolvePanelMsoState } from "./status-panel.js";
import type { WorkspaceSessionSnapshot } from "./workspace-session.js";
import { shortenHomePath } from "./banner.js";

export type MetricProvenance = "reported" | "estimated" | "UNAVAILABLE";

export type SandboxFooterStatus = "ON" | "OFF" | "WARN" | "UNAVAILABLE";

/** Honest numeric-or-absent metric with explicit provenance. */
export interface HonestMetric {
  /** Present only when known; absent/undefined ⇒ treat as UNAVAILABLE. */
  value?: number | string | null;
  provenance: MetricProvenance;
}

export interface FooterTaskRef {
  name: string;
}

export interface FooterTelemetry {
  mso_state: string;
  tasks: FooterTaskRef[];
  sandbox: SandboxFooterStatus;
  /** Served model id, or UNAVAILABLE. */
  mso_model: string;
  /** Context window % for MSO only; UNAVAILABLE when unknown. */
  ctx: HonestMetric;
  /** MSO token spend. */
  tok_mso: HonestMetric;
  /** Aggregate worker token spend. */
  tok_workers: HonestMetric;
  workspace_display: string;
  git_branch: string;
  shortcuts: string;
}

export interface FooterRenderOptions {
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  color?: boolean;
}

export interface BuildFooterExtras {
  mso_state?: string;
  tasks?: FooterTaskRef[];
  sandbox?: SandboxFooterStatus;
  mso_model?: string;
  ctx?: HonestMetric;
  tok_mso?: HonestMetric;
  tok_workers?: HonestMetric;
  git_branch?: string;
  shortcuts?: string;
  home?: string;
}

const UNAVAILABLE = "UNAVAILABLE" as const;

function unavailableMetric(): HonestMetric {
  return { provenance: "UNAVAILABLE" };
}

/** Format token counts for HUD (e.g. 4200 → "4.2k", 18400 → "18.4k"). */
export function formatTokDisplay(value: number): string {
  if (!Number.isFinite(value)) return UNAVAILABLE;
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const k = Math.round((value / 1000) * 10) / 10;
    const body = Number.isInteger(k) ? String(k) : k.toFixed(1);
    return `${body}k`;
  }
  return String(value);
}

export function formatHonestMetric(
  metric: HonestMetric,
  opts?: { percent?: boolean; color?: boolean },
): string {
  const color = opts?.color ?? false;
  if (
    metric.provenance === "UNAVAILABLE" ||
    metric.value === undefined ||
    metric.value === null ||
    metric.value === ""
  ) {
    return red(UNAVAILABLE, color);
  }
  let body: string;
  if (typeof metric.value === "number") {
    body = opts?.percent
      ? `${Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1)}%`
      : formatTokDisplay(metric.value);
  } else {
    body = String(metric.value);
  }
  if (metric.provenance === "estimated") {
    return `${yellow(body, color)} (${yellow("estimated", color)})`;
  }
  if (metric.provenance === "reported") {
    return opts?.percent ? green(body, color) : `${green(body, color)} (${green("reported", color)})`;
  }
  return body;
}

function formatCtx(metric: HonestMetric, color: boolean): string {
  if (
    metric.provenance === "UNAVAILABLE" ||
    metric.value === undefined ||
    metric.value === null ||
    metric.value === ""
  ) {
    return red(UNAVAILABLE, color);
  }
  const num = typeof metric.value === "number" ? metric.value : Number(metric.value);
  const label = Number.isFinite(num)
    ? `${Number.isInteger(num) ? String(num) : num.toFixed(1)}%`
    : String(metric.value);
  if (typeof num === "number" && Number.isFinite(num) && num > 75) {
    return yellow(label, color);
  }
  return label;
}

function formatTokField(metric: HonestMetric, color: boolean): string {
  if (
    metric.provenance === "UNAVAILABLE" ||
    metric.value === undefined ||
    metric.value === null ||
    metric.value === ""
  ) {
    return red(UNAVAILABLE, color);
  }
  const body =
    typeof metric.value === "number" ? formatTokDisplay(metric.value) : String(metric.value);
  if (metric.provenance === "estimated") {
    return `${yellow(body, color)} (${yellow("estimated", color)})`;
  }
  if (metric.provenance === "reported") {
    return `${body} (${green("reported", color)})`;
  }
  return body;
}

function formatSandbox(status: SandboxFooterStatus, color: boolean): string {
  if (status === "UNAVAILABLE") {
    return `Sandbox: ${red("bwrap UNAVAILABLE", color)}`;
  }
  if (status === "OFF") {
    return `Sandbox: ${red("bwrap OFF", color)}`;
  }
  if (status === "WARN") {
    return `Sandbox: ${yellow("bwrap WARN", color)}`;
  }
  return `Sandbox: ${green("bwrap ON", color)}`;
}

function formatWorkers(metric: HonestMetric, color: boolean): string {
  if (
    metric.provenance === "UNAVAILABLE" ||
    metric.value === undefined ||
    metric.value === null ||
    metric.value === ""
  ) {
    return `Workers: ${red(UNAVAILABLE, color)}`;
  }
  const body =
    typeof metric.value === "number" ? formatTokDisplay(metric.value) : String(metric.value);
  if (metric.provenance === "estimated") {
    return `Workers: ${yellow(body, color)} (${yellow("estimated", color)})`;
  }
  if (metric.provenance === "reported") {
    return `Workers: ${body} (${green("reported", color)})`;
  }
  return `Workers: ${body}`;
}

/**
 * Build footer telemetry from workspace session.
 * Fields absent on Session/StateDb snapshot are UNAVAILABLE (never invented as 0).
 */
export function buildFooterTelemetry(
  session: WorkspaceSessionSnapshot,
  extras: BuildFooterExtras = {},
): FooterTelemetry {
  return {
    mso_state: resolvePanelMsoState(session, extras.mso_state),
    tasks: extras.tasks ?? [],
    sandbox: extras.sandbox ?? "UNAVAILABLE",
    mso_model: extras.mso_model ?? UNAVAILABLE,
    ctx: extras.ctx ?? unavailableMetric(),
    tok_mso: extras.tok_mso ?? unavailableMetric(),
    tok_workers: extras.tok_workers ?? unavailableMetric(),
    workspace_display: shortenHomePath(session.workspace, extras.home),
    git_branch: extras.git_branch ?? UNAVAILABLE,
    shortcuts:
      extras.shortcuts ?? "Ctrl+P Pause · Ctrl+C Stop · Ctrl+D Detach",
  };
}

export function renderFooter(
  telemetry: FooterTelemetry,
  opts: FooterRenderOptions = {},
): string {
  const color =
    opts.color ?? colorEnabled({ env: opts.env, isTTY: opts.isTTY });

  const n = telemetry.tasks.length;
  const names =
    n === 0 ? "" : ` (${telemetry.tasks.map((t) => t.name).join(", ")})`;
  const line1 = `[${telemetry.mso_state}] · ${n} tasks${names} · ${formatSandbox(telemetry.sandbox, color)}`;

  const model =
    telemetry.mso_model === UNAVAILABLE
      ? red(UNAVAILABLE, color)
      : telemetry.mso_model;
  const line2 = `MSO: ${model} · ctx ${formatCtx(telemetry.ctx, color)} · tok ${formatTokField(telemetry.tok_mso, color)} │ ${formatWorkers(telemetry.tok_workers, color)}`;

  const line3 = [
    dim(telemetry.workspace_display, color),
    telemetry.git_branch === UNAVAILABLE
      ? red(UNAVAILABLE, color)
      : telemetry.git_branch,
    dim(telemetry.shortcuts, color),
  ].join(" · ");

  return [line1, line2, line3].join("\n");
}

/** Separator + 3-line footer block (below input). */
export function renderFooterBlock(
  telemetry: FooterTelemetry,
  opts: FooterRenderOptions = {},
): string {
  const color =
    opts.color ?? colorEnabled({ env: opts.env, isTTY: opts.isTTY });
  const rule = dim("─".repeat(72), color);
  return `${rule}\n${renderFooter(telemetry, { ...opts, color })}`;
}
