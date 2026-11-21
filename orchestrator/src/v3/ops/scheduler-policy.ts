/**
 * Deterministic priority + fairness + aging policy.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJson, nowIso } from "./atomic.js";
import type { OpsDataPaths } from "./paths.js";
import type { QueueEntry, SchedulerPolicy, ServiceClass, WorkflowRecord } from "./types.js";

export const DEFAULT_SCHEDULER_POLICY: SchedulerPolicy = {
  kind: "SchedulerPolicy",
  version: 1,
  max_global_workflows: 4,
  max_per_project: 2,
  aging_ms_per_boost: 30_000,
  max_aging_boost: 50,
  service_class_weight: {
    interactive: 40,
    standard: 20,
    batch: 10,
    background: 0,
  },
  fairness_window: 8,
  updated_at: new Date(0).toISOString(),
};

export class SchedulerPolicyStore {
  private readonly path: string;

  constructor(paths: OpsDataPaths) {
    mkdirSync(paths.policiesDir, { recursive: true });
    this.path = join(paths.policiesDir, "scheduler.json");
  }

  get(): SchedulerPolicy {
    if (!existsSync(this.path)) {
      const p = { ...DEFAULT_SCHEDULER_POLICY, updated_at: nowIso() };
      atomicWriteJson(this.path, p);
      return p;
    }
    return JSON.parse(readFileSync(this.path, "utf-8")) as SchedulerPolicy;
  }

  update(patch: Partial<SchedulerPolicy>): SchedulerPolicy {
    const cur = this.get();
    const next: SchedulerPolicy = {
      ...cur,
      ...patch,
      service_class_weight: {
        ...cur.service_class_weight,
        ...patch.service_class_weight,
      },
      kind: "SchedulerPolicy",
      updated_at: nowIso(),
    };
    atomicWriteJson(this.path, next);
    return next;
  }
}

export function computeEffectivePriority(
  wf: WorkflowRecord,
  policy: SchedulerPolicy,
  now = Date.now(),
): { effective: number; aging_boost: number } {
  const waitMs = Math.max(0, now - Date.parse(wf.submitted_at));
  const aging_boost = Math.min(
    policy.max_aging_boost,
    Math.floor(waitMs / policy.aging_ms_per_boost),
  );
  const classWeight = policy.service_class_weight[wf.service_class] ?? 0;
  let deadlineBoost = 0;
  if (wf.deadline_at) {
    const remaining = Date.parse(wf.deadline_at) - now;
    if (remaining < 0) deadlineBoost = 100;
    else if (remaining < 600_000) deadlineBoost = 40;
  }
  // Higher number = higher priority. Base priority inverted so lower number in record = higher urgency.
  const base = 1000 - wf.priority;
  const effective = base + classWeight + aging_boost + deadlineBoost;
  return { effective, aging_boost };
}

export function buildQueueEntry(
  wf: WorkflowRecord,
  policy: SchedulerPolicy,
  prevAttempts = 0,
  waitReason?: string,
): QueueEntry {
  const { effective, aging_boost } = computeEffectivePriority(wf, policy);
  return {
    kind: "QueueEntry",
    workflow_id: wf.workflow_id,
    project_id: wf.project_id,
    effective_priority: effective,
    base_priority: wf.priority,
    service_class: wf.service_class,
    submitted_at: wf.submitted_at,
    admission_attempts: prevAttempts,
    wait_reason: waitReason,
    aging_boost,
    fairness_key: wf.project_id,
  };
}

/**
 * Order queue: effective priority desc, then submitted_at asc.
 * Fairness: within a window, avoid starving projects by round-robin among top candidates
 * when one project dominates recent admissions.
 */
export function orderQueue(
  entries: QueueEntry[],
  recentProjectAdmits: string[],
  policy: SchedulerPolicy,
): QueueEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.effective_priority !== a.effective_priority) {
      return b.effective_priority - a.effective_priority;
    }
    return a.submitted_at.localeCompare(b.submitted_at);
  });

  if (sorted.length <= 1) return sorted;

  const window = recentProjectAdmits.slice(-policy.fairness_window);
  const counts = new Map<string, number>();
  for (const p of window) counts.set(p, (counts.get(p) ?? 0) + 1);

  // If top project is over-represented vs others present in queue, prefer next distinct project
  const top = sorted[0];
  const topCount = counts.get(top.project_id) ?? 0;
  if (topCount >= Math.ceil(policy.fairness_window / 2)) {
    const alternate = sorted.find((e) => e.project_id !== top.project_id);
    if (alternate) {
      return [alternate, ...sorted.filter((e) => e.workflow_id !== alternate.workflow_id)];
    }
  }
  return sorted;
}

export function serviceClassOf(s: string): ServiceClass {
  if (s === "interactive" || s === "batch" || s === "background" || s === "standard") return s;
  return "standard";
}
