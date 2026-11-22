/**
 * Continuity Engine — build/apply Handoff Packages without copying private model transcripts.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { AgentRegistryStore } from "../agent-registry/store.js";
import type { AgentRecord } from "../agent-registry/types.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { GoalContractStore } from "../goal-contract/store.js";
import { CoordinationEventLog } from "../event-log/store.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import type { V3DataPaths } from "../paths.js";
import type { HandoffPackage, HandoffTrigger } from "./types.js";

export class ContinuityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ContinuityError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export interface CreateHandoffInput {
  work_id: string;
  agent_id: string;
  trigger: HandoffTrigger;
  reason: string;
  next_action?: string;
  decisions?: string[];
}

export class ContinuityEngine {
  readonly agents: AgentRegistryStore;
  readonly tasks: TaskGraphStore;
  readonly goals: GoalContractStore;
  readonly events: CoordinationEventLog;
  readonly ledger: WorkLedgerStore;

  constructor(private readonly paths: V3DataPaths) {
    mkdirSync(paths.handoffsDir, { recursive: true });
    this.agents = new AgentRegistryStore(paths.agentsDir);
    this.tasks = new TaskGraphStore(paths.taskGraphsDir);
    this.goals = new GoalContractStore(paths.goalContractsDir);
    this.events = new CoordinationEventLog(paths.eventLogDir);
    this.ledger = new WorkLedgerStore(paths.workLedgerDir);
  }

  private pathFor(handoffId: string): string {
    return join(this.paths.handoffsDir, `${handoffId}.json`);
  }

  createHandoff(input: CreateHandoffInput): HandoffPackage {
    const registry = this.agents.load(input.work_id);
    const agent = registry.agents.find((a) => a.agent_id === input.agent_id);
    if (!agent) throw new ContinuityError("AGENT_NOT_FOUND", input.agent_id);
    if (!agent.task_id) throw new ContinuityError("AGENT_HAS_NO_TASK", input.agent_id);

    const graph = this.tasks.load(input.work_id);
    const task = graph.tasks.find((t) => t.task_id === agent.task_id);
    if (!task) throw new ContinuityError("TASK_NOT_FOUND", agent.task_id);

    const goal = this.goals.loadLatest(graph.goal_contract_id);
    const handoff_id = `ho-${randomUUID()}`;

    // Session event — do not mark task FAILED solely because agent hit a limit
    if (input.trigger === "LIMIT_REACHED" || input.trigger === "STALE") {
      this.agents.setState(input.work_id, input.agent_id, input.trigger);
    } else if (input.trigger === "FAILED") {
      this.agents.setState(input.work_id, input.agent_id, "FAILED");
    }

    const pkg: HandoffPackage = {
      kind: "HandoffPackage",
      handoff_id,
      work_id: input.work_id,
      goal_contract_id: goal.goal_contract_id,
      goal_contract_version: goal.version,
      task_id: task.task_id,
      from_agent_id: agent.agent_id,
      from_role: agent.role,
      from_state: input.trigger === "LIMIT_REACHED" ? "LIMIT_REACHED" : agent.state,
      trigger: input.trigger,
      reason: input.reason,
      verified_task_state: task.state,
      verified_progress: {
        plan_approved: task.plan_approved,
        plan_version: task.plan_version,
        evidence_ids: [...task.evidence_ids],
        feature_id: task.feature_id,
        ir_id: task.ir_id,
        run_id: task.run_id,
        decisions: input.decisions ?? [],
        next_action:
          input.next_action ??
          `Continue task ${task.task_id} from verified state ${task.state} without redoing verified work`,
      },
      delegation_id: agent.delegation_id,
      permissions: { ...agent.permissions },
      budget_consumed: { ...agent.budget_consumed },
      child_agent_ids: [...agent.child_agent_ids],
      created_at: nowIso(),
      status: "pending",
    };

    atomicWrite(this.pathFor(handoff_id), JSON.stringify(pkg, null, 2));
    this.events.append({
      work_id: input.work_id,
      type: "continuity.handoff_created",
      actor: agent.agent_id,
      payload: { handoff_id, trigger: input.trigger, task_id: task.task_id },
    });
    this.ledger.append({
      work_id: input.work_id,
      type: "handoff_recorded",
      origin: "continuity.createHandoff",
      task_id: task.task_id,
      agent_id: agent.agent_id,
      goal_contract_id: goal.goal_contract_id,
      payload: {
        handoff_id,
        trigger: input.trigger,
        status: "pending",
        verified_task_state: task.state,
      },
      provenance: { source: "continuity", refs: [handoff_id] },
    });
    return pkg;
  }

  load(handoffId: string): HandoffPackage {
    const path = this.pathFor(handoffId);
    if (!existsSync(path)) throw new ContinuityError("NOT_FOUND", handoffId);
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as HandoffPackage;
    if (parsed.kind !== "HandoffPackage") throw new ContinuityError("INVALID", handoffId);
    return parsed;
  }

  /**
   * Eligible substitutes: same role, not terminal, permissions ⊆ handoff permissions,
   * and preferably same work with capacity to take the task.
   */
  findEligibleSubstitutes(handoff: HandoffPackage): AgentRecord[] {
    const snap = this.agents.load(handoff.work_id);
    return snap.agents.filter((a) => {
      if (a.agent_id === handoff.from_agent_id) return false;
      if (a.role !== handoff.from_role) return false;
      if (["COMPLETED", "CANCELLED", "REPLACED", "FAILED"].includes(a.state)) return false;
      for (const key of Object.keys(handoff.permissions) as Array<keyof typeof handoff.permissions>) {
        if (handoff.permissions[key] === true && a.permissions[key] !== true) return false;
      }
      return true;
    });
  }

  /**
   * Apply handoff: create/activate substitute, mark source REPLACED, reassign task owner.
   * If no substitute available → pause package (work preserved).
   */
  applyHandoff(
    handoffId: string,
    opts?: { substitute_agent_id?: string; create_substitute?: boolean },
  ): HandoffPackage {
    const pkg = this.load(handoffId);
    if (pkg.status !== "pending") {
      throw new ContinuityError("NOT_PENDING", pkg.status);
    }

    let substituteId = opts?.substitute_agent_id;
    if (!substituteId && opts?.create_substitute !== false) {
      substituteId = this.spawnSubstitute(pkg);
    }
    if (!substituteId) {
      const eligible = this.findEligibleSubstitutes(pkg);
      substituteId = eligible[0]?.agent_id;
    }

    if (!substituteId) {
      pkg.status = "paused_no_substitute";
      pkg.pause_reason = "no eligible substitute agent";
      atomicWrite(this.pathFor(handoffId), JSON.stringify(pkg, null, 2));
      this.events.append({
        work_id: pkg.work_id,
        type: "continuity.handoff_paused",
        actor: "continuity",
        payload: { handoff_id: handoffId, reason: pkg.pause_reason },
      });
      return pkg;
    }

    this.agents.replaceAgent(pkg.work_id, pkg.from_agent_id, substituteId);
    this.tasks.setTaskOwner(pkg.work_id, pkg.task_id, substituteId);

    // Do not rewind verified task state
    const graph = this.tasks.load(pkg.work_id);
    const task = graph.tasks.find((t) => t.task_id === pkg.task_id);
    if (task && task.state !== pkg.verified_task_state) {
      // Only allow forward progress already on disk; never silently reset to PENDING
      if (task.state === "PENDING" && pkg.verified_task_state !== "PENDING") {
        this.tasks.setTaskState(pkg.work_id, pkg.task_id, pkg.verified_task_state);
      }
    }

    pkg.to_agent_id = substituteId;
    pkg.applied_at = nowIso();
    pkg.status = "applied";
    atomicWrite(this.pathFor(handoffId), JSON.stringify(pkg, null, 2));
    this.events.append({
      work_id: pkg.work_id,
      type: "continuity.handoff_applied",
      actor: substituteId,
      payload: {
        handoff_id: handoffId,
        from: pkg.from_agent_id,
        to: substituteId,
        task_id: pkg.task_id,
        next_action: pkg.verified_progress.next_action,
      },
    });
    this.ledger.append({
      work_id: pkg.work_id,
      type: "handoff_recorded",
      origin: "continuity.applyHandoff",
      task_id: pkg.task_id,
      agent_id: substituteId,
      goal_contract_id: pkg.goal_contract_id,
      payload: {
        handoff_id: handoffId,
        status: "applied",
        from: pkg.from_agent_id,
        to: substituteId,
        next_action: pkg.verified_progress.next_action,
      },
      provenance: { source: "continuity", refs: [handoffId] },
    });
    return pkg;
  }

  private spawnSubstitute(pkg: HandoffPackage): string {
    const from = this.agents.load(pkg.work_id).agents.find((a) => a.agent_id === pkg.from_agent_id);
    if (!from) throw new ContinuityError("AGENT_NOT_FOUND", pkg.from_agent_id);
    const substituteId = `${pkg.from_agent_id}-sub-${pkg.handoff_id.slice(0, 8)}`;
    const parentId = from.parent_agent_id;
    if (!parentId && from.role !== "master" && from.role !== "coordinator") {
      throw new ContinuityError("NO_PARENT_FOR_SUBSTITUTE", pkg.from_agent_id);
    }

    if (from.role === "master" || from.role === "coordinator") {
      this.agents.register({
        agent_id: substituteId,
        role: from.role,
        work_id: pkg.work_id,
        domain: from.domain,
        task_id: pkg.task_id,
        permissions: { ...pkg.permissions },
      });
    } else {
      this.agents.register({
        agent_id: substituteId,
        role: from.role,
        work_id: pkg.work_id,
        domain: from.domain,
        parent_agent_id: parentId,
        task_id: pkg.task_id,
        permissions: { ...pkg.permissions },
        delegation: {
          delegation_id: `dlg-${substituteId}`,
          role: from.role,
          objective: `Handoff continuation of ${pkg.task_id}: ${pkg.verified_progress.next_action}`,
          scope: from.domain ? [from.domain] : [],
          out_of_scope: [],
          task_id: pkg.task_id,
          authorized_inputs: ["handoff_package", "goal_contract", "task_graph"],
          deliverables: [],
          criteria_ids: [],
          permissions: { ...pkg.permissions },
          budget: {},
          expected_evidence: [],
          termination_condition: "task TRUE_PASS or CANCELLED",
        },
      });
    }
    this.agents.activate(pkg.work_id, substituteId);
    return substituteId;
  }
}
