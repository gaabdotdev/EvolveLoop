/**
 * Agent Handle attach — tmux / Zellij / CLI fallback.
 * Closing the viewer MUST NOT kill the Agent or call session-cancel (ADR Q3).
 *
 * M3: production path provides a real interactive runner when TTY + backend exist.
 * Fallback CLI is honest text (inspect+logs) — never pretends to be an interactive session.
 * agent_id ↔ ProcessSession is exact (agent_id equality) — never by approximation.
 */

import { spawnSync } from "node:child_process";
import type { AgentRecord } from "../agent-registry/types.js";
import type { ProcessSessionRecord } from "../adapters/drivers/process-sessions.js";
import { isAgentHandlesEnabled } from "./preference.js";
import { formatAgentInspectHuman } from "./inspect-view.js";
import { formatAgentLogsHuman } from "./logs.js";
import { classifyHandleLifecycle } from "./presentation.js";

export type AttachBackend = "tmux" | "zellij" | "cli_fallback" | "none";

/** Honest LIMITATION — do not claim Zellij works merely because the binary exists. */
export const ZELLIJ_ATTACH_LIMITATION =
  "LIMITATION: Zellij attach não comprovado neste host — use tmux ou fallback CLI.";

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
  /** Multiplexer session name when bound/attached. */
  mux_session?: string;
  /** Exact ProcessSession id when linked by agent_id. */
  process_session_id?: string;
  process_status?: ProcessSessionRecord["status"];
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
  /** Override interactive attach spawn (tests — prefer real tmux probes, never fake ok). */
  runAttach?: (backend: "tmux" | "zellij", target: string) => { ok: boolean; detail?: string };
  workspace?: string;
  handlesEnabled?: boolean;
  /** Force interactive path even without TTY (tests with real tmux non-attach). */
  forceInteractive?: boolean;
}

export interface AttachOpts {
  processSessions?: ProcessSessionRecord[];
  deps?: AttachDeps;
  work_id?: string;
  /**
   * Persist mux_backend / mux_session back onto ProcessSessionStore (exact record).
   * Required for durable bind; optional in pure unit paths.
   */
  persistSession?: (rec: ProcessSessionRecord) => void;
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

/** Sanitize multiplexer session name (no shell metacharacters). */
export function safeMuxSessionName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  const trimmed = cleaned.replace(/^-|-$/g, "").slice(0, 64);
  return trimmed.length > 0 ? trimmed : "evolve-session";
}

/** Exact agent_id ↔ ProcessSession — no session_id / mux approximation. */
export function resolveExactProcessSessions(
  agent: AgentRecord,
  sessions: ProcessSessionRecord[],
): ProcessSessionRecord[] {
  return sessions.filter((s) => s.agent_id === agent.agent_id);
}

export function tmuxSessionExists(sessionName: string): boolean {
  const name = safeMuxSessionName(sessionName);
  const has = spawnSync("tmux", ["has-session", "-t", name], { encoding: "utf-8" });
  return has.status === 0;
}

/**
 * Ensure a detached tmux session exists for the target name.
 * Does not attach. Safe argv array — no shell interpolation (spaces-safe).
 */
