/**
 * Agent Handle attach — tmux / Zellij / CLI fallback.
 * Closing the viewer MUST NOT kill the Agent or call session-cancel (ADR Q3).
 */

import { spawnSync } from "node:child_process";
import type { AgentRecord } from "../agent-registry/types.js";
import type { ProcessSessionRecord } from "../adapters/drivers/process-sessions.js";
import { isAgentHandlesEnabled } from "./preference.js";
import { formatAgentInspectHuman } from "./inspect-view.js";
import { formatAgentLogsHuman } from "./logs.js";

export type AttachBackend = "tmux" | "zellij" | "cli_fallback" | "none";

export interface AttachResult {
  kind: "AgentAttachResult";
  ok: boolean;
  agent_id: string;
  backend: AttachBackend;
  /** True only if we would have signalled/killed the agent — must stay false on viewer close. */
  killed_agent: boolean;
  /** True only if session-cancel was invoked — must stay false on viewer close. */
  session_cancelled: boolean;
  message_pt: string;
  lines: string[];
  /** Invoking this closes the viewer without affecting Agent lifecycle. */
  closeViewer: () => CloseViewerResult;
}

export interface CloseViewerResult {
  kind: "CloseViewerResult";
  killed_agent: false;
  session_cancelled: false;
  message_pt: string;
}

export interface AttachDeps {
  /** Override binary detection (tests). */
  hasBinary?: (name: "tmux" | "zellij") => boolean;
  /** Override interactive attach spawn (tests — never required). */
  runAttach?: (backend: "tmux" | "zellij", target: string) => { ok: boolean; detail?: string };
  workspace?: string;
  handlesEnabled?: boolean;
}

function detectBinary(name: "tmux" | "zellij"): boolean {
  const r = spawnSync("which", [name], { encoding: "utf-8" });
  return r.status === 0 && Boolean(r.stdout?.trim());
}

/**
 * Close viewer contract — never maps to kill / session-cancel.
 * Exported for unit tests (mock attach path).
 */
export function closeAgentViewer(_agentId: string): CloseViewerResult {
  return {
    kind: "CloseViewerResult",
    killed_agent: false,
    session_cancelled: false,
    message_pt:
      "Viewer fechado — Agent e ProcessSession continuam (fechar ≠ kill / session-cancel).",
  };
}

function sessionTarget(
  agent: AgentRecord,
  sessions: ProcessSessionRecord[],
): { label: string; session?: ProcessSessionRecord } {
  const proc =
    sessions.find((s) => s.agent_id === agent.agent_id) ??
    sessions.find((s) => s.session_id === agent.session_id);
  if (proc) return { label: proc.session_id, session: proc };
  if (agent.session_id) return { label: agent.session_id };
  return { label: `evolve-agent-${agent.agent_id}` };
}

/**
 * Attach to an Agent Handle. If Handles off → soft fail (Task not broken).
 * If backends missing → CLI fallback with inspect + logs text.
 */
export function attachAgentHandle(
  agent: AgentRecord,
  opts?: {
    processSessions?: ProcessSessionRecord[];
    deps?: AttachDeps;
    work_id?: string;
  },
): AttachResult {
  const sessions = opts?.processSessions ?? [];
  const deps = opts?.deps ?? {};
  const workspace = deps.workspace;
  const enabled =
    deps.handlesEnabled ?? isAgentHandlesEnabled({ workspace });

  const closeViewer = () => closeAgentViewer(agent.agent_id);

  if (!enabled) {
    const inspect = formatAgentInspectHuman(agent, {
      processSessions: sessions,
      workspace,
      work_id: opts?.work_id,
    });
    return {
      kind: "AgentAttachResult",
      ok: false,
      agent_id: agent.agent_id,
      backend: "none",
      killed_agent: false,
      session_cancelled: false,
      message_pt:
        "Agent Handles OFF — attach não abre sessão extra; use inspect. Jornada segue.",
      lines: [
        "Agent Handles: OFF",
        ...inspect.lines,
        "",
        "Para ligar: preferences.agent_handles.enabled: true (profile) ou .evolveloop/config.yaml",
      ],
      closeViewer,
    };
  }

  const target = sessionTarget(agent, sessions);
  const has = deps.hasBinary ?? detectBinary;
  const run = deps.runAttach;

  if (has("tmux")) {
    if (run) {
      const r = run("tmux", target.label);
      return {
        kind: "AgentAttachResult",
        ok: r.ok,
        agent_id: agent.agent_id,
        backend: "tmux",
        killed_agent: false,
        session_cancelled: false,
        message_pt: r.ok
          ? `Attach tmux → ${target.label} (fechar viewer ≠ kill Agent).`
          : `tmux attach falhou (${r.detail ?? "unknown"}); Agent intacto.`,
        lines: [
          `backend: tmux`,
          `target: ${target.label}`,
          "Nota: fechar o viewer NÃO cancela a sessão nem mata o Agent.",
        ],
        closeViewer,
      };
    }
    // Non-interactive / no runner: report tmux available but use safe fallback print.
    return fallbackAttach(agent, sessions, workspace, opts?.work_id, "tmux", closeViewer);
  }

  if (has("zellij")) {
    if (run) {
      const r = run("zellij", target.label);
      return {
        kind: "AgentAttachResult",
        ok: r.ok,
        agent_id: agent.agent_id,
        backend: "zellij",
        killed_agent: false,
        session_cancelled: false,
        message_pt: r.ok
          ? `Attach Zellij → ${target.label} (fechar viewer ≠ kill Agent).`
          : `Zellij attach falhou (${r.detail ?? "unknown"}); Agent intacto.`,
        lines: [
          `backend: zellij`,
          `target: ${target.label}`,
          "Nota: fechar o viewer NÃO cancela a sessão nem mata o Agent.",
        ],
        closeViewer,
      };
    }
    return fallbackAttach(agent, sessions, workspace, opts?.work_id, "zellij", closeViewer);
  }

  return fallbackAttach(agent, sessions, workspace, opts?.work_id, "cli_fallback", closeViewer);
}

function fallbackAttach(
  agent: AgentRecord,
  sessions: ProcessSessionRecord[],
  workspace: string | undefined,
  workId: string | undefined,
  detected: AttachBackend,
  closeViewer: () => CloseViewerResult,
): AttachResult {
  const inspect = formatAgentInspectHuman(agent, {
    processSessions: sessions,
    workspace,
    work_id: workId,
  });
  const logs = formatAgentLogsHuman(agent, { processSessions: sessions });
  const why =
    detected === "cli_fallback"
      ? "tmux/Zellij ausentes — fallback CLI (inspect + logs)."
      : `${detected} detetado mas sem sessão interativa aqui — fallback CLI.`;
  return {
    kind: "AgentAttachResult",
    ok: true,
    agent_id: agent.agent_id,
    backend: "cli_fallback",
    killed_agent: false,
    session_cancelled: false,
    message_pt: `${why} Task/Agent não falham.`,
    lines: [
      why,
      "",
      ...inspect.lines,
      "",
      "--- logs ---",
      ...logs.lines,
      "",
      "Fechar este output ≠ kill Agent / session-cancel.",
    ],
    closeViewer,
  };
}
