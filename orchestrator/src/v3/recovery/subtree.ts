/**
 * Subtree recovery after leader/parent loss.
 * Uses Agent Registry orphan/cancel + optional adopt under a healthy ancestor.
 * Does not claim automatic cross-provider harness swap.
 */

import { AgentRegistryStore } from "../agent-registry/store.js";
import type { AgentRecord, AgentState } from "../agent-registry/types.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { ContinuityEngine } from "../continuity/engine.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import { CoordinationEventLog } from "../event-log/store.js";
import type { V3DataPaths } from "../paths.js";

export type RecoveryAction = "orphan" | "cancel" | "adopt_under_master" | "handoff_then_orphan";

export interface SubtreeRecoveryPlan {
  kind: "SubtreeRecoveryPlan";
  work_id: string;
  failed_parent_id: string;
  failed_parent_state: AgentState;
  descendants: Array<{ agent_id: string; role: string; state: AgentState; task_id?: string }>;
  recommended_action: RecoveryAction;
  adopt_target?: string;
  limitations: string[];
}

export interface SubtreeRecoveryResult {
  kind: "SubtreeRecoveryResult";
  work_id: string;
  action: RecoveryAction;
  failed_parent_id: string;
  affected_agents: string[];
  adopted?: Array<{ orphan_id: string; new_parent_id: string }>;
  handoffs?: string[];
  tasks_reassigned: Array<{ task_id: string; new_owner?: string }>;
  limitations: string[];
}

const LIMITATIONS = [
  "Recovery mutates Agent Registry + TaskGraph ownership — not exactly-once fencing by itself",
  "No automatic Claude/Codex/Antigravity process swap",
  "Handoff packages omit private model transcripts",
];

function nowIso(): string {
  return new Date().toISOString();
}

function collectDescendants(agents: AgentRecord[], parentId: string): AgentRecord[] {
  const byParent = new Map<string, AgentRecord[]>();
  for (const a of agents) {
    if (!a.parent_agent_id) continue;
    const list = byParent.get(a.parent_agent_id) ?? [];
    list.push(a);
    byParent.set(a.parent_agent_id, list);
  }
  const out: AgentRecord[] = [];
  const stack = [...(byParent.get(parentId) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur.agent_id)) continue;
    seen.add(cur.agent_id);
    out.push(cur);
    stack.push(...(byParent.get(cur.agent_id) ?? []));
  }
  return out;
}

export function planSubtreeRecovery(paths: V3DataPaths, workId: string, failedParentId: string): SubtreeRecoveryPlan {
  const agents = new AgentRegistryStore(paths.agentsDir).load(workId);
  const parent = agents.agents.find((a) => a.agent_id === failedParentId);
  if (!parent) {
    throw new RecoveryError("PARENT_NOT_FOUND", failedParentId);
  }
  const descendants = collectDescendants(agents.agents, failedParentId);
  const master = agents.agents.find(
    (a) => a.role === "master" && !["FAILED", "CANCELLED", "REPLACED"].includes(a.state),
  );
  let recommended: RecoveryAction = "orphan";
  if (descendants.length === 0) {
    recommended = "cancel";
  } else if (master && master.agent_id !== failedParentId) {
    recommended = "adopt_under_master";
  } else if (descendants.some((d) => d.task_id)) {
    recommended = "handoff_then_orphan";
  }

  return {
    kind: "SubtreeRecoveryPlan",
    work_id: workId,
    failed_parent_id: failedParentId,
    failed_parent_state: parent.state,
    descendants: descendants.map((d) => ({
      agent_id: d.agent_id,
      role: d.role,
      state: d.state,
      task_id: d.task_id,
    })),
    recommended_action: recommended,
    adopt_target: recommended === "adopt_under_master" ? master?.agent_id : undefined,
    limitations: [...LIMITATIONS],
  };
}

export function recoverSubtree(
  paths: V3DataPaths,
  input: {
    work_id: string;
    failed_parent_id: string;
    action?: RecoveryAction;
  },
): SubtreeRecoveryResult {
  const plan = planSubtreeRecovery(paths, input.work_id, input.failed_parent_id);
  const action = input.action ?? plan.recommended_action;
  const agents = new AgentRegistryStore(paths.agentsDir);
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  const ledger = new WorkLedgerStore(paths.workLedgerDir);
  const events = new CoordinationEventLog(paths.eventLogDir);
  const continuity = new ContinuityEngine(paths);

  const affected: string[] = [];
  const adopted: SubtreeRecoveryResult["adopted"] = [];
  const handoffs: string[] = [];
  const tasksReassigned: SubtreeRecoveryResult["tasks_reassigned"] = [];

  if (action === "cancel") {
    agents.reconcileParentFailure(input.work_id, input.failed_parent_id, "cancel");
    affected.push(input.failed_parent_id, ...plan.descendants.map((d) => d.agent_id));
  } else if (action === "orphan" || action === "adopt_under_master" || action === "handoff_then_orphan") {
    if (action === "handoff_then_orphan") {
      for (const d of plan.descendants) {
        if (!d.task_id) continue;
        const agent = agents.load(input.work_id).agents.find((a) => a.agent_id === d.agent_id);
        if (!agent || !agent.task_id) continue;
        try {
          const pkg = continuity.createHandoff({
            work_id: input.work_id,
            agent_id: d.agent_id,
            trigger: "FAILED",
            reason: `subtree recovery after parent ${input.failed_parent_id} loss`,
          });
          handoffs.push(pkg.handoff_id);
        } catch {
          /* agent may lack task linkage — continue */
        }
      }
    }

    agents.reconcileParentFailure(input.work_id, input.failed_parent_id, "orphan");
    affected.push(input.failed_parent_id, ...plan.descendants.map((d) => d.agent_id));

    if (action === "adopt_under_master" && plan.adopt_target) {
      // Flatten direct recovery under master; nested agents are re-parented in one pass.
      for (const d of plan.descendants) {
        const snap = agents.load(input.work_id);
        const orphan = snap.agents.find((a) => a.agent_id === d.agent_id);
        if (!orphan || orphan.state !== "ORPHANED") continue;
        agents.adoptOrphan(input.work_id, d.agent_id, plan.adopt_target);
        adopted.push({ orphan_id: d.agent_id, new_parent_id: plan.adopt_target });
        if (d.task_id) {
          tasks.setTaskOwner(input.work_id, d.task_id, d.agent_id);
          tasksReassigned.push({ task_id: d.task_id, new_owner: d.agent_id });
        }
      }
    }
  } else {
    throw new RecoveryError("UNKNOWN_ACTION", String(action));
  }

  events.append({
    work_id: input.work_id,
    type: "recovery.subtree",
    actor: "recovery",
    payload: {
      action,
      failed_parent_id: input.failed_parent_id,
      affected,
      adopted,
      handoffs,
    },
  });

  ledger.append({
    work_id: input.work_id,
    type: "note",
    origin: "recovery.subtree",
    payload: {
      kind: "subtree_recovery",
      action,
      failed_parent_id: input.failed_parent_id,
      affected_count: affected.length,
      adopted_count: adopted.length,
      handoff_count: handoffs.length,
      at: nowIso(),
    },
    provenance: { source: "recovery", refs: [input.failed_parent_id] },
  });

  return {
    kind: "SubtreeRecoveryResult",
    work_id: input.work_id,
    action,
    failed_parent_id: input.failed_parent_id,
    affected_agents: affected,
    adopted,
    handoffs,
    tasks_reassigned: tasksReassigned,
    limitations: [...LIMITATIONS],
  };
}

export class RecoveryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "RecoveryError";
  }
}