export function ensureTmuxSession(
  sessionName: string,
  opts?: { command?: string[] },
): { ok: boolean; created: boolean; detail?: string; name: string } {
  const name = safeMuxSessionName(sessionName);
  if (tmuxSessionExists(name)) return { ok: true, created: false, name };
  const cmd = opts?.command?.length ? opts.command : ["sleep", "infinity"];
  // tmux new-session -d -s NAME -- cmd args… (argv, no shell)
  const r = spawnSync("tmux", ["new-session", "-d", "-s", name, "--", ...cmd], {
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    return {
      ok: false,
      created: false,
      name,
      detail: (r.stderr || r.stdout || `exit ${r.status}`).trim(),
    };
  }
  return { ok: true, created: true, name };
}

/** Test/cleanup helper — kills mux session only, never the Agent via session-cancel. */
export function killTmuxSession(sessionName: string): { ok: boolean; detail?: string } {
  const name = safeMuxSessionName(sessionName);
  if (!tmuxSessionExists(name)) return { ok: true };
  const r = spawnSync("tmux", ["kill-session", "-t", name], { encoding: "utf-8" });
  if (r.status !== 0) {
    return {
      ok: false,
      detail: (r.stderr || r.stdout || `exit ${r.status}`).trim(),
    };
  }
  return { ok: true };
}

/**
 * Probe that a tmux session is real and reachable without a TTY attach.
 * Used by tests and non-interactive verification — not a fake interactive session.
 */
export function probeTmuxSession(sessionName: string): { ok: boolean; detail?: string } {
  const name = safeMuxSessionName(sessionName);
  if (!tmuxSessionExists(name)) {
    return { ok: false, detail: "tmux_session_missing" };
  }
  const cap = spawnSync("tmux", ["capture-pane", "-t", name, "-p"], {
    encoding: "utf-8",
  });
  if (cap.status !== 0) {
    return {
      ok: false,
      detail: (cap.stderr || cap.stdout || "capture_failed").trim(),
    };
  }
  return { ok: true };
}

/**
 * Default interactive attach — argv only (no shell). Requires TTY for true attach.
 * When not a TTY, returns ok:false with honest detail (caller may fall back).
 */
export function defaultInteractiveAttach(
  backend: "tmux" | "zellij",
  target: string,
): { ok: boolean; detail?: string } {
  const name = safeMuxSessionName(target);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      ok: false,
      detail: "no_tty_for_interactive_attach",
    };
  }
  if (backend === "tmux") {
    if (!tmuxSessionExists(name)) {
      return { ok: false, detail: "tmux_session_missing" };
    }
    const r = spawnSync("tmux", ["attach-session", "-t", name], {
      encoding: "utf-8",
      stdio: "inherit",
    });
    // detach (Ctrl+B D) exits 0; session continues — never kill agent here.
    return {
      ok: r.error == null,
      detail: r.error ? String(r.error.message) : undefined,
    };
  }
  // Zellij: only attach if session already exists — never invent "functional" without proof.
  const list = spawnSync("zellij", ["list-sessions"], { encoding: "utf-8" });
  if (list.status !== 0) {
    return { ok: false, detail: "zellij_list_failed" };
  }
  if (!String(list.stdout ?? "").includes(name)) {
    return { ok: false, detail: "zellij_session_missing" };
  }
  const r = spawnSync("zellij", ["attach", name], {
    encoding: "utf-8",
    stdio: "inherit",
  });
  return {
    ok: r.error == null,
    detail: r.error ? String(r.error.message) : undefined,
  };
}

const TERMINAL_PROCESS: ReadonlySet<ProcessSessionRecord["status"]> = new Set([
  "exited",
  "cancelled",
  "orphaned",
  "dry_run",
]);

function preferredExactSession(
  sessions: ProcessSessionRecord[],
): ProcessSessionRecord | undefined {
  const live = sessions.find(
    (s) => s.status === "running" || s.status === "paused",
  );
  return live ?? sessions[0];
}

function defaultMuxLabel(agent: AgentRecord, session?: ProcessSessionRecord): string {
  if (session?.mux_session) return safeMuxSessionName(session.mux_session);
  if (session) {
    return safeMuxSessionName(`evolve-${agent.agent_id}-${session.session_id}`);
  }
  return safeMuxSessionName(`evolve-agent-${agent.agent_id}`);
}

/**
 * Bind exact ProcessSession → tmux mux_session (create detached if needed).
 * Safe argv; optional command (paths with spaces OK as separate argv entries).
 */
export function bindExactSessionToTmux(
  agent: AgentRecord,
  session: ProcessSessionRecord,
  opts?: {
    command?: string[];
    persistSession?: (rec: ProcessSessionRecord) => void;
  },
): {
  ok: boolean;
  created: boolean;
  record: ProcessSessionRecord;
  detail?: string;
} {
  if (session.agent_id !== agent.agent_id) {
    return {
      ok: false,
      created: false,
      record: session,
      detail: "agent_id_mismatch_refused",
    };
  }
  const name = defaultMuxLabel(agent, session);
  const ensured = ensureTmuxSession(name, { command: opts?.command });
  if (!ensured.ok) {
    return {
      ok: false,
      created: false,
      record: session,
      detail: ensured.detail ?? "tmux_session_unavailable",
    };
  }
  const next: ProcessSessionRecord = {
    ...session,
    mux_backend: "tmux",
    mux_session: ensured.name,
  };
  if (
    session.mux_session !== next.mux_session ||
    session.mux_backend !== next.mux_backend
  ) {
    opts?.persistSession?.(next);
  }
  return { ok: true, created: ensured.created, record: next };
}

/**
 * Attach to an Agent Handle. If Handles off → soft fail (Task not broken).
 * If backends missing → CLI fallback with inspect + logs text.
 */
