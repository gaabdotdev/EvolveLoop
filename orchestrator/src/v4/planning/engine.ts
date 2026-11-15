/**
 * M07 Dynamic Planning Engine.
 *
 * Composes M01 Work commands + M02 EventLedgerPort. Does not rewrite those
 * trees and does not own a parallel Work store. Plans are proposals until
 * `accept` runs M01 `planTasks` / `changeTaskState` and then appends
 * `plan.revised` (allowlisted; R2).
 *
 * Capability profiles may be requested; they never rank executors (ADR-V4-0010).
 * Plans never request autonomy levels (D06). Executors cannot author plans (D15).
 */

import {
  WORK_TERMINAL_STATES,
  type ActorRef,
  type GoalContract,
  type Task,
  type Work,
  type WorkEvent,
} from "../contracts/index.js";
import { actorMayVersionGoal } from "../goal/index.js";
import type { TaskPlanInput } from "../work/index.js";
import { PLANNING_ERROR } from "./errors.js";
import { draftM07Event } from "./events.js";
import { ROUTING_BY_CAPABILITY_SCORE } from "./guarantees.js";
import { validateProposedGraph } from "./graph.js";
import { isM07EventType, type PlanRevisedPayload, type PlanTriggerKind } from "./payloads.js";
import { buildInitialProposal, buildReplanProposal } from "./propose.js";
import type {
  AcceptedPlan,
  PlanningDeps,
  PlanningRejected,
  PlanningResult,
  PlanProposal,
  ProposeOptions,
  ReplanTrigger,
} from "./types.js";

const DEFAULT_ACTOR: ActorRef = { kind: "PLATFORM", id: "v4-m07-planning" };

function rejected(code: string, message: string): PlanningRejected {
  return { status: "REJECTED", code, message };
}

function actorGate(actor: ActorRef): PlanningRejected | undefined {
  const gate = actorMayVersionGoal(actor);
  if (gate.allowed) return undefined;
  if (gate.code === "D15_EXECUTOR_CANNOT_VERSION") {
    return rejected(PLANNING_ERROR.EXECUTOR_CANNOT_PLAN, "executors cannot author the task graph (D15)");
  }
  return rejected(PLANNING_ERROR.ACTOR_CANNOT_PLAN, gate.message);
}

function autonomyOrScoreForbidden(opts?: ProposeOptions): PlanningRejected | undefined {
  if (opts && Object.prototype.hasOwnProperty.call(opts, "requested_autonomy") && opts.requested_autonomy !== undefined) {
    return rejected(PLANNING_ERROR.AUTONOMY_FORBIDDEN, "plans cannot request autonomy levels (D06)");
  }
  if (opts?.ranked_executor_ids && opts.ranked_executor_ids.length > 0) {
    return rejected(PLANNING_ERROR.SCORE_ROUTING_FORBIDDEN, "capability-score routing is forbidden (ADR-V4-0010)");
  }
  if (opts?.prefer_executor_id) {
    return rejected(PLANNING_ERROR.SCORE_ROUTING_FORBIDDEN, "capability-score routing is forbidden (ADR-V4-0010)");
  }
  if (ROUTING_BY_CAPABILITY_SCORE) {
    return rejected(PLANNING_ERROR.SCORE_ROUTING_FORBIDDEN, "capability-score routing pin is true (unreachable)");
  }
  return undefined;
}

export class PlanningEngine {
  private readonly deps: PlanningDeps;

  constructor(deps: PlanningDeps) {
    this.deps = {
      ...deps,
      clock: deps.clock ?? (() => new Date().toISOString()),
    };
  }

  /**
   * Read-only analysis of the current work projection + last plan.revised.
   * Does not append.
   */
  async inspect(work_id: string): Promise<
    PlanningResult<{
      work: Work;
      goal: GoalContract;
      tasks: Task[];
      last_plan_version: number;
      plan_revised_count: number;
    }>
  > {
    const loaded = await this.loadAccepted(work_id);
    if (loaded.status !== "OK") return loaded;
    const last = await this.lastPlanVersion(work_id);
    const events = await this.deps.ledger.read(work_id);
    return {
      status: "OK",
      work: loaded.work,
      goal: loaded.goal,
      tasks: loaded.tasks,
      last_plan_version: last,
      plan_revised_count: events.filter((e) => isM07EventType(e.type)).length,
    };
  }

