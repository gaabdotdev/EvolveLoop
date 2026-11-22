/**
 * Human list of agents in active work context.
 */

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AgentRegistryStore } from "../agent-registry/store.js";
import type { AgentRecord } from "../agent-registry/types.js";
import type { V3DataPaths } from "../paths.js";
import {
  classifyHandleLifecycle,
  formatHandleLifecyclePt,
} from "./presentation.js";
import { resolveAgentHandlesPreference } from "./preference.js";

export interface AgentsListHuman {
  kind: "AgentsListHuman";
  work_ids: string[];
  agents: AgentRecord[];
  handles_enabled: boolean;
  lines: string[];
}

export function listWorkIdsFromAgentsDir(agentsDir: string): string[] {
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function collectAgents(
  paths: V3DataPaths,
  workId?: string,
): { work_ids: string[]; agents: AgentRecord[] } {
  const store = new AgentRegistryStore(paths.agentsDir);
  const work_ids = workId ? [workId] : listWorkIdsFromAgentsDir(paths.agentsDir);
  const agents: AgentRecord[] = [];
  for (const wid of work_ids) {
    try {
      const snap = store.load(wid);
      agents.push(...snap.agents);
    } catch {
      /* missing registry */
    }
  }
  return { work_ids, agents };
}

export function formatAgentsListHuman(
  paths: V3DataPaths,
  opts?: { work_id?: string; workspace?: string },
): AgentsListHuman {
  const { work_ids, agents } = collectAgents(paths, opts?.work_id);
  const pref = resolveAgentHandlesPreference({ workspace: opts?.workspace });
  const lines: string[] = [
    "Agents (contexto ativo)",
    `  Handles: ${pref.enabled ? "ON" : "OFF"} (${pref.source})`,
    work_ids.length
      ? `  work_id(s): ${work_ids.join(", ")}`
      : "  work_id(s): (nenhum registo em agents/)",
    "",
  ];

  if (agents.length === 0) {
    lines.push("  (sem Agents — Task/jornada pode continuar sem Handles)");
  } else {
    for (const a of agents) {
      const life = classifyHandleLifecycle(a);
      lines.push(
        `  • ${a.agent_id}  role=${a.role}  AgentState=${a.state}  Handle=${formatHandleLifecyclePt(life)}`,
      );
      if (a.session_id) lines.push(`      session_id=${a.session_id}`);
      if (a.replaced_by) lines.push(`      replaced_by=${a.replaced_by}`);
    }
    lines.push("");
    lines.push("Inspect: evolve agents inspect <id> [--work-id …]");
    if (pref.enabled) {
      lines.push("Attach:  evolve agents attach <id>  |  Logs: evolve agents logs <id>");
    } else {
      lines.push("Attach/logs: disponíveis quando Handles ON (preferência).");
    }
  }

  return {
    kind: "AgentsListHuman",
    work_ids,
    agents,
    handles_enabled: pref.enabled,
    lines,
  };
}

/** Default product data dir under workspace when --data-dir omitted. */
export function defaultWorkspaceV3DataDir(workspace: string): string {
  return join(workspace, ".evolveloop", "v3");
}
