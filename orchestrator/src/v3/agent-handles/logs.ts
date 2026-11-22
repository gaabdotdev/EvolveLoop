/**
 * Agent logs — product surface ≠ `evolve service logs` (daemon).
 */

import type { AgentRecord } from "../agent-registry/types.js";
import type { ProcessSessionRecord } from "../adapters/drivers/process-sessions.js";
import { classifyHandleLifecycle, formatHandleLifecyclePt } from "./presentation.js";

export interface AgentLogsHuman {
  kind: "AgentLogsHuman";
  agent_id: string;
  lines: string[];
}

export function formatAgentLogsHuman(
  agent: AgentRecord,
  opts?: { processSessions?: ProcessSessionRecord[] },
): AgentLogsHuman {
  const life = classifyHandleLifecycle(agent);
  const sessions = (opts?.processSessions ?? []).filter(
    (s) => s.agent_id === agent.agent_id || s.session_id === agent.session_id,
  );

  const lines: string[] = [
    `Agent logs: ${agent.agent_id}`,
    `  (≠ evolve service logs — isso é daemon systemd)`,
    `  Agent state: ${agent.state}`,
    `  Handle: ${formatHandleLifecyclePt(life)}`,
    `  last_heartbeat: ${agent.last_heartbeat_at}`,
    `  last_activity: ${agent.last_activity_at}`,
  ];

  if (sessions.length === 0) {
    lines.push("  ProcessSession: nenhuma — sem stream de processo associado.");
  } else {
    for (const s of sessions) {
      lines.push(
        `  ProcessSession ${s.session_id}: status=${s.status}` +
          (s.pid != null ? ` pid=${s.pid}` : "") +
          (s.ended_at ? ` ended=${s.ended_at}` : "") +
          (s.exit_code != null ? ` exit=${s.exit_code}` : ""),
      );
      if (s.command?.length) {
        lines.push(`    cmd: ${s.command.join(" ")}`);
      }
      if (s.limitations?.length) {
        lines.push(`    limitations: ${s.limitations.slice(-5).join("; ")}`);
      }
    }
  }

  if (life === "replaced") {
    lines.push(
      `  Nota: Agent substituído` +
        (agent.replaced_by ? ` → ${agent.replaced_by}` : "") +
        "; logs são históricos.",
    );
  }

  return { kind: "AgentLogsHuman", agent_id: agent.agent_id, lines };
}
