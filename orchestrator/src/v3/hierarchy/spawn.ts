/**
 * Hierarchical spawn: Master → domain Leader → mandatory Planner.
 * Workers are not auto-started; PLAN_APPROVED must precede implementation tasks.
 */

import { AgentRegistryStore } from "../agent-registry/store.js";
import type { AgentRecord } from "../agent-registry/types.js";
import { TaskGraphStore } from "../task-graph/store.js";
import type { OrchestrationTask, TaskGraphSnapshot } from "../task-graph/types.js";
import { GoalContractStore } from "../goal-contract/store.js";
import { CoordinationEventLog } from "../event-log/store.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import type { V3DataPaths } from "../paths.js";

export class HierarchyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HierarchyError";
  }
}

export interface SpawnDomainHierarchyInput {
  work_id: string;
  domains: string[];
  master_agent_id?: string;
}

export interface SpawnDomainHierarchyResult {
  work_id: string;
  goal_contract_id: string;
  domains: Array<{
    domain: string;
    leader_agent_id: string;
    planner_agent_id: string;
    plan_task_id: string;
    implement_task_id: string;
  }>;
  tasks: TaskGraphSnapshot;
  agents: AgentRecord[];
}

function childPerms() {
  return {
    allowWrite: true,
    allowShell: false,
    allowNetwork: false,
    allowHostInspect: true,
    allowSpawn: true,
  };
}

