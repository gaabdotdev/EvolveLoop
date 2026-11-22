/**
 * Product surface for `evolve agents` / alias `evolve agent` (V4.1 P1).
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { resolveV3DataPaths, type V3DataPaths } from "../v3/paths.js";
import { AgentRegistryStore } from "../v3/agent-registry/store.js";
import { ProcessSessionStore } from "../v3/adapters/drivers/process-sessions.js";
import { detectWorkspaceSession } from "../v3/evolve-shell/workspace-session.js";
import {
  attachAgentHandle,
  collectAgents,
  defaultWorkspaceV3DataDir,
  formatAgentInspectHuman,
  formatAgentLogsHuman,
  formatAgentsListHuman,
  isAgentHandlesEnabled,
} from "../v3/agent-handles/index.js";

export function normalizeAgentsGroup(group: string): string {
  return group === "agent" ? "agents" : group;
}

export function resolveAgentsDataPaths(args: Record<string, string>): {
  paths: V3DataPaths;
  workspace: string;
} {
  const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
  if (args["data-dir"]) {
    return { paths: resolveV3DataPaths(args["data-dir"]), workspace };
  }
  const fallback = defaultWorkspaceV3DataDir(workspace);
  return { paths: resolveV3DataPaths(fallback), workspace };
}

export function resolveActiveWorkId(
  args: Record<string, string>,
  paths: V3DataPaths,
  workspace: string,
): string | undefined {
  if (args["work-id"] || args.run) return args["work-id"] ?? args.run;
  const session = detectWorkspaceSession(workspace);
  const fromMso = session.latest_mso_session?.work_id;
  if (fromMso) return fromMso;
  const { work_ids } = collectAgents(paths);
  return work_ids[0];
}

function findAgent(
  paths: V3DataPaths,
  agentId: string,
  workId?: string,
) {
  const { agents } = collectAgents(paths, workId);
  let hit = agents.find((a) => a.agent_id === agentId);
  if (hit) return hit;
  if (workId) {
    try {
      const snap = new AgentRegistryStore(paths.agentsDir).load(workId);
      return snap.agents.find((a) => a.agent_id === agentId);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Exact agent_id ↔ ProcessSession (REMED-M3).
 * No session_id / single-live approximation — wrong agent_id never matches.
 */
function processSessionsFor(
  paths: V3DataPaths,
  workId: string | undefined,
  agentId: string,
  opts?: { reconcile?: boolean },
) {
  if (!workId) return [];
  if (!existsSync(paths.processSessionsDir)) return [];
  try {
    const store = new ProcessSessionStore(paths.processSessionsDir);
    if (opts?.reconcile) store.reconcile(workId);
    return store.load(workId).filter((s) => s.agent_id === agentId);
  } catch {
    return [];
  }
}

function processSessionStoreFor(paths: V3DataPaths): ProcessSessionStore | undefined {
  if (!existsSync(paths.processSessionsDir)) return undefined;
  return new ProcessSessionStore(paths.processSessionsDir);
}

export type AgentsSurfaceResult =
  | { handled: false }
  | { handled: true; exitCode?: number };

/**
 * Handle product-facing agents commands. Returns handled=false for register/heartbeat/…
 * that stay on the legacy evolve.ts paths.
 */