  async propose(work_id: string, actor: ActorRef, opts?: ProposeOptions): Promise<PlanningResult<PlanProposal>> {
    const forbidden = autonomyOrScoreForbidden(opts) ?? actorGate(actor);
    if (forbidden) return forbidden;
    const loaded = await this.loadAccepted(work_id);
    if (loaded.status !== "OK") return loaded;
    if (WORK_TERMINAL_STATES.includes(loaded.work.state)) {
      return rejected(PLANNING_ERROR.WORK_TERMINAL, `cannot plan a ${loaded.work.state} work`);
    }

    const profiles_requested = await this.requestProfiles(opts?.inspect_executor_ids ?? opts?.trigger?.inspect_executor_ids);
    const evidence_ids = opts?.trigger?.evidence_ids ?? [];
    const evidence_from_executor = opts?.trigger?.reported_by?.kind === "EXECUTOR";
    const from_plan_version = await this.lastPlanVersion(work_id);
    const plan_version = from_plan_version + 1;
    const existing = loaded.tasks;

    const proposal =
      existing.length === 0 && (!opts?.trigger || opts.trigger.kind === "INITIAL")
        ? buildInitialProposal({
            goal: loaded.goal,
            plan_version,
            from_plan_version,
            tasks: opts?.tasks,
            justification: opts?.trigger?.justification ?? "Initial plan from ACCEPTED Goal Contract",
            evidence_ids,
            evidence_from_executor,
            profiles_requested,
          })
        : buildReplanProposal({
            goal: loaded.goal,
            current: existing,
            trigger: opts?.trigger ?? {
              kind: "NEW_EVIDENCE",
              justification: "Replan from current Work projection",
              evidence_ids,
            },
            plan_version,
            from_plan_version,
            extra_tasks: opts?.tasks,
            evidence_from_executor,
            profiles_requested,
          });

    return this.validateProposal(proposal, existing);
  }

  /**
   * Apply a proposal through M01 command paths, then append `plan.revised`.
   * Does not mutate prior events (append-only).
   */
  async accept(proposal: PlanProposal, actor: ActorRef): Promise<PlanningResult<AcceptedPlan>> {
    const forbidden = actorGate(actor);
    if (forbidden) return forbidden;
    if (proposal.autonomy_requested) {
      return rejected(PLANNING_ERROR.AUTONOMY_FORBIDDEN, "plans cannot request autonomy levels (D06)");
    }
    if (proposal.profiles_used_for_routing || proposal.ranked_executor_ids.length > 0) {
      return rejected(PLANNING_ERROR.SCORE_ROUTING_FORBIDDEN, "capability-score routing is forbidden (ADR-V4-0010)");
    }

    const loaded = await this.loadAccepted(proposal.work_id);
    if (loaded.status !== "OK") return loaded;
    const checked = this.validateProposal(proposal, loaded.tasks);
    if (checked.status !== "OK") return checked;

    const priorEvents = await this.deps.ledger.read(proposal.work_id);
    const priorHead = priorEvents.map((e) => ({ event_id: e.event_id, event_digest: e.event_digest, seq: e.seq }));

    for (const task_id of proposal.interrupt_task_ids) {
      const current = loaded.tasks.find((t) => t.task_id === task_id);
      if (!current || current.state !== "RUNNING") continue;
      const suspended = await this.deps.work.changeTaskState(proposal.work_id, actor, {
        task_id,
        to: "SUSPENDED",
      });
      if (suspended.status !== "OK") return rejected(suspended.code, suspended.message);
    }

    const afterInterrupt = await this.deps.work.listTasks(proposal.work_id);
    for (const task_id of proposal.obsolete_task_ids) {
      const current = afterInterrupt.find((t) => t.task_id === task_id);
      if (!current || current.state === "OBSOLETE" || current.state === "CANCELLED") continue;
      const progress_status = current.state === "VERIFIED" || current.progress_status === "CONFIRMED" ? "CONFIRMED" : undefined;
      const obsoleted = await this.deps.work.changeTaskState(proposal.work_id, actor, {
        task_id,
        to: "OBSOLETE",
        progress_status,
      });
      if (obsoleted.status !== "OK") return rejected(obsoleted.code, obsoleted.message);
    }

    if (proposal.proposed_tasks.length > 0) {
      const plans: TaskPlanInput[] = proposal.proposed_tasks.map((t) => ({
        task_id: t.task_id,
        title: t.title,
        task_kind: t.task_kind,
        depends_on: t.depends_on,
        criterion_refs: t.criterion_refs,
        expected_result: t.expected_result,
      }));
      const planned = await this.deps.work.planTasks(proposal.work_id, actor, plans);
      if (planned.status !== "OK") return rejected(planned.code, planned.message);
    }

    const tasks = await this.deps.work.listTasks(proposal.work_id);
    const now = this.deps.clock!();
    const payload: PlanRevisedPayload = {
      plan_version: proposal.plan_version,
      from_plan_version: proposal.from_plan_version,
      work_id: proposal.work_id,
      goal_contract_id: proposal.goal_contract_id,
      goal_contract_version: proposal.goal_contract_version,
      trigger: proposal.trigger,
      justification: proposal.justification,
      obsolete_task_ids: proposal.obsolete_task_ids,
      preserved_task_ids: proposal.preserve_task_ids,
      proposed_task_ids: proposal.proposed_tasks.map((t) => t.task_id),
      critical_path_task_ids: proposal.analysis.critical_path_task_ids,
      independent_task_ids: proposal.analysis.independent_task_ids,
      risks: proposal.analysis.risks,
      remaining_cost: proposal.analysis.remaining_cost,
      change_impact: {
        added: proposal.proposed_tasks.length,
        preserved: proposal.preserve_task_ids.length,
        obsoleted: proposal.obsolete_task_ids.length,
        interrupted: proposal.interrupt_task_ids.length,
      },
      evidence_ids: proposal.evidence_ids,
      evidence_from_executor: proposal.evidence_from_executor,
      profiles_requested: proposal.profiles_requested,
      profiles_used_for_routing: false,
      autonomy_requested: false,
    };

    const draft = draftM07Event({
      work_id: proposal.work_id,
      type: "plan.revised",
      occurred_at: now,
      actor,
      correlation_id: proposal.work_id,
      payload: { ...payload },
    });
    const head = await this.deps.ledger.head(proposal.work_id);
    const appended = await this.deps.ledger.append(proposal.work_id, [draft], { expected_head_seq: head });
    if (appended.status !== "APPENDED" && appended.status !== "DUPLICATE") {
      if (appended.status === "INVALID") {
        return rejected("INV-EVT", appended.validation.issues.map((i) => i.message).join("; "));
      }
      if (appended.status === "CONFLICT" || appended.status === "FENCED") {
        return rejected(appended.status, appended.reason);
      }
      return rejected(PLANNING_ERROR.APPEND_FAILED, "unexpected ledger outcome");
    }

    const revised = appended.events.filter((e) => e.type === "plan.revised").at(-1);
    const event: WorkEvent | undefined =
      revised ?? (await this.deps.ledger.read(proposal.work_id)).filter((e) => e.type === "plan.revised").at(-1);
    if (!event) return rejected(PLANNING_ERROR.STRUCT, "plan.revised missing after append");

    const after = await this.deps.ledger.read(proposal.work_id);
    for (const p of priorHead) {
      const still = after.find((e) => e.seq === p.seq);
      if (!still || still.event_id !== p.event_id || still.event_digest !== p.event_digest) {
        return rejected(PLANNING_ERROR.STRUCT, "history mutated during accept (forbidden)");
      }
    }

    return {
      status: "OK",
      proposal,
      tasks,
      plan_revised_event: event,
      head_seq: appended.head_seq,
      history_mutated: false,
    };
  }

