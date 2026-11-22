/**
 * Human-readable Agent inspect — distinguishes Agent vs Session.
 */

import type { AgentRecord } from "../agent-registry/types.js";
import type { ProcessSessionRecord } from "../adapters/drivers/process-sessions.js";
import {
  buildAgentVsSessionView,
  type AgentVsSessionView,
} from "./presentation.js";
import { resolveAgentHandlesPreference } from "./preference.js";

export interface AgentInspectHuman {
  kind: "AgentInspectHuman";
  agent: AgentRecord;
  view: AgentVsSessionView;
  handles_enabled: boolean;
  lines: string[];
}

export function formatAgentInspectHuman(
  agent: AgentRecord,
  opts?: {
    processSessions?: ProcessSessionRecord[];
    workspace?: string;
    work_id?: string;
  },
): AgentInspectHuman {
  const view = buildAgentVsSessionView(agent, opts?.processSessions ?? []);
  const pref = resolveAgentHandlesPreference({ workspace: opts?.workspace });
  const lines: string[] = [
    `Agent: ${agent.agent_id}`,
    `  role: ${agent.role}`,
    `  work_id: ${agent.work_id}`,
    `  Agent state: ${agent.state}`,
    `  Handle: ${view.handle_lifecycle_pt}`,
  ];
  if (agent.task_id) lines.push(`  task_id: ${agent.task_id}`);
  if (view.replaced_by) lines.push(`  replaced_by: ${view.replaced_by}`);
  if (view.replace_of) lines.push(`  replace_of: ${view.replace_of}`);
  lines.push("");
  lines.push("Session (distinto do Agent state):");
  if (view.agent_session_id) {
    lines.push(`  agent.session_id: ${view.agent_session_id}`);
  }
  if (view.process_session) {
    lines.push(
      `  ProcessSession: ${view.process_session.session_id} (${view.process_session.status}` +
        (view.process_session.pid != null ? `, pid=${view.process_session.pid}` : "") +
        ")",
    );
    if (view.process_session.mux_backend || view.process_session.mux_session) {
      lines.push(
        `  mux: ${view.process_session.mux_backend ?? "?"} / ${view.process_session.mux_session ?? "(none)"}`,
      );
    }
  } else {
    lines.push("  ProcessSession: (nenhuma associada por agent_id exacto)");
  }
  lines.push("");
  lines.push(view.note_pt);
  if (view.continuity_limitation) {
    lines.push("");
    lines.push("Continuidade (REPLACED):");
    for (const l of view.continuity_limitation.lines) {
      lines.push(`  ${l}`);
    }
  }
  lines.push(
    `Agent Handles: ${pref.enabled ? "ON" : "OFF"} (source=${pref.source})`,
  );
  if (!pref.enabled) {
    lines.push(
      "Handles off — attach/logs sob demanda indisponíveis; jornada continua sem sessão extra.",
    );
  } else {
    lines.push(
      `Attach: evolve agents attach ${agent.agent_id}` +
        (opts?.work_id ? ` --work-id ${opts.work_id}` : ""),
    );
  }

  return {
    kind: "AgentInspectHuman",
    agent,
    view,
    handles_enabled: pref.enabled,
    lines,
  };
}
