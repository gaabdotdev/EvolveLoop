/**
 * Workflow Registry — persistent workflows with validated transitions.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "./atomic.js";
import { assertTransition, isTerminal } from "./workflow-state.js";
import type { OpsDataPaths } from "./paths.js";
import type {
  ServiceClass,
  WorkflowBudget,
  WorkflowRecord,
  WorkflowState,
} from "./types.js";

export class WorkflowRegistry {
  constructor(private readonly paths: OpsDataPaths) {
    mkdirSync(paths.workflowsDir, { recursive: true });
  }

  private pathFor(id: string): string {
    return join(this.paths.workflowsDir, `${id}.json`);
  }

  list(filter?: { project_id?: string; state?: WorkflowState }): WorkflowRecord[] {
    let items = readdirSync(this.paths.workflowsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.paths.workflowsDir, f), "utf-8")) as WorkflowRecord);
    if (filter?.project_id) items = items.filter((w) => w.project_id === filter.project_id);
    if (filter?.state) items = items.filter((w) => w.state === filter.state);
    return items.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  }

  get(workflowId: string): WorkflowRecord | undefined {
    const p = this.pathFor(workflowId);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf-8")) as WorkflowRecord;
  }

  submit(input: {
    project_id: string;
    objective: string;
    priority?: number;
    service_class?: ServiceClass;
    deadline_at?: string;
    budget?: Partial<WorkflowBudget>;
    goal_contract_id?: string;
    dependency_ids?: string[];
  }): WorkflowRecord {
    const ts = nowIso();
    const workflow_id = `wf-${randomUUID()}`;
    const rec: WorkflowRecord = {
      kind: "WorkflowRecord",
      workflow_id,
      project_id: input.project_id,
      objective: input.objective,
      goal_contract_id: input.goal_contract_id,
      priority: input.priority ?? 100,
      service_class: input.service_class ?? "standard",
      deadline_at: input.deadline_at,
      state: "SUBMITTED",
      dependency_ids: input.dependency_ids ?? [],
      budget: {
        max_agents: 2,
        max_duration_ms: 3_600_000,
        ...input.budget,
        usage_provenance: input.budget?.usage_provenance ?? "unavailable",
      },
      reservation_ids: [],
      runtime: { coordinator_associated: false },
      evidence_refs: [],
      submitted_at: ts,
      updated_at: ts,
      history: [
        {
          at: ts,
          from: "SUBMITTED",
          to: "SUBMITTED",
          actor: "system",
          reason: "submitted",
        },
      ],
    };
    atomicWriteJson(this.pathFor(workflow_id), rec);
    return rec;
  }

  transition(
    workflowId: string,
    to: WorkflowState,
    actor: string,
    opts?: { reason?: string; patch?: Partial<WorkflowRecord> },
  ): WorkflowRecord {
    const rec = this.get(workflowId);
    if (!rec) throw new Error(`WORKFLOW_NOT_FOUND:${workflowId}`);
    assertTransition(rec.state, to);
    const ts = nowIso();
    const next: WorkflowRecord = {
      ...rec,
      ...opts?.patch,
      state: to,
      wait_reason:
        to === "WAITING_DEPENDENCY" || to === "WAITING_RESOURCE"
          ? opts?.reason ?? rec.wait_reason
          : to === "QUEUED" || to === "ADMITTED" || to === "RUNNING"
            ? undefined
            : rec.wait_reason,
      block_reason: to === "BLOCKED" ? opts?.reason ?? rec.block_reason : rec.block_reason,
      updated_at: ts,
      admitted_at: to === "ADMITTED" ? ts : rec.admitted_at,
      started_at: to === "RUNNING" ? rec.started_at ?? ts : rec.started_at,
      finished_at: isTerminal(to) ? ts : rec.finished_at,
      history: [
        ...rec.history,
        {
          at: ts,
          from: rec.state,
          to,
          actor,
          reason: opts?.reason,
        },
      ].slice(-100),
    };
    // Preserve nested runtime if patch provided partial
    if (opts?.patch?.runtime) {
      next.runtime = { ...rec.runtime, ...opts.patch.runtime };
    }
    atomicWriteJson(this.pathFor(workflowId), next);
    return next;
  }

  activeCount(projectId?: string): number {
    const active: WorkflowState[] = [
      "ADMITTED",
      "RUNNING",
      "PAUSING",
      "RECOVERING",
    ];
    return this.list(projectId ? { project_id: projectId } : undefined).filter((w) =>
      active.includes(w.state),
    ).length;
  }
}
