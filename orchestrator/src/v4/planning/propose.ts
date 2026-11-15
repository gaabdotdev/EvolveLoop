/**
 * Deterministic plan / replan from an ACCEPTED Goal Contract + current tasks.
 * Does not write Work; the engine accepts via M01 command paths.
 */

import { isValidId, type GoalContract, type Task, type TaskKind } from "../contracts/index.js";
import { allocateId } from "../goal/ids.js";
import type { TaskPlanInput } from "../work/index.js";
import {
  criticalPath,
  independentTaskIds,
  liveTasks,
  remainingCost,
  transitiveDependents,
  uncoveredMandatoryCriteria,
} from "./graph.js";
import type { PlanAnalysis, PlanProposal, ProposedTask, ReplanTrigger } from "./types.js";

const HEALTHY_PRESERVE_STATES: ReadonlySet<Task["state"]> = new Set(["VERIFIED"]);

function node(t: Pick<Task, "task_id" | "depends_on">) {
  return { task_id: t.task_id, work_id: "_", depends_on: t.depends_on };
}

function analysisOf(goal: GoalContract, live: readonly ProposedTask[], existingLive: readonly Task[]): PlanAnalysis {
  const nodes = [
    ...existingLive.map(node),
    ...live.map((t) => ({ task_id: t.task_id, work_id: goal.work_id, depends_on: t.depends_on })),
  ];
  const blocked = existingLive.filter((t) => t.state === "BLOCKED").map((t) => t.task_id);
  const failed = existingLive.filter((t) => t.state === "FAILED").map((t) => t.task_id);
  const risks = [
    ...goal.risks,
    ...blocked.map((id) => `blocked:${id}`),
    ...failed.map((id) => `failed:${id}`),
  ];
  return {
    critical_path_task_ids: criticalPath(nodes),
    independent_task_ids: independentTaskIds(nodes),
    risks,
    remaining_cost: remainingCost(goal),
    blocked_task_ids: blocked,
    failed_task_ids: failed,
  };
}

function criterionTasks(c: GoalContract["acceptance_criteria"][number]): ProposedTask[] {
  const implId = allocateId("task");
  const verifyId = allocateId("task");
  const impl: ProposedTask = {
    task_id: implId,
    title: `Implement: ${c.statement}`,
    task_kind: "IMPLEMENT",
    depends_on: [],
    criterion_refs: [c.criterion_id],
    expected_result: c.statement,
  };
  const verify: ProposedTask = {
    task_id: verifyId,
    title: `Verify: ${c.statement}`,
    task_kind: "VERIFY",
    depends_on: [implId],
    criterion_refs: [c.criterion_id],
    expected_result: `Independent evidence for ${c.criterion_id}`,
  };
  return [impl, verify];
}

export function fromTaskPlanInput(work_id: string, plans: TaskPlanInput[]): ProposedTask[] {
  void work_id;
  return plans.map((p) => ({
    task_id: p.task_id && isValidId("task", p.task_id) ? p.task_id : allocateId("task"),
    title: p.title,
    task_kind: p.task_kind,
    depends_on: p.depends_on ?? [],
    criterion_refs: p.criterion_refs ?? [],
    expected_result: p.expected_result,
  }));
}

export function buildInitialProposal(input: {
  goal: GoalContract;
  plan_version: number;
  from_plan_version: number;
  tasks?: TaskPlanInput[];
  justification: string;
  evidence_ids: string[];
  evidence_from_executor: boolean;
  profiles_requested: boolean;
}): PlanProposal {
  const proposed =
    input.tasks && input.tasks.length > 0
      ? fromTaskPlanInput(input.goal.work_id, input.tasks)
      : input.goal.acceptance_criteria.flatMap(criterionTasks);

  return {
    work_id: input.goal.work_id,
    goal_contract_id: input.goal.goal_contract_id,
    goal_contract_version: input.goal.version,
    plan_version: input.plan_version,
    from_plan_version: input.from_plan_version,
    trigger: "INITIAL",
    justification: input.justification,
    proposed_tasks: proposed,
    preserve_task_ids: [],
    obsolete_task_ids: [],
    interrupt_task_ids: [],
    analysis: analysisOf(input.goal, proposed, []),
    evidence_ids: input.evidence_ids,
    evidence_from_executor: input.evidence_from_executor,
    profiles_requested: input.profiles_requested,
    profiles_used_for_routing: false,
    autonomy_requested: false,
    ranked_executor_ids: [],
  };
}

