/**
 * Three-zone HUD layout helpers (UX spec §3).
 * Pure render functions — usable without raw TTY anchoring.
 */

import { formatTokDisplay } from "./footer.js";
import type { MetricProvenance } from "./footer.js";

export type AgentTokenHonesty = MetricProvenance | "local";

export interface ActiveAgentView {
  /** Agent id (e.g. "agy", "sub:test-runner"). */
  id: string;
  /** Served model label, e.g. "auto:smart". */
  model?: string;
  /** Task label, e.g. "T3: Evidence Validator". */
  task: string;
  /** Elapsed seconds (preferred) or preformatted MM:SS. */
  elapsed_sec?: number;
  elapsed?: string;
  /** Token count; omit / null with honesty UNAVAILABLE — never invent 0. */
  tokens?: number | null;
  token_honesty?: AgentTokenHonesty;
}

export interface AgentsTreeOptions {
  /** Max visible agent rows (spec: 4–6). Default 5. */
  maxVisible?: number;
}

function formatElapsed(agent: ActiveAgentView): string {
  if (agent.elapsed) return agent.elapsed;
  const sec = agent.elapsed_sec ?? 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatAgentTokens(agent: ActiveAgentView): string {
  const honesty = agent.token_honesty ?? "UNAVAILABLE";
  if (
    honesty === "UNAVAILABLE" ||
    agent.tokens === undefined ||
    agent.tokens === null
  ) {
    return "tok UNAVAILABLE";
  }
  return `${formatTokDisplay(agent.tokens)} tok (${honesty})`;
}

/**
 * Compact active-agents tree for the middle zone.
 * Returns "" when there are no agents (zone stays collapsed).
 * Excess agents beyond maxVisible are summarized as `+ N queued`.
 */
export function renderActiveAgentsTree(
  agents: readonly ActiveAgentView[],
  opts: AgentsTreeOptions = {},
): string {
  if (!agents.length) return "";
  const maxVisible = Math.min(6, Math.max(4, opts.maxVisible ?? 5));
  const visible = agents.slice(0, maxVisible);
  const queued = Math.max(0, agents.length - visible.length);
  const lines = visible.map((agent, i) => {
    const branch = i === visible.length - 1 && queued === 0 ? "└─" : "├─";
    const model = agent.model ? ` (${agent.model})` : "";
    return `${branch} ${agent.id}${model}  · ${agent.task} · ${formatElapsed(agent)} · ${formatAgentTokens(agent)}`;
  });
  if (queued > 0) {
    lines.push(`+ ${queued} queued`);
  }
  return lines.join("\n");
}

export interface HudZonesInput {
  /** Upper zone: conversational stream lines (already rendered). */
  streamLines?: readonly string[];
  /** Middle zone agents (optional / collapsible). */
  agents?: readonly ActiveAgentView[];
  agentsOptions?: AgentsTreeOptions;
  /** Lower zone: footer 3 lines (already rendered via renderFooter). */
  footer?: string;
}

/**
 * Compose the three logical zones into one printable block.
 * Does not require raw-mode cursor anchoring — safe for pipes/tests.
 */
export function renderHudZones(input: HudZonesInput): string {
  const parts: string[] = [];
  if (input.streamLines?.length) {
    parts.push(input.streamLines.join("\n"));
  }
  const tree = renderActiveAgentsTree(input.agents ?? [], input.agentsOptions);
  if (tree) parts.push(tree);
  if (input.footer) parts.push(input.footer);
  return parts.join("\n");
}
