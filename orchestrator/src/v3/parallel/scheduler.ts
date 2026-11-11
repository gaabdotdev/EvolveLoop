/**
 * Controlled parallelism — select ready tasks up to max concurrent IN_PROGRESS.
 * Deterministic; no LLM. Does not start external harnesses.
 */

import { TaskGraphStore } from "../task-graph/store.js";
import { canStartTask, type OrchestrationTask } from "../task-graph/types.js";
import type { V3DataPaths } from "../paths.js";

export interface ParallelPolicy {
  max_in_progress: number;
  max_per_domain?: number;
}

export interface ParallelScheduleResult {
  kind: "ParallelScheduleResult";
  work_id: string;
  policy: ParallelPolicy;
  already_in_progress: string[];
  newly_started: string[];
  ready_but_deferred: string[];
  limitations: string[];
}

const DEFAULT_POLICY: ParallelPolicy = { max_in_progress: 2 };

export function scheduleReadyTasks(
  paths: V3DataPaths,
  workId: string,
  policy: Partial<ParallelPolicy> = {},
): ParallelScheduleResult {
  const merged: ParallelPolicy = { ...DEFAULT_POLICY, ...policy };
  const store = new TaskGraphStore(paths.taskGraphsDir);
  const graph = store.load(workId);
  const byId = new Map(graph.tasks.map((t) => [t.task_id, t]));

  const inProgress = graph.tasks.filter((t) => t.state === "IN_PROGRESS");
  const already_in_progress = inProgress.map((t) => t.task_id);
  const newly_started: string[] = [];
  const ready_but_deferred: string[] = [];

  const ready = graph.tasks
    .filter((t) => canStartTask(t, byId))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const domainCounts = new Map<string, number>();
  for (const t of inProgress) {
    if (t.domain) domainCounts.set(t.domain, (domainCounts.get(t.domain) ?? 0) + 1);
  }

  let slots = Math.max(0, merged.max_in_progress - inProgress.length);

  for (const task of ready) {
    if (slots <= 0) {
      ready_but_deferred.push(task.task_id);
      continue;
    }
    if (task.domain && merged.max_per_domain != null) {
      const used = domainCounts.get(task.domain) ?? 0;
      if (used >= merged.max_per_domain) {
        ready_but_deferred.push(task.task_id);
        continue;
      }
    }
    store.setTaskState(workId, task.task_id, "IN_PROGRESS");
    newly_started.push(task.task_id);
    slots -= 1;
    if (task.domain) {
      domainCounts.set(task.domain, (domainCounts.get(task.domain) ?? 0) + 1);
    }
  }

  return {
    kind: "ParallelScheduleResult",
    work_id: workId,
    policy: merged,
    already_in_progress,
    newly_started,
    ready_but_deferred,
    limitations: [
      "Starts TaskGraph state only — does not invoke adapters/harnesses",
      "Ordering is deterministic by created_at",
      "Not a distributed job queue",
    ],
  };
}

export function listReadyTasks(paths: V3DataPaths, workId: string): OrchestrationTask[] {
  const graph = new TaskGraphStore(paths.taskGraphsDir).load(workId);
  const byId = new Map(graph.tasks.map((t) => [t.task_id, t]));
  return graph.tasks.filter((t) => canStartTask(t, byId));
}