function recreate(old: Task, newId: string, idMap: Map<string, string>, obsolete: ReadonlySet<string>): ProposedTask {
  const depends_on = old.depends_on
    .map((d) => idMap.get(d) ?? d)
    .filter((d) => !obsolete.has(d) && d !== old.task_id);
  return {
    task_id: newId,
    title: old.title,
    task_kind: old.task_kind as TaskKind,
    depends_on,
    criterion_refs: [...old.criterion_refs],
    expected_result: old.expected_result,
    replaces_task_id: old.task_id,
  };
}

export function buildReplanProposal(input: {
  goal: GoalContract;
  current: readonly Task[];
  trigger: ReplanTrigger;
  plan_version: number;
  from_plan_version: number;
  extra_tasks?: TaskPlanInput[];
  evidence_from_executor: boolean;
  profiles_requested: boolean;
}): PlanProposal {
  const live = liveTasks(input.current);
  const failedIds = new Set(input.trigger.failed_task_ids ?? live.filter((t) => t.state === "FAILED").map((t) => t.task_id));
  const supersede = new Set(input.trigger.supersede_task_ids ?? []);
  const roots = new Set([...failedIds, ...supersede]);

  const dependent = roots.size > 0 ? transitiveDependents(live.map(node), roots) : new Set<string>();
  const rewriteIds = new Set(
    [...dependent].filter((id) => {
      const t = live.find((x) => x.task_id === id);
      if (!t) return false;
      if (HEALTHY_PRESERVE_STATES.has(t.state)) return false;
      return true;
    }),
  );

  const preserve = live.filter((t) => !rewriteIds.has(t.task_id)).map((t) => t.task_id);
  const obsolete = live.filter((t) => rewriteIds.has(t.task_id));
  const interrupt = obsolete.filter((t) => t.state === "RUNNING").map((t) => t.task_id);

  const idMap = new Map<string, string>();
  for (const t of obsolete) idMap.set(t.task_id, allocateId("task"));
  const obsoleteSet = new Set(obsolete.map((t) => t.task_id));

  const proposed: ProposedTask[] = obsolete.map((t) => recreate(t, idMap.get(t.task_id)!, idMap, obsoleteSet));

  if (input.extra_tasks && input.extra_tasks.length > 0) {
    proposed.push(...fromTaskPlanInput(input.goal.work_id, input.extra_tasks));
  }

  if (input.trigger.kind === "STRATEGY_STALLED" || input.trigger.kind === "TASK_BLOCKED") {
    const blocked = live.filter((t) => t.state === "BLOCKED" && !rewriteIds.has(t.task_id));
    if (blocked.length > 0) {
      proposed.push({
        task_id: allocateId("task"),
        title: "Investigate blocker",
        task_kind: "RESEARCH",
        depends_on: [],
        criterion_refs: [...new Set(blocked.flatMap((t) => t.criterion_refs))],
        expected_result: "Documented unblock path (does not rewrite existing depends_on; M01 cannot mutate live deps)",
      });
    }
  }

  const uncovered = uncoveredMandatoryCriteria(input.goal, [
    ...live.filter((t) => !rewriteIds.has(t.task_id)),
    ...proposed.map((p) => ({ criterion_refs: p.criterion_refs, state: "PENDING" as const })),
  ]);
  for (const cid of uncovered) {
    const c = input.goal.acceptance_criteria.find((x) => x.criterion_id === cid);
    if (c) proposed.push(...criterionTasks(c));
  }

  const preservedLive = live.filter((t) => preserve.includes(t.task_id));

  return {
    work_id: input.goal.work_id,
    goal_contract_id: input.goal.goal_contract_id,
    goal_contract_version: input.goal.version,
    plan_version: input.plan_version,
    from_plan_version: input.from_plan_version,
    trigger: input.trigger.kind,
    justification: input.trigger.justification,
    proposed_tasks: proposed,
    preserve_task_ids: preserve,
    obsolete_task_ids: obsolete.map((t) => t.task_id),
    interrupt_task_ids: interrupt,
    analysis: analysisOf(input.goal, proposed, preservedLive),
    evidence_ids: input.trigger.evidence_ids ?? [],
    evidence_from_executor: input.evidence_from_executor,
    profiles_requested: input.profiles_requested,
    profiles_used_for_routing: false,
    autonomy_requested: false,
    ranked_executor_ids: [],
  };
}
