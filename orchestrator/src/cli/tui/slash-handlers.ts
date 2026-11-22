/**
 * Pure / side-effect-bounded handlers for session slash commands.
 * App.tsx applies UI effects; this module stays unit-testable.
 */

import { spawnSync } from "node:child_process";
import type { SlashCommandId } from "./slash-commands.js";

export type SlashHandlerResult =
  | { command: "clear"; message: string }
  | { command: "config"; message: string }
  | { command: "diff"; message: string; body: string }
  | { command: "status"; message: string; body: string };

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
}): string {
  const mso = opts.mso_state ?? "—";
  const sid = opts.session_id ?? "sem sessão";
  const contract =
    opts.contract_version !== undefined && opts.contract_version !== ""
      ? `v${opts.contract_version}`
      : "—";
  const provider = opts.provider || "—";
  const tokMso = opts.tokens_mso ?? "—";
  const tokW = opts.tokens_workers ?? "—";
  return [
    "Status",
    `MSO: ${mso} (${sid})`,
    `Contrato: ${contract}`,
    `Provider: ${provider}`,
    `Tokens: MSO ${tokMso} · Workers ${tokW}`,
  ].join("\n");
}

export function runSlashHandler(
  command: SlashCommandId,
  opts?: {
    workspace?: string;
    status?: Parameters<typeof formatSlashStatus>[0];
  },
): SlashHandlerResult {
  if (command === "clear") {
    return { command: "clear", message: "Histórico visual limpo." };
  }
  if (command === "config") {
    return {
      command: "config",
      message: "Abrir /config (Provider / API key · gravação 0600).",
    };
  }
  if (command === "diff") {
    const body = gitDiffStatForSlash(opts?.workspace ?? process.cwd());
    return { command: "diff", message: `Diff\n${body}`, body };
  }
  const body = formatSlashStatus(opts?.status ?? {});
  return { command: "status", message: body, body };
}
