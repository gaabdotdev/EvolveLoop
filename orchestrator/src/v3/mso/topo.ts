/**
 * V0-ORCH-04 — topological order + strictly-disjoint path check for TaskGraph.
 */

import { MsoError } from "./errors.js";

export interface TopoTask {
  task_id: string;
  depends_on?: string[];
  /** Path prefixes this task may mutate — required for disjoint parallel mode. */
  touch_paths?: string[];
}

export function topologicalOrder(tasks: TopoTask[]): string[] {
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  for (const t of tasks) {
    for (const dep of t.depends_on ?? []) {
      if (!byId.has(dep)) {
        throw new MsoError("TOPO_MISSING_DEP", `task '${t.task_id}' depends on missing '${dep}'`);
      }
    }
  }

  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const t of tasks) {
    indegree.set(t.task_id, 0);
    children.set(t.task_id, []);
  }
  for (const t of tasks) {
    for (const dep of t.depends_on ?? []) {
      indegree.set(t.task_id, (indegree.get(t.task_id) ?? 0) + 1);
      children.get(dep)!.push(t.task_id);
    }
  }

  const queue = [...tasks.map((t) => t.task_id)]
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));
  const order: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    const next = (children.get(id) ?? []).slice().sort((a, b) => a.localeCompare(b));
    for (const child of next) {
      const d = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, d);
      if (d === 0) queue.push(child);
    }
    queue.sort((a, b) => a.localeCompare(b));
  }

  if (order.length !== tasks.length) {
    throw new MsoError("TOPO_CYCLE", "TaskGraph has a cycle");
  }
  return order;
}

function normalizePrefix(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** True when two path prefixes overlap (one is prefix of the other or equal). */
export function pathsOverlap(a: string, b: string): boolean {
  const x = normalizePrefix(a);
  const y = normalizePrefix(b);
  if (x === y) return true;
  return x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

/**
 * Strictly disjoint: every pair of tasks that could run concurrently
 * (no dependency edge either way in the transitive closure of the ready set)
 * must have non-overlapping touch_paths.
 *
 * For V0 sequential mode this is a no-op validation of presence when provided.
 */
export function assertStrictlyDisjoint(tasks: TopoTask[]): void {
  for (const t of tasks) {
    if (!t.touch_paths || t.touch_paths.length === 0) {
      throw new MsoError(
        "DISJOINT_PATHS_REQUIRED",
        `task '${t.task_id}' missing touch_paths for disjoint mode`,
      );
    }
  }
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i]!;
      const b = tasks[j]!;
      const aDeps = new Set(a.depends_on ?? []);
      const bDeps = new Set(b.depends_on ?? []);
      // If one depends on the other, they never run concurrently — skip.
      if (aDeps.has(b.task_id) || bDeps.has(a.task_id)) continue;
      for (const pa of a.touch_paths ?? []) {
        for (const pb of b.touch_paths ?? []) {
          if (pathsOverlap(pa, pb)) {
            throw new MsoError(
              "DISJOINT_OVERLAP",
              `tasks '${a.task_id}' and '${b.task_id}' overlap paths '${pa}' / '${pb}'`,
            );
          }
        }
      }
    }
  }
}
