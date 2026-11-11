import { AgentRegistryStore } from "../agent-registry/store.js";
import { TaskGraphStore } from "../task-graph/store.js";
import type { V3DataPaths } from "../paths.js";
import type {
  BudgetBreach,
  BudgetReport,
  StuckDetectionReport,
  StuckAgentSignal,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

const LIMITATIONS = [
  "Budget checks use only reported budget_consumed — Core never invents tokens",
  "Unmeasured dimensions with a max_* limit are reported as unmeasured breaches (fail-closed)",
  "Stuck detection is heuristic (lease/orphan/budget/inactive owner); not exactly-once fencing",
];

export function evaluateBudgets(paths: V3DataPaths, workId: string): BudgetReport {
  const agents = new AgentRegistryStore(paths.agentsDir).load(workId);
  const breaches: BudgetBreach[] = [];
  const ok: string[] = [];
  const skipped: string[] = [];

  for (const agent of agents.agents) {
    const dlg = agent.delegation_id
      ? agents.delegations.find((d) => d.delegation_id === agent.delegation_id)
      : undefined;
    const budget = dlg?.budget ?? {};
    const hasAnyLimit =
      budget.max_tokens != null ||
      budget.max_cost_usd != null ||
      budget.max_duration_ms != null ||
      budget.max_children != null;
    if (!hasAnyLimit) {
      skipped.push(agent.agent_id);
      continue;
    }

    let breached = false;
    const consumed = agent.budget_consumed;
    const childCount = agent.child_agent_ids.length;

    const check = (
      dimension: BudgetBreach["dimension"],
      limit: number | undefined,
      value: number | undefined,
    ) => {
      if (limit == null) return;
      if (value == null) {
        breaches.push({
          agent_id: agent.agent_id,
          dimension,
          limit,
          consumed: 0,
          unmeasured: true,
        });
        breached = true;
        return;
      }
      if (value > limit) {
        breaches.push({
          agent_id: agent.agent_id,
          dimension,
          limit,
          consumed: value,
          unmeasured: false,
        });
        breached = true;
      }
    };

    check("tokens", budget.max_tokens, consumed.tokens);
    check("cost_usd", budget.max_cost_usd, consumed.cost_usd);
    check("duration_ms", budget.max_duration_ms, consumed.duration_ms);
    check("children", budget.max_children, childCount);

    if (!breached) ok.push(agent.agent_id);
  }

  return {
    kind: "BudgetReport",
    work_id: workId,
    generated_at: nowIso(),
    breaches,
    ok_agents: ok,
    skipped_no_budget: skipped,
    limitations: [...LIMITATIONS],
  };
}

export function detectStuck(paths: V3DataPaths, workId: string): StuckDetectionReport {
  const agents = new AgentRegistryStore(paths.agentsDir).load(workId);
  const graph = new TaskGraphStore(paths.taskGraphsDir).load(workId);
  const budget = evaluateBudgets(paths, workId);
  const stuck: StuckAgentSignal[] = [];

  for (const agent of agents.agents) {
    if (agent.state === "STALE") {
      stuck.push({
        agent_id: agent.agent_id,
        reason: "STALE_LEASE",
        task_id: agent.task_id,
        detail: `lease_expires_at=${agent.lease_expires_at ?? "n/a"}`,
      });
    }
    if (agent.state === "ORPHANED") {
      stuck.push({
        agent_id: agent.agent_id,
        reason: "ORPHANED",
        task_id: agent.task_id,
        detail: "parent failed/stopped; awaiting adopt or cancel",
      });
    }
  }

  for (const b of budget.breaches) {
    if (stuck.some((s) => s.agent_id === b.agent_id && s.reason === "BUDGET_BREACH")) continue;
    stuck.push({
      agent_id: b.agent_id,
      reason: "BUDGET_BREACH",
      detail: `${b.dimension} limit=${b.limit} consumed=${b.consumed} unmeasured=${b.unmeasured}`,
    });
  }

  for (const task of graph.tasks) {
    if (!["IN_PROGRESS", "PARTIAL_PASS"].includes(task.state)) continue;
    if (!task.owner_agent_id) continue;
    const owner = agents.agents.find((a) => a.agent_id === task.owner_agent_id);
    if (!owner || ["STALE", "ORPHANED", "FAILED", "LIMIT_REACHED", "REPLACED", "CANCELLED"].includes(owner.state)) {
      stuck.push({
        agent_id: task.owner_agent_id,
        reason: "TASK_OWNER_INACTIVE",
        task_id: task.task_id,
        detail: `task_state=${task.state} owner_state=${owner?.state ?? "MISSING"}`,
      });
    }
  }

  return {
    kind: "StuckDetectionReport",
    work_id: workId,
    generated_at: nowIso(),
    stuck,
    limitations: [...LIMITATIONS],
  };
}

/** Record reported consumption only — callers must supply measured values. */
export function recordBudgetConsumption(
  paths: V3DataPaths,
  workId: string,
  agentId: string,
  delta: { tokens?: number; cost_usd?: number; duration_ms?: number },
): void {
  new AgentRegistryStore(paths.agentsDir).recordBudgetConsumption(workId, agentId, delta);
}