export function handleAgentsSurface(
  args: Record<string, string>,
  opts?: { printJson?: (obj: unknown) => void; printText?: (lines: string[]) => void },
): AgentsSurfaceResult {
  const group = normalizeAgentsGroup(args.group);
  if (group !== "agents") return { handled: false };

  const cmd = args.command;
  // Positional id: evolve agents inspect <id>
  const agentId = args.id ?? args["agent-id"] ?? args._;

  const wantJson = args.format === "json";
  const printJson = opts?.printJson ?? ((o: unknown) => console.log(JSON.stringify(o, null, 2)));
  const printText =
    opts?.printText ?? ((lines: string[]) => console.log(lines.join("\n")));

  // Bare `evolve agents` → parseArgs command=help — product list (not JSON dump).
  if (cmd === "help" || cmd === "list") {
    if (args.usage === "true") {
      printText([
        "evolve agents [list]          — Agents no contexto ativo",
        "evolve agents inspect <id>    — Agent state ≠ Session",
        "evolve agents attach <id>     — Handles ON: tmux/Zellij ou fallback CLI",
        "evolve agents logs <id>       — logs por Agent (≠ service logs)",
        "Alias: evolve agent → agents",
        "Handles default OFF (profile preferences.agent_handles).",
      ]);
      return { handled: true };
    }

    const { paths, workspace } = resolveAgentsDataPaths(args);
    const workId = resolveActiveWorkId(args, paths, workspace);
    const human = formatAgentsListHuman(paths, {
      work_id: workId,
      workspace,
    });
    if (wantJson) {
      printJson({
        kind: human.kind,
        work_ids: human.work_ids,
        agents: human.agents,
        handles_enabled: isAgentHandlesEnabled({ workspace }),
      });
    } else {
      printText(human.lines);
    }
    return { handled: true };
  }

  if (cmd === "inspect") {
    if (!agentId) {
      console.error("Required: evolve agents inspect <id> [--work-id] [--data-dir]");
      return { handled: true, exitCode: 1 };
    }
    const { paths, workspace } = resolveAgentsDataPaths(args);
    const workId = resolveActiveWorkId(args, paths, workspace);
    const agent = findAgent(paths, agentId, workId);
    if (!agent) {
      if (wantJson) printJson({ error: "not_found", agent_id: agentId });
      else printText([`Agent não encontrado: ${agentId}`]);
      return { handled: true, exitCode: 1 };
    }
    const sessions = processSessionsFor(paths, agent.work_id, agent.agent_id);
    const human = formatAgentInspectHuman(agent, {
      processSessions: sessions,
      workspace,
      work_id: agent.work_id,
    });
    if (wantJson) printJson({ agent: human.agent, view: human.view, handles_enabled: human.handles_enabled });
    else printText(human.lines);
    return { handled: true };
  }

  if (cmd === "attach") {
    if (!agentId) {
      console.error("Required: evolve agents attach <id>");
      return { handled: true, exitCode: 1 };
    }
    const { paths, workspace } = resolveAgentsDataPaths(args);
    const workId = resolveActiveWorkId(args, paths, workspace);
    const agent = findAgent(paths, agentId, workId);
    if (!agent) {
      printText([`Agent não encontrado: ${agentId}`]);
      return { handled: true, exitCode: 1 };
    }
    // Reconcile first so dead processes surface as exited before attach.
    const sessions = processSessionsFor(paths, agent.work_id, agent.agent_id, {
      reconcile: true,
    });
    const store = processSessionStoreFor(paths);
    const result = attachAgentHandle(agent, {
      processSessions: sessions,
      work_id: agent.work_id,
      deps: { workspace },
      persistSession: store ? (rec) => store.upsert(rec) : undefined,
    });
    if (wantJson) {
      printJson({
        ok: result.ok,
        backend: result.backend,
        killed_agent: result.killed_agent,
        session_cancelled: result.session_cancelled,
        mux_session: result.mux_session,
        process_session_id: result.process_session_id,
        process_status: result.process_status,
        message_pt: result.message_pt,
      });
    } else {
      printText([result.message_pt, ...result.lines]);
    }
    // Demonstrate close contract without killing (also for tests via return shape).
    void result.closeViewer;
    return { handled: true, exitCode: result.ok || result.backend === "none" ? 0 : 0 };
  }

  if (cmd === "logs") {
    if (!agentId) {
      console.error("Required: evolve agents logs <id>");
      return { handled: true, exitCode: 1 };
    }
    const { paths, workspace } = resolveAgentsDataPaths(args);
    const workId = resolveActiveWorkId(args, paths, workspace);
    const agent = findAgent(paths, agentId, workId);
    if (!agent) {
      printText([`Agent não encontrado: ${agentId}`]);
      return { handled: true, exitCode: 1 };
    }
    if (!isAgentHandlesEnabled({ workspace }) && args["require-handles"] === "true") {
      printText(["Agent Handles OFF — logs de Handle requerem preferência ON."]);
      return { handled: true, exitCode: 0 };
    }
    const sessions = processSessionsFor(paths, agent.work_id, agent.agent_id);
    const human = formatAgentLogsHuman(agent, { processSessions: sessions });
    if (wantJson) printJson(human);
    else printText(human.lines);
    return { handled: true };
  }

  return { handled: false };
}

/** Capture first positional after command into args.id when missing. */
export function enrichArgsWithPositional(
  argv: string[],
  args: Record<string, string>,
): Record<string, string> {
  // argv: [node, script, group, command, positional?, ...]
  const maybe = argv[4];
  if (maybe && !maybe.startsWith("--") && !args.id && !args["agent-id"]) {
    return { ...args, id: maybe, _: maybe };
  }
  return args;
}