export function attachAgentHandle(
  agent: AgentRecord,
  opts?: AttachOpts,
): AttachResult {
  const sessionsIn = opts?.processSessions ?? [];
  const deps = opts?.deps ?? {};
  const workspace = deps.workspace;
  const enabled =
    deps.handlesEnabled ?? isAgentHandlesEnabled({ workspace });

  const closeViewer = () => closeAgentViewer(agent.agent_id);

  // Exact binding only.
  const exact = resolveExactProcessSessions(agent, sessionsIn);
  let session = preferredExactSession(exact);

  if (!enabled) {
    const inspect = formatAgentInspectHuman(agent, {
      processSessions: exact,
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
      process_session_id: session?.session_id,
      process_status: session?.status,
      mux_session: session?.mux_session,
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

  const life = classifyHandleLifecycle(agent);
  if (life === "replaced") {
    return fallbackAttach(
      agent,
      exact,
      workspace,
      opts?.work_id,
      "cli_fallback",
      closeViewer,
      "Agent REPLACED — Handle histórico; attach não finge sessão interativa ativa.",
      {
        process_session_id: session?.session_id,
        process_status: session?.status,
        mux_session: session?.mux_session,
      },
    );
  }

  if (session && TERMINAL_PROCESS.has(session.status)) {
    return fallbackAttach(
      agent,
      exact,
      workspace,
      opts?.work_id,
      "cli_fallback",
      closeViewer,
      `ProcessSession ${session.session_id} encerrada (status=${session.status}) — sem attach interativo.`,
      {
        process_session_id: session.session_id,
        process_status: session.status,
        mux_session: session.mux_session,
      },
    );
  }

  const has = deps.hasBinary ?? detectBinary;
  const run =
    deps.runAttach ??
    ((backend: "tmux" | "zellij", label: string) =>
      defaultInteractiveAttach(backend, label));

  const canTryInteractive =
    Boolean(deps.runAttach) ||
    deps.forceInteractive === true ||
    Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (has("tmux")) {
    // Bind / ensure real tmux session when we have an exact live ProcessSession.
    if (session && (session.status === "running" || session.status === "paused")) {
      const bound = bindExactSessionToTmux(agent, session, {
        persistSession: opts?.persistSession,
        command: session.command?.length ? undefined : ["sleep", "infinity"],
      });
      if (!bound.ok) {
        return fallbackAttach(
          agent,
          exact,
          workspace,
          opts?.work_id,
          "tmux",
          closeViewer,
          `tmux bind falhou (${bound.detail ?? "unknown"}) — fallback CLI; Agent intacto.`,
          {
            process_session_id: session.session_id,
            process_status: session.status,
          },
        );
      }
      session = bound.record;
      // Refresh exact list view for inspect/logs in fallback paths.
      const idx = exact.findIndex((s) => s.session_id === session!.session_id);
      if (idx >= 0) exact[idx] = session;
    } else if (!session) {
      // No exact ProcessSession — do not invent a foreign process link.
      // Still allow a named mux for this agent_id only when interactive/forced.
      if (canTryInteractive) {
        const label = defaultMuxLabel(agent, undefined);
        const ensured = ensureTmuxSession(label);
        if (!ensured.ok) {
          return fallbackAttach(
            agent,
            exact,
            workspace,
            opts?.work_id,
            "tmux",
            closeViewer,
            `tmux session create falhou (${ensured.detail ?? "unknown"}) — fallback CLI.`,
          );
        }
            return finishTmuxAttach(agent, exact, run, canTryInteractive, {
          label: ensured.name,
          session: undefined,
          workspace,
          workId: opts?.work_id,
          closeViewer,
        });
      }
      return fallbackAttach(
        agent,
        exact,
        workspace,
        opts?.work_id,
        "tmux",
        closeViewer,
        "tmux disponível mas sem ProcessSession exacta (agent_id) — fallback CLI (não é sessão interativa).",
      );
    }

    return finishTmuxAttach(agent, exact, run, canTryInteractive, {
      label: defaultMuxLabel(agent, session),
      session,
      workspace,
      workId: opts?.work_id,
      closeViewer,
    });
  }

  if (has("zellij")) {
    // Binary present ≠ proven. Without an existing mux session, refuse to claim Zellij works.
    const label = defaultMuxLabel(agent, session);
    if (canTryInteractive && session?.mux_backend === "zellij" && session.mux_session) {
      const r = run("zellij", session.mux_session);
      if (r.ok) {
        return {
          kind: "AgentAttachResult",
          ok: true,
          agent_id: agent.agent_id,
          backend: "zellij",
          killed_agent: false,
          session_cancelled: false,
          mux_session: session.mux_session,
          process_session_id: session.session_id,
          process_status: session.status,
          message_pt: `Attach Zellij → ${session.mux_session} (fechar viewer ≠ kill Agent).`,
          lines: [
            `backend: zellij`,
            `target: ${session.mux_session}`,
            "Nota: fechar o viewer NÃO cancela a sessão nem mata o Agent.",
          ],
          closeViewer,
        };
      }
    }
    return fallbackAttach(
      agent,
      exact,
      workspace,
      opts?.work_id,
      "zellij",
      closeViewer,
      `${ZELLIJ_ATTACH_LIMITATION} (target=${label}).`,
      {
        process_session_id: session?.session_id,
        process_status: session?.status,
        mux_session: session?.mux_session,
      },
    );
  }

  return fallbackAttach(
    agent,
    exact,
    workspace,
    opts?.work_id,
    "cli_fallback",
    closeViewer,
    undefined,
    {
      process_session_id: session?.session_id,
      process_status: session?.status,
      mux_session: session?.mux_session,
    },
  );
}

function finishTmuxAttach(
  agent: AgentRecord,
  exact: ProcessSessionRecord[],
  run: (backend: "tmux" | "zellij", label: string) => { ok: boolean; detail?: string },
  canTryInteractive: boolean,
  ctx: {
    label: string;
    session?: ProcessSessionRecord;
    workspace?: string;
    workId?: string;
    closeViewer: () => CloseViewerResult;
  },
): AttachResult {
  const meta = {
    process_session_id: ctx.session?.session_id,
    process_status: ctx.session?.status,
    mux_session: ctx.label,
  };

  if (!canTryInteractive) {
    // Session may already be bound/created — report honestly, not as interactive.
    const probe = probeTmuxSession(ctx.label);
    const why = probe.ok
      ? `tmux sessão pronta (${ctx.label}) mas sem TTY — fallback CLI (não é sessão interativa).`
      : `tmux detetado mas sem sessão interativa aqui — fallback CLI.`;
    return fallbackAttach(
      agent,
      exact,
      ctx.workspace,
      ctx.workId,
      "tmux",
      ctx.closeViewer,
      why,
      meta,
    );
  }

  const r = run("tmux", ctx.label);
  if (r.ok) {
    return {
      kind: "AgentAttachResult",
      ok: true,
      agent_id: agent.agent_id,
      backend: "tmux",
      killed_agent: false,
      session_cancelled: false,
      mux_session: ctx.label,
      process_session_id: ctx.session?.session_id,
      process_status: ctx.session?.status,
      message_pt: `Attach tmux → ${ctx.label} (fechar viewer ≠ kill Agent).`,
      lines: [
        `backend: tmux`,
        `target: ${ctx.label}`,
        ctx.session
          ? `process_session: ${ctx.session.session_id} (agent_id=${agent.agent_id})`
          : "process_session: (nenhuma exacta — mux só por agent_id)",
        "Nota: fechar o viewer NÃO cancela a sessão nem mata o Agent.",
        "Detach/reconnect: mesma mux_session; viewer close ≠ kill.",
      ],
      closeViewer: ctx.closeViewer,
    };
  }
  if (r.detail === "no_tty_for_interactive_attach") {
    return fallbackAttach(
      agent,
      exact,
      ctx.workspace,
      ctx.workId,
      "tmux",
      ctx.closeViewer,
      "tmux disponível mas sem TTY — fallback CLI (não é sessão interativa).",
      meta,
    );
  }
  return fallbackAttach(
    agent,
    exact,
    ctx.workspace,
    ctx.workId,
    "tmux",
    ctx.closeViewer,
    `tmux attach falhou (${r.detail ?? "unknown"}) — fallback CLI; Agent intacto.`,
    meta,
  );
}

function fallbackAttach(
  agent: AgentRecord,
  sessions: ProcessSessionRecord[],
  workspace: string | undefined,
  workId: string | undefined,
  detected: AttachBackend,
  closeViewer: () => CloseViewerResult,
  customWhy?: string,
  meta?: {
    process_session_id?: string;
    process_status?: ProcessSessionRecord["status"];
    mux_session?: string;
  },
): AttachResult {
  const inspect = formatAgentInspectHuman(agent, {
    processSessions: sessions,
    workspace,
    work_id: workId,
  });
  const logs = formatAgentLogsHuman(agent, { processSessions: sessions });
  const why =
    customWhy ??
    (detected === "cli_fallback"
      ? "tmux/Zellij ausentes — fallback CLI (inspect + logs)."
      : `${detected} detetado mas sem sessão interativa aqui — fallback CLI.`);
  return {
    kind: "AgentAttachResult",
    ok: true,
    agent_id: agent.agent_id,
    backend: "cli_fallback",
    killed_agent: false,
    session_cancelled: false,
    process_session_id: meta?.process_session_id,
    process_status: meta?.process_status,
    mux_session: meta?.mux_session,
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
      "Nota: fallback CLI NÃO é sessão interativa.",
    ],
    closeViewer,
  };
}
