/**
 * Pure / side-effect-bounded handlers for session slash commands.
 * App.tsx applies UI effects; this module stays unit-testable.
 * P2-3: journey slash (/plan /approvals /agents /pause /cancel /delivery).
 * V4.2: /config prefs|handles · /history
 */

import { spawnSync } from "node:child_process";
import type { SlashCommandId } from "./slash-commands.js";
import { buildPlanCardView, type PlanDisplayFields } from "./plan-display.js";
import { deliveryStatusTitle, type DeliveryStatus } from "./delivery-status.js";
import { approvalSmokeLines } from "./approval-display.js";
import type { ApprovalCardView } from "../../v3/approvals/facade.js";
import { taskControlMessage } from "./task-controls.js";
import {
  buildConfigPrefsView,
  parseHandlesToggle,
  setAgentHandlesPref,
} from "../config-surface.js";
import { buildTaskHistoryView } from "./task-history.js";

export type SlashHandlerResult =
  | { command: "clear"; message: string }
  | {
      command: "config";
      message: string;
      /** When true, App should open ProviderSetup. */
      open_provider?: boolean;
      prefs_only?: boolean;
    }
  | { command: "diff"; message: string; body: string }
  | { command: "status"; message: string; body: string }
  | { command: "plan"; message: string; body: string }
  | { command: "approvals"; message: string; body: string }
  | { command: "agents"; message: string; body: string }
  | { command: "pause"; message: string; action: "pause" }
  | { command: "cancel"; message: string; action: "cancel"; destructive: true }
  | { command: "delivery"; message: string; body: string }
  | { command: "history"; message: string; body: string };

export function gitDiffStatForSlash(workspace: string): string {
  const r = spawnSync("git", ["diff", "--stat"], {
    cwd: workspace,
    encoding: "utf-8",
    timeout: 5000,
  });
  if (r.status !== 0) return "(git diff indisponível)";
  const out = (r.stdout ?? "").trim();
  return out || "(sem alterações)";
}

export function formatSlashStatus(opts: {
  mso_state?: string;
  session_id?: string;
  contract_version?: number | string;
  provider?: string;
  tokens_mso?: string;
  tokens_workers?: string;
  task_label?: string;
}): string {
  const mso = opts.mso_state ?? "—";
  const sid = opts.session_id ?? "sem sessão";
  const contract =
    opts.contract_version !== undefined && opts.contract_version !== ""
      ? `v${opts.contract_version}`
      : "—";
  const provider = opts.provider || "—";
  const tokMso = opts.tokens_mso ?? "—";
  const tokAgents = opts.tokens_workers ?? "—";
  const task = opts.task_label ?? "—";
  return [
    "Status",
    `Task: ${task}`,
    `Session: ${mso} (${sid})`,
    `Plan: ${contract}`,
    `Provider: ${provider}`,
    `Tokens: Orchestrator ${tokMso} · Agents ${tokAgents}`,
  ].join("\n");
}

export function formatSlashPlan(plan?: PlanDisplayFields | null): string {
  if (!plan) {
    return [
      "Plan",
      "(nenhum Plan ativo nesta sessão TUI)",
      "Descreva uma Task ou use a fase de revisão.",
      "CLI: evolve intent --text \"…\"",
    ].join("\n");
  }
  return buildPlanCardView(plan).lines.join("\n");
}

export function formatSlashApprovals(
  pending?: ApprovalCardView[] | null,
): string {
  if (!pending || pending.length === 0) {
    return [
      "Approvals",
      "(fila vazia nesta sessão)",
      "CLI: evolve approvals list",
    ].join("\n");
  }
  const blocks = pending.map((p) => approvalSmokeLines(p).join("\n"));
  return ["Approvals", ...blocks].join("\n\n");
}

export function formatSlashAgents(opts?: {
  lines?: string[] | null;
  handlesEnabled?: boolean;
}): string {
  if (opts?.lines && opts.lines.length > 0) {
    return opts.lines.join("\n");
  }
  return [
    "Agents",
    "(lista vazia / sem work_id ativo na TUI)",
    "CLI: evolve agents",
    "     evolve agents inspect <id>",
    "     evolve agents attach <id>   # Handles ON",
    "     evolve agents logs <id>",
    `Handles: ${opts?.handlesEnabled ? "ON" : "OFF (default)"}`,
  ].join("\n");
}

