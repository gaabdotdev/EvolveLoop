/**
 * Workflow dependency coordinator — cycle detection + cross-project artifact rules.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "./atomic.js";
import type { OpsDataPaths } from "./paths.js";
import type {
  DependencyState,
  DependencyType,
  WorkflowDependency,
  WorkflowRecord,
} from "./types.js";
import type { WorkflowRegistry } from "./workflow-registry.js";
import type { ProjectRegistry } from "./project-registry.js";

export class DependencyCoordinator {
  constructor(private readonly paths: OpsDataPaths) {
    mkdirSync(paths.dependenciesDir, { recursive: true });
  }

  private pathFor(id: string): string {
    return join(this.paths.dependenciesDir, `${id}.json`);
  }

  list(): WorkflowDependency[] {
    return readdirSync(this.paths.dependenciesDir)
      .filter((f) => f.endsWith(".json"))
      .map(
        (f) =>
          JSON.parse(readFileSync(join(this.paths.dependenciesDir, f), "utf-8")) as WorkflowDependency,
      );
  }

  get(id: string): WorkflowDependency | undefined {
    const p = this.pathFor(id);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf-8")) as WorkflowDependency;
  }

  add(input: {
    predecessor_id: string;
    successor_id: string;
    type?: DependencyType;
    release_condition?: string;
    failure_policy?: WorkflowDependency["failure_policy"];
    artifact_ref?: string;
    workflows: WorkflowRegistry;
    projects: ProjectRegistry;
  }): WorkflowDependency {
    const pred = input.workflows.get(input.predecessor_id);
    const succ = input.workflows.get(input.successor_id);
    if (!pred) throw new Error(`DEPENDENCY_PRED_MISSING:${input.predecessor_id}`);
    if (!succ) throw new Error(`DEPENDENCY_SUCC_MISSING:${input.successor_id}`);
    if (input.predecessor_id === input.successor_id) {
      throw new Error("DEPENDENCY_SELF");
    }

    const cross = pred.project_id !== succ.project_id;
    if (cross) {
      const succProj = input.projects.get(succ.project_id);
      if (!succProj?.policy.allow_cross_project_artifacts) {
        throw new Error(`CROSS_PROJECT_DEP_DENIED:${succ.project_id}`);
      }
      if (!input.artifact_ref) {
        throw new Error("CROSS_PROJECT_DEP_REQUIRES_ARTIFACT_REF");
      }
    }

    // Provisional edge for cycle check
    const provisional: WorkflowDependency = {
      kind: "WorkflowDependency",
      dependency_id: `dep-${randomUUID()}`,
      predecessor_id: input.predecessor_id,
      successor_id: input.successor_id,
      type: input.type ?? "finish_to_start",
      release_condition: input.release_condition ?? "predecessor_SUCCEEDED",
      state: "PENDING",
      failure_policy: input.failure_policy ?? "block_successor",
      cross_project: cross,
      artifact_ref: input.artifact_ref,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    const edges = [...this.list(), provisional];
    if (this.hasCycle(edges)) {
      throw new Error("DEPENDENCY_CYCLE_DETECTED");
    }

    atomicWriteJson(this.pathFor(provisional.dependency_id), provisional);
    const succUpdated = input.workflows.get(input.successor_id)!;
    input.workflows.transition(succUpdated.workflow_id, succUpdated.state, "dependency", {
      patch: {
        dependency_ids: [...new Set([...succUpdated.dependency_ids, provisional.dependency_id])],
      },
    });
    return provisional;
  }

  hasCycle(edges?: WorkflowDependency[]): boolean {
    const deps = edges ?? this.list();
    const adj = new Map<string, string[]>();
    for (const d of deps) {
      if (d.state === "CANCELLED") continue;
      const list = adj.get(d.predecessor_id) ?? [];
      list.push(d.successor_id);
      adj.set(d.predecessor_id, list);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const dfs = (n: string): boolean => {
      if (visiting.has(n)) return true;
      if (visited.has(n)) return false;
      visiting.add(n);
      for (const m of adj.get(n) ?? []) {
        if (dfs(m)) return true;
      }
      visiting.delete(n);
      visited.add(n);
      return false;
    };
    for (const n of adj.keys()) {
      if (dfs(n)) return true;
    }
    return false;
  }

  refresh(workflows: WorkflowRegistry): WorkflowDependency[] {
    const out: WorkflowDependency[] = [];
    for (const dep of this.list()) {
      if (dep.state !== "PENDING") {
        out.push(dep);
        continue;
      }
      const pred = workflows.get(dep.predecessor_id);
      let nextState: DependencyState = dep.state;
      if (!pred) {
        nextState = "FAILED";
      } else if (pred.state === "SUCCEEDED") {
        nextState = "SATISFIED";
      } else if (pred.state === "FAILED" || pred.state === "CANCELLED") {
        nextState = "FAILED";
      }
      if (nextState !== dep.state) {
        const updated: WorkflowDependency = {
          ...dep,
          state: nextState,
          updated_at: nowIso(),
        };
        atomicWriteJson(this.pathFor(dep.dependency_id), updated);
        out.push(updated);
      } else {
        out.push(dep);
      }
    }
    return out;
  }

  unsatisfiedFor(workflow: WorkflowRecord): WorkflowDependency[] {
    return this.list().filter(
      (d) =>
        d.successor_id === workflow.workflow_id &&
        d.state !== "SATISFIED" &&
        d.state !== "CANCELLED",
    );
  }

  forWorkflow(workflowId: string): WorkflowDependency[] {
    return this.list().filter(
      (d) => d.predecessor_id === workflowId || d.successor_id === workflowId,
    );
  }
}
