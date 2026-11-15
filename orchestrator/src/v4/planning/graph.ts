/**
 * Task-graph analysis and INV-TASK-* checks (constitution §4.7).
 * Uses frozen `validateTaskGraph` — does not reimplement cycle/same-work rules.
 */

import { validateTaskGraph, type GoalContract, type Task } from "../contracts/index.js";
import { PLANNING_ERROR } from "./errors.js";
import type { RemainingCostRecord } from "./payloads.js";
import type { ProposedTask } from "./types.js";

export interface GraphIssue {
  code: string;
  task_id?: string;
  message: string;
}

export type GraphNode = Pick<Task, "task_id" | "work_id" | "depends_on">;

export function liveTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => t.state !== "OBSOLETE" && t.state !== "CANCELLED");
}

export function validateProposedGraph(
  work_id: string,
  existing: readonly Task[],
  proposed: readonly ProposedTask[],
  obsolete_ids: ReadonlySet<string>,
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const existingIds = new Set(existing.map((t) => t.task_id));
  const proposedIds = new Set(proposed.map((t) => t.task_id));
  const liveExisting = existing.filter((t) => !obsolete_ids.has(t.task_id) && t.state !== "CANCELLED");
  const liveIds = new Set([...liveExisting.map((t) => t.task_id), ...proposedIds]);

  for (const t of proposed) {
    if (t.depends_on.includes(t.task_id)) {
      issues.push({ code: PLANNING_ERROR.SELF_DEP, task_id: t.task_id, message: "a task cannot depend on itself" });
    }
    for (const dep of t.depends_on) {
      const inExisting = existingIds.has(dep);
      const inProposed = proposedIds.has(dep);
      if (!inExisting && !inProposed) {
        issues.push({
          code: PLANNING_ERROR.DEP_NOT_IN_WORK,
          task_id: t.task_id,
          message: `dependency ${dep} not in same work`,
        });
        continue;
      }
      if (obsolete_ids.has(dep) && !inProposed) {
        issues.push({
          code: PLANNING_ERROR.DEP_OBSOLETE,
          task_id: t.task_id,
          message: `new task must not depend on obsolete ${dep}`,
        });
      }
      if (inExisting && !liveIds.has(dep) && !inProposed) {
        issues.push({
          code: PLANNING_ERROR.DEP_OBSOLETE,
          task_id: t.task_id,
          message: `dependency ${dep} is not live`,
        });
      }
    }
  }

  const nodes: GraphNode[] = [
    ...existing.map((t) => ({ task_id: t.task_id, work_id: t.work_id, depends_on: t.depends_on })),
    ...proposed.map((t) => ({ task_id: t.task_id, work_id, depends_on: t.depends_on })),
  ];
  for (const g of validateTaskGraph(nodes)) {
    issues.push({ code: g.code, task_id: g.task_id, message: g.message });
  }
  return issues;
}

/** Longest path in the live DAG (node count). Empty graph → []. */
export function criticalPath(tasks: readonly GraphNode[]): string[] {
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  const memo = new Map<string, string[]>();
  const visiting = new Set<string>();

  const pathFrom = (id: string): string[] => {
    const cached = memo.get(id);
    if (cached) return cached;
    if (visiting.has(id)) return [id];
    visiting.add(id);
    const node = byId.get(id);
    const liveDeps = (node?.depends_on ?? []).filter((d) => byId.has(d));
    let best: string[] = [];
    for (const dep of liveDeps) {
      const p = pathFrom(dep);
      if (p.length > best.length) best = p;
    }
    visiting.delete(id);
    const result = [...best, id];
    memo.set(id, result);
    return result;
  };

  let best: string[] = [];
  for (const t of tasks) {
    const p = pathFrom(t.task_id);
    if (p.length > best.length) best = p;
  }
  return best;
}

/** Tasks whose live dependencies are empty — can start in parallel. */
export function independentTaskIds(tasks: readonly GraphNode[]): string[] {
  const live = new Set(tasks.map((t) => t.task_id));
  return tasks.filter((t) => t.depends_on.every((d) => !live.has(d))).map((t) => t.task_id);
}

export function transitiveDependents(tasks: readonly GraphNode[], roots: ReadonlySet<string>): Set<string> {
  const result = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (result.has(t.task_id)) continue;
      if (t.depends_on.some((d) => result.has(d))) {
        result.add(t.task_id);
        changed = true;
      }
    }
  }
  return result;
}

export function remainingCost(goal: GoalContract): RemainingCostRecord {
  if (goal.budget && typeof goal.budget.max_amount === "number") {
    return {
      provenance: "DERIVED",
      amount: null,
      currency: goal.budget.currency,
      budget_max: goal.budget.max_amount,
      remaining_unknown: true,
    };
  }
  return { provenance: "UNAVAILABLE", amount: null, remaining_unknown: true };
}

export function uncoveredMandatoryCriteria(
  goal: GoalContract,
  live: readonly Pick<Task, "criterion_refs" | "state">[],
): string[] {
  const covered = new Set<string>();
  for (const t of live) {
    if (t.state === "FAILED") continue;
    for (const c of t.criterion_refs) covered.add(c);
  }
  return goal.acceptance_criteria.filter((c) => c.mandatory && !covered.has(c.criterion_id)).map((c) => c.criterion_id);
}