export function formatSlashDelivery(opts?: {
  status?: DeliveryStatus | null;
  detail?: string;
}): string {
  if (!opts?.status) {
    return [
      "Delivery",
      "(ainda sem cartão de entrega nesta sessão)",
      "Re-deriva: /delivery  ·  validar: /delivery validate --run \"…\"",
      "CLI: evolve delivery show|validate",
      "PASS só com evidência de verificação (não inventar).",
    ].join("\n");
  }
  const title = deliveryStatusTitle(opts.status);
  return [
    "Delivery",
    title,
    opts.detail?.trim() || "(sem detalhe adicional)",
    "Validar: /delivery validate --run \"…\" · evolve delivery validate",
  ].join("\n");
}

export function formatSlashConfig(
  workspace: string,
  args: string,
): SlashHandlerResult {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const head = (parts[0] ?? "").toLowerCase();

  if (
    head === "prefs" ||
    head === "show" ||
    (head === "handles" && !parts[1])
  ) {
    const view = buildConfigPrefsView(workspace);
    return {
      command: "config",
      message: view.lines.join("\n"),
      prefs_only: true,
    };
  }

  if (
    head === "handles" ||
    head === "agent-handles" ||
    (head === "set" &&
      (parts[1]?.toLowerCase() === "handles" ||
        parts[1]?.toLowerCase() === "agent-handles"))
  ) {
    const raw =
      head === "set" ? parts[2] : head === "handles" || head === "agent-handles"
        ? parts[1]
        : parts[1];
    const enabled = parseHandlesToggle(raw);
    if (enabled === null) {
      return {
        command: "config",
        message: [
          "Uso: /config handles on|off",
          "     /config prefs",
          "     /config          # prefs + abrir Provider",
        ].join("\n"),
        prefs_only: true,
      };
    }
    const result = setAgentHandlesPref(workspace, enabled);
    return {
      command: "config",
      message: result.lines.join("\n"),
      prefs_only: true,
    };
  }

  if (head === "provider" || head === "key") {
    return {
      command: "config",
      message: "Abrir /config Provider / API key · gravação 0600.",
      open_provider: true,
    };
  }

  // Default: show prefs + offer provider (0600 = ProviderSetup)
  const view = buildConfigPrefsView(workspace);
  return {
    command: "config",
    message: [
      ...view.lines,
      "",
      "Provider / API key: /config provider · gravação 0600",
      "(abrir setup de provider neste fluxo)",
    ].join("\n"),
    open_provider: true,
  };
}

export function formatSlashHistory(workspace: string): string {
  return buildTaskHistoryView(workspace).lines.join("\n");
}

export function runSlashHandler(
  command: SlashCommandId,
  opts?: {
    workspace?: string;
    args?: string;
    status?: Parameters<typeof formatSlashStatus>[0];
    plan?: PlanDisplayFields | null;
    approvals?: ApprovalCardView[] | null;
    agentsLines?: string[] | null;
    handlesEnabled?: boolean;
    delivery?: { status?: DeliveryStatus | null; detail?: string };
  },
): SlashHandlerResult {
  const workspace = opts?.workspace ?? process.cwd();
  if (command === "clear") {
    return { command: "clear", message: "Histórico visual limpo." };
  }
  if (command === "config") {
    return formatSlashConfig(workspace, opts?.args ?? "");
  }
  if (command === "history") {
    const body = formatSlashHistory(workspace);
    return { command: "history", message: body, body };
  }
  if (command === "diff") {
    const body = gitDiffStatForSlash(workspace);
    return { command: "diff", message: `Diff\n${body}`, body };
  }
  if (command === "plan") {
    const body = formatSlashPlan(opts?.plan);
    return { command: "plan", message: body, body };
  }
  if (command === "approvals") {
    const body = formatSlashApprovals(opts?.approvals);
    return { command: "approvals", message: body, body };
  }
  if (command === "agents") {
    const body = formatSlashAgents({
      lines: opts?.agentsLines,
      handlesEnabled: opts?.handlesEnabled,
    });
    return { command: "agents", message: body, body };
  }
  if (command === "pause") {
    const msg = taskControlMessage("pause");
    return { command: "pause", message: msg.message_pt, action: "pause" };
  }
  if (command === "cancel") {
    const msg = taskControlMessage("cancel");
    return {
      command: "cancel",
      message: msg.message_pt,
      action: "cancel",
      destructive: true,
    };
  }
  if (command === "delivery") {
    const body = formatSlashDelivery(opts?.delivery);
    return { command: "delivery", message: body, body };
  }
  const body = formatSlashStatus(opts?.status ?? {});
  return { command: "status", message: body, body };
}