export function spawnDomainHierarchy(
  paths: V3DataPaths,
  input: SpawnDomainHierarchyInput,
): SpawnDomainHierarchyResult {
  const domains = [...new Set(input.domains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
  if (domains.length === 0) {
    throw new HierarchyError("NO_DOMAINS", "at least one domain is required");
  }

  const agents = new AgentRegistryStore(paths.agentsDir);
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  const goals = new GoalContractStore(paths.goalContractsDir);
  const events = new CoordinationEventLog(paths.eventLogDir);

  const graph = tasks.load(input.work_id);
  const goal = goals.loadLatest(graph.goal_contract_id);
  const registry = agents.ensure(input.work_id);

  let masterId = input.master_agent_id;
  if (!masterId) {
    const existing = registry.agents.find((a) => a.role === "master" && a.state !== "CANCELLED");
    if (!existing) {
      throw new HierarchyError("NO_MASTER", "run work init first or pass --master-agent-id");
    }
    masterId = existing.agent_id;
  }

  const master = registry.agents.find((a) => a.agent_id === masterId);
  if (!master) throw new HierarchyError("MASTER_NOT_FOUND", masterId);
  // Ensure master can spawn
  if (master.permissions.allowSpawn !== true) {
    throw new HierarchyError("MASTER_CANNOT_SPAWN", masterId);
  }

  const created: SpawnDomainHierarchyResult["domains"] = [];

  for (const domain of domains) {
    const leaderId = `${input.work_id}-leader-${domain}`;
    const plannerId = `${input.work_id}-planner-${domain}`;
    const planTaskId = `plan-${domain}`;
    const implementTaskId = `implement-${domain}`;

    if (registry.agents.some((a) => a.agent_id === leaderId)) {
      throw new HierarchyError("DOMAIN_EXISTS", domain);
    }

    // Leader under master
    agents.register({
      agent_id: leaderId,
      role: "leader",
      work_id: input.work_id,
      domain,
      parent_agent_id: masterId,
      task_id: planTaskId,
      permissions: childPerms(),
      delegation: {
        delegation_id: `dlg-${leaderId}`,
        role: "leader",
        objective: `Lead domain ${domain} per Goal Contract ${goal.goal_contract_id}`,
        scope: [domain],
        out_of_scope: goal.out_of_scope,
        task_id: planTaskId,
        authorized_inputs: ["goal_contract", "task_graph"],
        deliverables: ["approved_domain_plan"],
        criteria_ids: goal.criteria.filter((c) => c.mandatory).map((c) => c.id),
        permissions: childPerms(),
        budget: {},
        expected_evidence: ["plan-artifact"],
        termination_condition: "domain TRUE_PASS or CANCELLED",
      },
    });
    agents.activate(input.work_id, leaderId);

    // Mandatory planner under leader
    agents.register({
      agent_id: plannerId,
      role: "planner",
      work_id: input.work_id,
      domain,
      parent_agent_id: leaderId,
      task_id: planTaskId,
      permissions: { allowWrite: true, allowHostInspect: true },
      delegation: {
        delegation_id: `dlg-${plannerId}`,
        role: "planner",
        objective: `Produce domain plan for ${domain}`,
        scope: [domain, "planning"],
        out_of_scope: ["implementation"],
        task_id: planTaskId,
        authorized_inputs: ["goal_contract", "codebase_read"],
        deliverables: ["domain_plan"],
        criteria_ids: [],
        permissions: { allowWrite: true, allowHostInspect: true },
        budget: {},
        expected_evidence: ["plan-artifact"],
        termination_condition: "PLAN_APPROVED or CANCELLED",
      },
    });
    agents.activate(input.work_id, plannerId);

    tasks.addTask(input.work_id, {
      task_id: planTaskId,
      goal_contract_id: goal.goal_contract_id,
      goal_contract_version: goal.version,
      title: `Plan ${domain}`,
      domain,
      task_kind: "plan",
      owner_agent_id: plannerId,
      depends_on: [],
    });

    tasks.addTask(input.work_id, {
      task_id: implementTaskId,
      goal_contract_id: goal.goal_contract_id,
      goal_contract_version: goal.version,
      title: `Implement ${domain}`,
      domain,
      task_kind: "implement",
      parent_task_id: planTaskId,
      owner_agent_id: leaderId,
      depends_on: [planTaskId],
    });

    created.push({
      domain,
      leader_agent_id: leaderId,
      planner_agent_id: plannerId,
      plan_task_id: planTaskId,
      implement_task_id: implementTaskId,
    });
  }

  const finalTasks = tasks.load(input.work_id);
  const finalAgents = agents.load(input.work_id).agents;

  events.append({
    work_id: input.work_id,
    type: "hierarchy.spawn",
    actor: masterId,
    payload: { domains: created },
  });

  return {
    work_id: input.work_id,
    goal_contract_id: goal.goal_contract_id,
    domains: created,
    tasks: finalTasks,
    agents: finalAgents,
  };
}

export function approveDomainPlan(
  paths: V3DataPaths,
  workId: string,
  domain: string,
  planVersion: number,
): { tasks: TaskGraphSnapshot; plan_task: OrchestrationTask } {
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  const events = new CoordinationEventLog(paths.eventLogDir);
  const ledger = new WorkLedgerStore(paths.workLedgerDir);
  const planTaskId = `plan-${domain.toLowerCase()}`;
  const snap = tasks.approvePlan(workId, planTaskId, planVersion);
  const plan = snap.tasks.find((t) => t.task_id === planTaskId);
  if (!plan) throw new HierarchyError("PLAN_TASK_MISSING", planTaskId);
  events.append({
    work_id: workId,
    type: "hierarchy.plan_approved",
    actor: plan.owner_agent_id,
    payload: { domain, plan_version: planVersion, plan_task_id: planTaskId },
  });
  ledger.append({
    work_id: workId,
    type: "plan_approved",
    origin: "hierarchy.approveDomainPlan",
    task_id: planTaskId,
    agent_id: plan.owner_agent_id,
    goal_contract_id: snap.goal_contract_id,
    payload: { domain, plan_version: planVersion },
    provenance: { source: "hierarchy", refs: [planTaskId] },
  });
  return { tasks: snap, plan_task: plan };
}

export interface SpawnAuxiliaryInput {
  work_id: string;
  parent_agent_id: string;
  auxiliary_id?: string;
  objective: string;
  domain?: string;
  task_id?: string;
  max_children_parent?: number;
}

export interface SpawnAuxiliaryResult {
  kind: "SpawnAuxiliaryResult";
  work_id: string;
  auxiliary_agent_id: string;
  research_task_id: string;
  parent_agent_id: string;
  limitations: string[];
}

/**
 * Worker/leader may spawn an auxiliary for research/analysis under inherited permissions.
 * Enforces parent allowSpawn and optional max_children on parent delegation.
 */
export function spawnAuxiliary(
  paths: V3DataPaths,
  input: SpawnAuxiliaryInput,
): SpawnAuxiliaryResult {
  const agents = new AgentRegistryStore(paths.agentsDir);
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  const events = new CoordinationEventLog(paths.eventLogDir);
  const ledger = new WorkLedgerStore(paths.workLedgerDir);

  const snap = agents.load(input.work_id);
  const parent = snap.agents.find((a) => a.agent_id === input.parent_agent_id);
  if (!parent) throw new HierarchyError("PARENT_NOT_FOUND", input.parent_agent_id);
  if (parent.permissions.allowSpawn !== true) {
    throw new HierarchyError("PARENT_CANNOT_SPAWN", input.parent_agent_id);
  }
  const parentDlg = parent.delegation_id
    ? snap.delegations.find((d) => d.delegation_id === parent.delegation_id)
    : undefined;
  const maxChildren = input.max_children_parent ?? parentDlg?.budget.max_children;
  if (maxChildren != null && parent.child_agent_ids.length >= maxChildren) {
    throw new HierarchyError("MAX_CHILDREN", `${parent.child_agent_ids.length}/${maxChildren}`);
  }

  const graph = tasks.load(input.work_id);
  const auxId = input.auxiliary_id ?? `${input.parent_agent_id}-aux-${Date.now()}`;
  const researchTaskId = input.task_id ?? `research-${auxId}`;

  if (!graph.tasks.some((t) => t.task_id === researchTaskId)) {
    tasks.addTask(input.work_id, {
      task_id: researchTaskId,
      goal_contract_id: graph.goal_contract_id,
      goal_contract_version: graph.goal_contract_version,
      title: input.objective,
      domain: input.domain ?? parent.domain,
      task_kind: "research",
      owner_agent_id: auxId,
      parent_task_id: parent.task_id,
      depends_on: [],
    });
  }

  const auxPerms = {
    allowWrite: parent.permissions.allowWrite === true,
    allowShell: false,
    allowNetwork: false,
    allowHostInspect: parent.permissions.allowHostInspect === true,
    allowSpawn: false,
  };

  agents.register({
    agent_id: auxId,
    role: "auxiliary",
    work_id: input.work_id,
    domain: input.domain ?? parent.domain,
    parent_agent_id: input.parent_agent_id,
    task_id: researchTaskId,
    permissions: auxPerms,
    delegation: {
      delegation_id: `dlg-${auxId}`,
      role: "auxiliary",
      objective: input.objective,
      scope: [input.domain ?? parent.domain ?? "research"],
      out_of_scope: ["silent_scope_change", "implementation_without_worker"],
      task_id: researchTaskId,
      authorized_inputs: ["goal_contract", "codebase_read", "prior_evidence"],
      deliverables: ["research_notes", "references"],
      criteria_ids: [],
      permissions: auxPerms,
      budget: { max_children: 1 },
      expected_evidence: ["research-artifact"],
      termination_condition: "research delivered or CANCELLED",
      escalation_agent_id: input.parent_agent_id,
    },
  });
  agents.activate(input.work_id, auxId);

  events.append({
    work_id: input.work_id,
    type: "hierarchy.auxiliary_spawned",
    actor: input.parent_agent_id,
    payload: { auxiliary_agent_id: auxId, research_task_id: researchTaskId },
  });
  ledger.append({
    work_id: input.work_id,
    type: "agent_recorded",
    origin: "hierarchy.spawnAuxiliary",
    task_id: researchTaskId,
    agent_id: auxId,
    goal_contract_id: graph.goal_contract_id,
    payload: { role: "auxiliary", parent_agent_id: input.parent_agent_id },
    provenance: { source: "hierarchy", refs: [auxId] },
  });

  return {
    kind: "SpawnAuxiliaryResult",
    work_id: input.work_id,
    auxiliary_agent_id: auxId,
    research_task_id: researchTaskId,
    parent_agent_id: input.parent_agent_id,
    limitations: [
      "Auxiliary cannot escalate permissions beyond parent",
      "allowSpawn=false on auxiliaries by default (may be lifted by future policy within parent authority)",
    ],
  };
}
