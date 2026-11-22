/**
 * Hierarchical budget rollup — child consumption rolls into ancestors;
 * children cannot exceed remaining parent budget when parent has limits.
 */

import { AgentRegistryStore } from "../agent-registry/store.js";
import type { V3DataPaths } from "../paths.js";
import type { BudgetBreach } from "./types.js";

export interface HierarchicalBudgetNode {
  agent_id: string;
  role: string;
  parent_agent_id?: string;
  self_consumed: { tokens?: number; cost_usd?: number; duration_ms?: number };
  subtree_consumed: { tokens: number; cost_usd: number; duration_ms: number };
  limits: { max_tokens?: number; max_cost_usd?: number; max_duration_ms?: number; max_children?: number };
  child_count: number;
}

export interface HierarchicalBudgetReport {
  kind: "HierarchicalBudgetReport";
  work_id: string;
  nodes: HierarchicalBudgetNode[];
  breaches: BudgetBreach[];
  limitations: string[];
}

function num(v: number | undefined): number {
  return v ?? 0;
}

export function evaluateHierarchicalBudgets(
  paths: V3DataPaths,
  workId: string,
): HierarchicalBudgetReport {
  const snap = new AgentRegistryStore(paths.agentsDir).load(workId);
  const byId = new Map(snap.agents.map((a) => [a.agent_id, a]));
  const children = new Map<string, string[]>();
  for (const a of snap.agents) {
    if (!a.parent_agent_id) continue;
    const list = children.get(a.parent_agent_id) ?? [];
    list.push(a.agent_id);
    children.set(a.parent_agent_id, list);
  }

  const memo = new Map<string, { tokens: number; cost_usd: number; duration_ms: number }>();

  function subtree(agentId: string): { tokens: number; cost_usd: number; duration_ms: number } {
    if (memo.has(agentId)) return memo.get(agentId)!;
    const agent = byId.get(agentId);
    if (!agent) return { tokens: 0, cost_usd: 0, duration_ms: 0 };
    let tokens = num(agent.budget_consumed.tokens);
    let cost_usd = num(agent.budget_consumed.cost_usd);
    let duration_ms = num(agent.budget_consumed.duration_ms);
    for (const childId of children.get(agentId) ?? []) {
      const sub = subtree(childId);
      tokens += sub.tokens;
      cost_usd += sub.cost_usd;
      duration_ms += sub.duration_ms;
    }
    const result = { tokens, cost_usd, duration_ms };
    memo.set(agentId, result);
    return result;
  }

  const nodes: HierarchicalBudgetNode[] = [];
  const breaches: BudgetBreach[] = [];

  for (const agent of snap.agents) {
    const dlg = agent.delegation_id
      ? snap.delegations.find((d) => d.delegation_id === agent.delegation_id)
      : undefined;
    const limits = dlg?.budget ?? {};
    const sub = subtree(agent.agent_id);
    nodes.push({
      agent_id: agent.agent_id,
      role: agent.role,
      parent_agent_id: agent.parent_agent_id,
      self_consumed: { ...agent.budget_consumed },
      subtree_consumed: sub,
      limits,
      child_count: agent.child_agent_ids.length,
    });

    const push = (dimension: BudgetBreach["dimension"], limit: number | undefined, consumed: number) => {
      if (limit == null) return;
      if (consumed > limit) {
        breaches.push({
          agent_id: agent.agent_id,
          dimension,
          limit,
          consumed,
          unmeasured: false,
        });
      }
    };
    push("tokens", limits.max_tokens, sub.tokens);
    push("cost_usd", limits.max_cost_usd, sub.cost_usd);
    push("duration_ms", limits.max_duration_ms, sub.duration_ms);
    if (limits.max_children != null && agent.child_agent_ids.length > limits.max_children) {
      breaches.push({
        agent_id: agent.agent_id,
        dimension: "children",
        limit: limits.max_children,
        consumed: agent.child_agent_ids.length,
        unmeasured: false,
      });
    }

    // Child cannot exceed parent remaining when parent has a limit
    if (agent.parent_agent_id) {
      const parent = byId.get(agent.parent_agent_id);
      const parentDlg = parent?.delegation_id
        ? snap.delegations.find((d) => d.delegation_id === parent.delegation_id)
        : undefined;
      const parentLimits = parentDlg?.budget ?? {};
      const parentSub = subtree(agent.parent_agent_id);
      if (parentLimits.max_tokens != null && parentSub.tokens > parentLimits.max_tokens) {
        breaches.push({
          agent_id: agent.agent_id,
          dimension: "tokens",
          limit: parentLimits.max_tokens,
          consumed: parentSub.tokens,
          unmeasured: false,
        });
      }
    }
  }

  return {
    kind: "HierarchicalBudgetReport",
    work_id: workId,
    nodes,
    breaches,
    limitations: [
      "Rollup uses reported budget_consumed only — never invents tokens",
      "Parent remaining enforcement uses subtree totals against parent max_*",
    ],
  };
}
