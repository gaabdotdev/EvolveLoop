/**
 * Build role-scoped Context Views from durable stores (no LLM, no Nomic).
 */

import { GoalContractStore } from "../goal-contract/store.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import { CoordinationEventLog } from "../event-log/store.js";
import type { V3DataPaths } from "../paths.js";
import type { ContextView, ContextViewRole, ContextViewSection } from "./types.js";

export interface BuildContextViewInput {
  work_id: string;
  role: ContextViewRole;
  agent_id?: string;
  /** Max recent events to include (default 20). */
  event_limit?: number;
  /** Max ledger entries (default 15). */
  ledger_limit?: number;
}

const REGEN = [
  "goal-contracts",
  "task-graphs",
  "agents",
  "work-ledger",
  "events",
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function section(
  id: string,
  title: string,
  included: boolean,
  content: Record<string, unknown>,
  reason?: string,
): ContextViewSection {
  return { id, title, included, content, reason };
}

export function buildContextView(paths: V3DataPaths, input: BuildContextViewInput): ContextView {
  const goals = new GoalContractStore(paths.goalContractsDir);
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  const agents = new AgentRegistryStore(paths.agentsDir);
  const ledger = new WorkLedgerStore(paths.workLedgerDir);
  const events = new CoordinationEventLog(paths.eventLogDir);

  const graph = tasks.load(input.work_id);
  const goal = goals.loadLatest(graph.goal_contract_id);
  const registry = agents.load(input.work_id);
  const agent = input.agent_id
    ? registry.agents.find((a) => a.agent_id === input.agent_id)
    : undefined;

  const eventLimit = input.event_limit ?? 20;
  const ledgerLimit = input.ledger_limit ?? 15;
  const allEvents = events.read(input.work_id);
  const recentEvents = allEvents.slice(-eventLimit);
  let ledgerEntries: ReturnType<WorkLedgerStore["read"]> = [];
  let ledgerSnap: ReturnType<WorkLedgerStore["snapshot"]> | undefined;
  try {
    ledgerEntries = ledger.read(input.work_id).slice(-ledgerLimit);
    ledgerSnap = ledger.snapshot(input.work_id);
  } catch {
    /* ledger optional */
  }

  const role = input.role;
  const sections: ContextViewSection[] = [];
  const omitted: ContextView["omitted"] = [];
  const gaps = [
    "Nomic Embed Text hybrid retrieval NOT_IMPLEMENTED — this view is structural only",
    "No conversation transcript inclusion (by design)",
  ];

  const includeGoalFull = role === "master" || role === "coordinator" || role === "operator" || role === "planner" || role === "verifier";
  const includeGoalCompact = !includeGoalFull;

  if (includeGoalFull) {
    sections.push(
      section("goal_contract", "Goal Contract", true, {
        goal_contract_id: goal.goal_contract_id,
        version: goal.version,
        objective: goal.objective,
        criteria: goal.criteria.map((c) => ({
          id: c.id,
          state: c.state,
          mandatory: c.mandatory,
          description: c.description,
          evidence_ids: c.evidence_ids,
        })),
      }),
    );
  } else if (includeGoalCompact) {
    sections.push(
      section("goal_contract_compact", "Goal Contract (compact)", true, {
        goal_contract_id: goal.goal_contract_id,
        version: goal.version,
        objective: goal.objective,
        criteria_summary: goal.criteria.map((c) => ({ id: c.id, state: c.state, mandatory: c.mandatory })),
      }),
    );
    omitted.push({ id: "goal_contract_full", reason: `role=${role} receives compact criteria only` });
  }

  const domain = agent?.domain;
  const taskFilter = (t: (typeof graph.tasks)[number]) => {
    if (role === "master" || role === "coordinator" || role === "operator") return true;
    if (role === "leader" || role === "planner") {
      return !domain || t.domain === domain || t.task_id.startsWith(`plan-${domain}`) || t.owner_agent_id === agent?.agent_id;
    }
    if (role === "worker" || role === "auxiliary") {
      return t.task_id === agent?.task_id || t.owner_agent_id === agent?.agent_id;
    }
    return true;
  };

  const visibleTasks = graph.tasks.filter(taskFilter);
  sections.push(
    section("task_graph", "TaskGraph slice", true, {
      work_id: graph.work_id,
      task_count_total: graph.tasks.length,
      tasks: visibleTasks.map((t) => ({
        task_id: t.task_id,
        title: t.title,
        state: t.state,
        domain: t.domain,
        owner_agent_id: t.owner_agent_id,
        plan_approved: t.plan_approved,
        depends_on: t.depends_on,
      })),
    }),
  );
  if (visibleTasks.length < graph.tasks.length) {
    omitted.push({
      id: "task_graph_other_domains",
      reason: `filtered ${graph.tasks.length - visibleTasks.length} tasks outside role/domain scope`,
    });
  }

  const agentFilter = (a: (typeof registry.agents)[number]) => {
    if (role === "master" || role === "coordinator" || role === "operator") return true;
    if (role === "leader") {
      return a.domain === domain || a.agent_id === agent?.agent_id || a.parent_agent_id === agent?.agent_id;
    }
    if (role === "planner" || role === "worker" || role === "auxiliary") {
      return (
        a.agent_id === agent?.agent_id ||
        a.agent_id === agent?.parent_agent_id ||
        agent?.child_agent_ids.includes(a.agent_id) === true
      );
    }
    return true;
  };
  const visibleAgents = registry.agents.filter(agentFilter);
  sections.push(
    section("agents", "Agent Registry slice", true, {
      agents: visibleAgents.map((a) => ({
        agent_id: a.agent_id,
        role: a.role,
        state: a.state,
        domain: a.domain,
        task_id: a.task_id,
        parent_agent_id: a.parent_agent_id,
        budget_consumed: a.budget_consumed,
        last_heartbeat_at: a.last_heartbeat_at,
      })),
    }),
  );

  if (role === "master" || role === "coordinator" || role === "operator" || role === "leader") {
    sections.push(
      section("ledger_tail", "Work Ledger tail", true, {
        snapshot: ledgerSnap ?? null,
        entries: ledgerEntries.map((e) => ({
          version: e.version,
          type: e.type,
          ts: e.ts,
          task_id: e.task_id,
          agent_id: e.agent_id,
          payload_keys: Object.keys(e.payload),
        })),
      }),
    );
    sections.push(
      section("events_tail", "Coordination events tail", true, {
        count: allEvents.length,
        recent: recentEvents,
      }),
    );
  } else {
    omitted.push({ id: "ledger_tail", reason: `role=${role} omits full ledger by default` });
    omitted.push({ id: "events_tail", reason: `role=${role} omits event log by default` });
    sections.push(
      section(
        "own_task_hint",
        "Own task focus",
        true,
        {
          task_id: agent?.task_id,
          next: "Use TaskGraph slice + Goal compact; request ledger via operator if needed",
        },
        "worker/planner scoped",
      ),
    );
  }

  return {
    kind: "ContextView",
    work_id: input.work_id,
    role,
    agent_id: input.agent_id,
    generated_at: nowIso(),
    disposable: true,
    regenerable_from: [...REGEN],
    sections,
    omitted,
    gaps,
  };
}
