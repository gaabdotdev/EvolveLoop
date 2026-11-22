/**
 * Handle presentation — active vs replaced (continuity / REPLACED).
 */

import type { AgentRecord, AgentState } from "../agent-registry/types.js";
import type { ProcessSessionRecord } from "../adapters/drivers/process-sessions.js";
import type { HandoffPackage } from "../continuity/types.js";
import {
  formatContinuityLimitation,
  type ContinuityLimitationView,
} from "../continuity/limitation-ui.js";

export type HandleLifecycle = "active" | "replaced" | "historical" | "terminal";

const ACTIVE_STATES: ReadonlySet<AgentState> = new Set([
  "INITIALIZING",
  "ACTIVE",
  "WAITING",
  "YIELDING",
]);

const TERMINAL_STATES: ReadonlySet<AgentState> = new Set([
  "COMPLETED",
  "CANCELLED",
  "FAILED",
  "STALE",
  "ORPHANED",
  "LIMIT_REACHED",
]);

export function classifyHandleLifecycle(agent: AgentRecord): HandleLifecycle {
  if (agent.state === "REPLACED" || Boolean(agent.replaced_by)) return "replaced";
  if (ACTIVE_STATES.has(agent.state)) return "active";
  if (TERMINAL_STATES.has(agent.state)) return "terminal";
  return "historical";
}

export function formatHandleLifecyclePt(life: HandleLifecycle): string {
  switch (life) {
    case "active":
      return "ativo";
    case "replaced":
      return "substituído (histórico)";
    case "terminal":
      return "terminal";
    case "historical":
      return "histórico";
  }
}

export interface AgentVsSessionView {
  agent_id: string;
  agent_state: AgentState;
  handle_lifecycle: HandleLifecycle;
  handle_lifecycle_pt: string;
  replaced_by?: string;
  replace_of?: string;
  /** Process / terminal session — distinct from Agent state. */
  process_session?: {
    session_id: string;
    status: ProcessSessionRecord["status"];
    pid?: number;
    mux_backend?: ProcessSessionRecord["mux_backend"];
    mux_session?: string;
  };
  /** Orchestration session id on the agent record (MSO/harness), if any. */
  agent_session_id?: string;
  note_pt: string;
  /** V4.2 P1-4 — only when REPLACED / handoff context. */
  continuity_limitation?: ContinuityLimitationView;
}

export function buildAgentVsSessionView(
  agent: AgentRecord,
  processSessions: ProcessSessionRecord[] = [],
  opts?: { handoff?: HandoffPackage },
): AgentVsSessionView {
  const life = classifyHandleLifecycle(agent);
  // Exact agent_id only (REMED-M3) — never approximate via session_id alone.
  const proc = processSessions.find((s) => s.agent_id === agent.agent_id);

  const noteParts = [
    `Agent state (${agent.state}) ≠ Session/terminal state`,
    life === "replaced"
      ? `Handle histórico: substituído${agent.replaced_by ? ` por ${agent.replaced_by}` : ""}`
      : life === "active"
        ? "Handle aponta para Agent ativo"
        : undefined,
  ].filter(Boolean);

  const continuity_limitation =
    life === "replaced"
      ? formatContinuityLimitation({
          kind: "replaced",
          agent,
          handoff: opts?.handoff,
        })
      : undefined;

  return {
    agent_id: agent.agent_id,
    agent_state: agent.state,
    handle_lifecycle: life,
    handle_lifecycle_pt: formatHandleLifecyclePt(life),
    replaced_by: agent.replaced_by,
    replace_of: agent.replace_of,
    process_session: proc
      ? {
          session_id: proc.session_id,
          status: proc.status,
          pid: proc.pid,
          mux_backend: proc.mux_backend,
          mux_session: proc.mux_session,
        }
      : undefined,
    agent_session_id: agent.session_id,
    note_pt: noteParts.join(". ") + ".",
    continuity_limitation,
  };
}