  /** Propose and accept in one step (still two phases internally). */
  async plan(work_id: string, actor: ActorRef, opts?: ProposeOptions): Promise<PlanningResult<AcceptedPlan>> {
    const proposed = await this.propose(work_id, actor, opts);
    if (proposed.status !== "OK") return proposed;
    return this.accept(proposed, actor);
  }

  async replan(work_id: string, actor: ActorRef, trigger: ReplanTrigger): Promise<PlanningResult<AcceptedPlan>> {
    return this.plan(work_id, actor, { trigger });
  }

  private validateProposal(proposal: PlanProposal, existing: readonly Task[]): PlanningResult<PlanProposal> {
    if (proposal.proposed_tasks.length === 0 && proposal.obsolete_task_ids.length === 0 && existing.length === 0) {
      return rejected(PLANNING_ERROR.EMPTY, "plan covers no tasks");
    }
    const issues = validateProposedGraph(
      proposal.work_id,
      existing,
      proposal.proposed_tasks,
      new Set(proposal.obsolete_task_ids),
    );
    if (issues.length > 0) {
      return rejected(issues[0]!.code, issues.map((i) => i.message).join("; "));
    }
    return { status: "OK", ...proposal } as PlanningResult<PlanProposal>;
  }

  private async loadAccepted(
    work_id: string,
  ): Promise<PlanningResult<{ work: Work; goal: GoalContract; tasks: Task[] }>> {
    const work = await this.deps.work.getWork(work_id);
    if (!work) return rejected(PLANNING_ERROR.STRUCT, "work not found");
    const goal = await this.deps.work.getGoalContract(work.goal_contract_ref.id, work.goal_contract_ref.version);
    if (!goal) return rejected(PLANNING_ERROR.STRUCT, "goal contract not found");
    if (goal.status !== "ACCEPTED") {
      return rejected(PLANNING_ERROR.GOAL_NOT_ACCEPTED, "cannot plan tasks before the Goal Contract is ACCEPTED");
    }
    const tasks = await this.deps.work.listTasks(work_id);
    return { status: "OK", work, goal, tasks };
  }

  private async lastPlanVersion(work_id: string): Promise<number> {
    const events = await this.deps.ledger.read(work_id);
    let max = 0;
    for (const e of events) {
      if (e.type !== "plan.revised") continue;
      const v = e.payload.plan_version;
      if (typeof v === "number" && Number.isInteger(v) && v > max) max = v;
    }
    return max;
  }

  private async requestProfiles(executorIds: string[] | undefined): Promise<boolean> {
    if (!this.deps.profiles || !executorIds || executorIds.length === 0) return false;
    for (const executor_id of executorIds) {
      await this.deps.profiles.profilesFor(executor_id, { work_category: "planning", task_kind: "PLAN" });
    }
    return true;
  }
}

export function defaultPlanningActor(): ActorRef {
  return { ...DEFAULT_ACTOR };
}

export type { PlanTriggerKind };
