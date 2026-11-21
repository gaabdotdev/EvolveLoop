/**
 * Global Operations Service — admission/control-plane for multi-workflow ops.
 *
 * Authority boundary:
 * - THIS service: project/workflow registries, queue, admission, resources, deps, team plans
 * - Coordinator/Core V3.5: execute admitted work (tick, harness, sandbox, approvals)
 * - Does NOT spawn harnesses or bypass Approval Broker / sandbox
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "./atomic.js";
import { resolveOpsDataPaths, type OpsDataPaths } from "./paths.js";
import { ProjectRegistry } from "./project-registry.js";
import { WorkflowRegistry } from "./workflow-registry.js";
import { DependencyCoordinator } from "./dependency-coordinator.js";
import { GlobalResourceManager } from "./resource-manager.js";
import {
  SchedulerPolicyStore,
  buildQueueEntry,
  orderQueue,
} from "./scheduler-policy.js";
import { ProjectIsolationGuard } from "./isolation.js";
import { TeamComposer } from "./team-composer.js";
import {
  QualityGateRunner,
  discoverQualityGates,
  applyDiscoveredGates,
} from "./quality-gates.js";
import { reconcileGlobalState, detectLiveCoordinator } from "./recovery.js";
import { resolveV3DataPaths } from "../paths.js";
import { GoalContractStore } from "../goal-contract/store.js";
import { CoordinatorService } from "../coordinator/service.js";
import type {
  HostCapacity,
  QueueEntry,
  SchedulerDecision,
  ServiceClass,
  WorkflowRecord,
} from "./types.js";

export interface GlobalOpsOptions {
  opsDir: string;
  capacity?: Partial<HostCapacity>;
  /** When true, admission creates goal+work via Core in project data_dir */
  bindExecutionPlane?: boolean;
}

export class GlobalOpsService {
  readonly paths: OpsDataPaths;
  readonly projects: ProjectRegistry;
  readonly workflows: WorkflowRegistry;
  readonly dependencies: DependencyCoordinator;
  readonly resources: GlobalResourceManager;
  readonly policyStore: SchedulerPolicyStore;
  readonly isolation: ProjectIsolationGuard;
  readonly teams: TeamComposer;
  readonly quality: QualityGateRunner;
  readonly bindExecutionPlane: boolean;

  private recentAdmits: string[] = [];
  private readonly queuePath: string;
  private readonly decisionsDir: string;

  constructor(opts: GlobalOpsOptions) {
    this.paths = resolveOpsDataPaths(opts.opsDir);
    this.projects = new ProjectRegistry(this.paths);
    this.workflows = new WorkflowRegistry(this.paths);
    this.dependencies = new DependencyCoordinator(this.paths);
    this.resources = new GlobalResourceManager(this.paths, opts.capacity);
    this.policyStore = new SchedulerPolicyStore(this.paths);
    this.isolation = new ProjectIsolationGuard(this.paths);
    this.teams = new TeamComposer(this.paths);
    this.quality = new QualityGateRunner(this.paths);
    this.bindExecutionPlane = opts.bindExecutionPlane !== false;
    this.queuePath = join(this.paths.queueDir, "queue.json");
    this.decisionsDir = this.paths.decisionsDir;
    mkdirSync(this.decisionsDir, { recursive: true });
  }

  private recordDecision(d: Omit<SchedulerDecision, "kind" | "decision_id" | "at"> & { at?: string }): SchedulerDecision {
    const rec: SchedulerDecision = {
      kind: "SchedulerDecision",
      decision_id: `sd-${randomUUID()}`,
      at: d.at ?? nowIso(),
      workflow_id: d.workflow_id,
      action: d.action,
      reason: d.reason,
      effective_priority: d.effective_priority,
      details: d.details,
    };
    atomicWriteJson(join(this.decisionsDir, `${rec.decision_id}.json`), rec);
    return rec;
  }

  loadQueue(): QueueEntry[] {
    if (!existsSync(this.queuePath)) return [];
    return JSON.parse(readFileSync(this.queuePath, "utf-8")) as QueueEntry[];
  }

  private saveQueue(entries: QueueEntry[]): void {
    atomicWriteJson(this.queuePath, entries);
  }

  rebuildQueue(): QueueEntry[] {
    const policy = this.policyStore.get();
    const waitingStates = new Set([
      "QUEUED",
      "WAITING_DEPENDENCY",
      "WAITING_RESOURCE",
      "VALIDATING",
      "SUBMITTED",
    ]);
    const entries = this.workflows
      .list()
      .filter((w) => waitingStates.has(w.state))
      .map((w) => buildQueueEntry(w, policy, 0, w.wait_reason));
    const ordered = orderQueue(entries, this.recentAdmits, policy);
    this.saveQueue(ordered);
    return ordered;
  }

  submitWorkflow(input: {
    project_id: string;
    objective: string;
    priority?: number;
    service_class?: ServiceClass;
    deadline_at?: string;
    max_agents?: number;
  }): WorkflowRecord {
    const project = this.projects.get(input.project_id);
    if (!project) throw new Error(`PROJECT_NOT_FOUND:${input.project_id}`);
    if (project.availability === "ARCHIVED") {
      throw new Error(`PROJECT_ARCHIVED:${input.project_id}`);
    }
    if (project.availability === "PAUSED_ADMISSION") {
      throw new Error(`PROJECT_ADMISSION_PAUSED:${input.project_id}`);
    }

    const wf = this.workflows.submit({
      project_id: input.project_id,
      objective: input.objective,
      priority: input.priority,
      service_class: input.service_class,
      deadline_at: input.deadline_at,
      budget: { max_agents: input.max_agents, usage_provenance: "unavailable" },
    });
    this.workflows.transition(wf.workflow_id, "VALIDATING", "scheduler", {
      reason: "admission_validation",
    });
    this.rebuildQueue();
    this.recordDecision({
      workflow_id: wf.workflow_id,
      action: "wait",
      reason: "submitted_to_validation",
    });
    return this.workflows.get(wf.workflow_id)!;
  }

  /**
   * Single admission evaluation for one workflow.
   * Fail-closed: missing required capability → BLOCKED or WAITING_* with reason.
   */
  evaluateAdmission(workflowId: string): {
    decision: SchedulerDecision;
    workflow: WorkflowRecord;
  } {
    const policy = this.policyStore.get();
    let wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`WORKFLOW_NOT_FOUND:${workflowId}`);

    const project = this.projects.get(wf.project_id);
    if (!project || project.availability === "ARCHIVED") {
      wf = this.workflows.transition(workflowId, "BLOCKED", "scheduler", {
        reason: "project_unavailable",
      });
      return {
        decision: this.recordDecision({
          workflow_id: workflowId,
          action: "block",
          reason: "project_unavailable",
        }),
        workflow: wf,
      };
    }
    if (project.availability === "PAUSED_ADMISSION" || project.availability === "UNHEALTHY") {
      wf = this.workflows.transition(workflowId, "WAITING_RESOURCE", "scheduler", {
        reason: `project_${project.availability.toLowerCase()}`,
      });
      return {
        decision: this.recordDecision({
          workflow_id: workflowId,
          action: "wait",
          reason: `project_${project.availability}`,
        }),
        workflow: wf,
      };
    }

    if (!wf.objective || wf.objective.trim().length < 3) {
      wf = this.workflows.transition(workflowId, "BLOCKED", "scheduler", {
        reason: "invalid_goal_contract_objective",
      });
      return {
        decision: this.recordDecision({
          workflow_id: workflowId,
          action: "block",
          reason: "invalid_goal",
        }),
        workflow: wf,
      };
    }

    this.dependencies.refresh(this.workflows);
    const unsat = this.dependencies.unsatisfiedFor(wf);
    if (unsat.length > 0) {
      const failed = unsat.filter((d) => d.state === "FAILED");
      if (failed.length > 0) {
        const pol = failed[0].failure_policy;
        if (pol === "cancel_successor") {
          wf = this.workflows.transition(workflowId, "CANCELLED", "scheduler", {
            reason: `dependency_failed:${failed[0].dependency_id}`,
          });
          return {
            decision: this.recordDecision({
              workflow_id: workflowId,
              action: "cancel",
              reason: "dependency_failed",
            }),
            workflow: wf,
          };
        }
        wf = this.workflows.transition(workflowId, "BLOCKED", "scheduler", {
          reason: `dependency_failed:${failed[0].dependency_id}`,
        });
        return {
          decision: this.recordDecision({
            workflow_id: workflowId,
            action: "block",
            reason: "dependency_failed",
          }),
          workflow: wf,
        };
      }
      wf = this.workflows.transition(workflowId, "WAITING_DEPENDENCY", "scheduler", {
        reason: `waiting_deps:${unsat.map((d) => d.dependency_id).join(",")}`,
      });
      return {
        decision: this.recordDecision({
          workflow_id: workflowId,
          action: "wait",
          reason: "waiting_dependency",
        }),
        workflow: wf,
      };
    }

    // Concurrency limits
    if (this.workflows.activeCount() >= policy.max_global_workflows) {
      wf = this.workflows.transition(workflowId, "WAITING_RESOURCE", "scheduler", {
        reason: "global_workflow_limit",
      });
      return {
        decision: this.recordDecision({
          workflow_id: workflowId,
          action: "wait",
          reason: "global_workflow_limit",
        }),
        workflow: wf,
      };
    }
    const perProject = Math.min(policy.max_per_project, project.policy.max_concurrent_workflows);
    if (this.workflows.activeCount(wf.project_id) >= perProject) {
      wf = this.workflows.transition(workflowId, "WAITING_RESOURCE", "scheduler", {
        reason: "project_workflow_limit",
      });
      return {
        decision: this.recordDecision({
          workflow_id: workflowId,
          action: "wait",
          reason: "project_workflow_limit",
        }),
        workflow: wf,
      };
    }

    // Resource reservation (workflow slot)
    try {
      this.resources.expireLeases();
      const reservation = this.resources.reserve({
        resource_type: "workflows",
        quantity: 1,
        unit: "count",
        owner: wf.workflow_id,
        scope: "workflow",
        scope_id: wf.workflow_id,
        lease_ms: 3_600_000,
        provenance: "policy_limit",
      });

      // Team composition (does not elevate Core subagent limits)
      const plan = this.teams.compose({
        workflow: wf,
        project,
        available_agents_slots: Math.min(
          this.resources.available("agents"),
          project.policy.max_agents,
          wf.budget.max_agents ?? 2,
        ),
        harness_available: project.policy.allowed_harnesses.length > 0,
        risk: project.policy.require_approval_for_integration ? "high" : "medium",
        independent_task_count: Math.max(1, Math.ceil(wf.objective.length / 80)),
        requires_review: project.policy.require_approval_for_integration,
        measurement: { provenance: "unavailable" },
      });

      let work_id: string | undefined;
      let goal_contract_id = wf.goal_contract_id;
      let data_dir = project.data_dir;

      if (this.bindExecutionPlane) {
        const v3paths = resolveV3DataPaths(project.data_dir);
        const goals = new GoalContractStore(v3paths.goalContractsDir);
        goal_contract_id = goal_contract_id ?? `gc-${wf.workflow_id}`;
        let goalVersion = 1;
        try {
          goalVersion = goals.loadLatest(goal_contract_id).version;
        } catch {
          goals.create({
            goal_contract_id,
            objective: wf.objective,
            scope: [`project:${project.project_id}`],
            out_of_scope: ["cross-project filesystem without artifact contract"],
            criteria: [
              {
                id: "c-ops",
                description: "Workflow completes under Global Ops admission controls",
                mandatory: true,
                verification: [{ id: "v1", kind: "other", description: "ops state SUCCEEDED" }],
                evidence_required: ["ops-decision"],
              },
            ],
          });
          goalVersion = 1;
        }
        work_id = `work-${wf.workflow_id}`;
        const coord = new CoordinatorService(v3paths);
        const existing = coord.loadState().works.find((w) => w.work_id === work_id);
        if (!existing) {
          coord.registerWork(work_id, goal_contract_id, goalVersion);
        }
      }

      wf = this.workflows.transition(workflowId, "ADMITTED", "scheduler", {
        reason: "admission_granted",
        patch: {
          reservation_ids: [...wf.reservation_ids, reservation.reservation_id],
          team_plan_id: plan.plan_id,
          goal_contract_id,
          runtime: {
            data_dir,
            work_id,
            coordinator_associated: Boolean(work_id),
          },
        },
      });

      this.recentAdmits.push(project.project_id);
      if (this.recentAdmits.length > 100) this.recentAdmits = this.recentAdmits.slice(-50);

      const decision = this.recordDecision({
        workflow_id: workflowId,
        action: "admit",
        reason: "admission_granted",
        effective_priority: buildQueueEntry(wf, policy).effective_priority,
        details: {
          reservation_id: reservation.reservation_id,
          team_plan_id: plan.plan_id,
          work_id,
        },
      });
      this.rebuildQueue();
      return { decision, workflow: wf };
    } catch (err) {
      const msg = String(err);
      if (msg.includes("RESOURCE_INSUFFICIENT")) {
        wf = this.workflows.transition(workflowId, "WAITING_RESOURCE", "scheduler", {
          reason: msg,
        });
        return {
          decision: this.recordDecision({
            workflow_id: workflowId,
            action: "wait",
            reason: msg,
          }),
          workflow: wf,
        };
      }
      wf = this.workflows.transition(workflowId, "BLOCKED", "scheduler", {
        reason: msg,
      });
      return {
        decision: this.recordDecision({
          workflow_id: workflowId,
          action: "block",
          reason: msg,
        }),
        workflow: wf,
      };
    }
  }

  /** Scheduler tick: rebuild queue, admit until capacity. */
  tick(maxAdmits = 1): {
    queue: QueueEntry[];
    admitted: SchedulerDecision[];
    skipped: SchedulerDecision[];
  } {
    const policy = this.policyStore.get();
    const queue = this.rebuildQueue();
    const ordered = orderQueue(queue, this.recentAdmits, policy);
    const admitted: SchedulerDecision[] = [];
    const skipped: SchedulerDecision[] = [];
    let grants = 0;

    for (const entry of ordered) {
      let wf = this.workflows.get(entry.workflow_id);
      if (!wf) continue;
      if (
        wf.state === "PAUSED" ||
        wf.state === "CANCELLED" ||
        wf.state === "SUCCEEDED" ||
        wf.state === "FAILED" ||
        wf.state === "ADMITTED" ||
        wf.state === "RUNNING"
      ) {
        continue;
      }
      if (wf.state === "SUBMITTED") {
        wf = this.workflows.transition(wf.workflow_id, "VALIDATING", "scheduler");
      }
      if (wf.state === "VALIDATING") {
        wf = this.workflows.transition(wf.workflow_id, "QUEUED", "scheduler", {
          reason: "validation_ok_queued",
        });
      }

      const canGrant =
        grants < maxAdmits && this.workflows.activeCount() < policy.max_global_workflows;

      if (canGrant) {
        const result = this.evaluateAdmission(wf.workflow_id);
        if (result.decision.action === "admit") {
          admitted.push(result.decision);
          grants++;
        } else {
          skipped.push(result.decision);
        }
      } else {
        // Classify wait without granting new capacity
        this.dependencies.refresh(this.workflows);
        const unsat = this.dependencies.unsatisfiedFor(wf);
        if (unsat.length > 0) {
          const next = this.workflows.transition(wf.workflow_id, "WAITING_DEPENDENCY", "scheduler", {
            reason: `waiting_deps:${unsat.map((d) => d.dependency_id).join(",")}`,
          });
          skipped.push(
            this.recordDecision({
              workflow_id: next.workflow_id,
              action: "wait",
              reason: "waiting_dependency",
            }),
          );
        } else {
          const next = this.workflows.transition(wf.workflow_id, "WAITING_RESOURCE", "scheduler", {
            reason: "scheduler_tick_capacity",
          });
          skipped.push(
            this.recordDecision({
              workflow_id: next.workflow_id,
              action: "wait",
              reason: "scheduler_tick_capacity",
            }),
          );
        }
      }
    }
    return { queue: this.rebuildQueue(), admitted, skipped };
  }

  markRunning(workflowId: string): WorkflowRecord {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`WORKFLOW_NOT_FOUND:${workflowId}`);
    return this.workflows.transition(workflowId, "RUNNING", "execution_plane", {
      reason: "execution_plane_started",
    });
  }

  pause(workflowId: string): WorkflowRecord {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`WORKFLOW_NOT_FOUND:${workflowId}`);
    if (wf.state === "RUNNING") {
      this.workflows.transition(workflowId, "PAUSING", "operator");
    }
    const next = this.workflows.transition(workflowId, "PAUSED", "operator", {
      reason: "operator_pause",
    });
    this.recordDecision({ workflow_id: workflowId, action: "pause", reason: "operator_pause" });
    this.rebuildQueue();
    return next;
  }

  resume(workflowId: string): WorkflowRecord {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`WORKFLOW_NOT_FOUND:${workflowId}`);
    const next = this.workflows.transition(workflowId, "QUEUED", "operator", {
      reason: "operator_resume",
    });
    this.recordDecision({ workflow_id: workflowId, action: "resume", reason: "operator_resume" });
    this.rebuildQueue();
    return next;
  }

  cancel(workflowId: string): WorkflowRecord {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`WORKFLOW_NOT_FOUND:${workflowId}`);
    for (const rid of wf.reservation_ids) {
      try {
        this.resources.release(rid);
      } catch {
        /* already released */
      }
    }
    const next = this.workflows.transition(workflowId, "CANCELLED", "operator", {
      reason: "operator_cancel",
    });
    this.recordDecision({ workflow_id: workflowId, action: "cancel", reason: "operator_cancel" });
    this.rebuildQueue();
    return next;
  }

  complete(workflowId: string, ok: boolean): WorkflowRecord {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`WORKFLOW_NOT_FOUND:${workflowId}`);
    for (const rid of wf.reservation_ids) {
      try {
        this.resources.release(rid);
      } catch {
        /* ignore */
      }
    }
    return this.workflows.transition(workflowId, ok ? "SUCCEEDED" : "FAILED", "execution_plane");
  }

  recover(): ReturnType<typeof reconcileGlobalState> {
    const live_work_ids = new Set<string>();
    const active_owners = new Set<string>();
    for (const p of this.projects.list()) {
      if (detectLiveCoordinator(p.data_dir)) {
        // Socket existence ≠ specific work; leave live_work_ids empty → demote RUNNING
        active_owners.add(`coordinator:${p.project_id}`);
      }
    }
    const report = reconcileGlobalState({
      paths: this.paths,
      workflows: this.workflows,
      resources: this.resources,
      dependencies: this.dependencies,
      presence: { active_owners, live_work_ids },
    });
    this.rebuildQueue();
    return report;
  }

  status(): Record<string, unknown> {
    const policy = this.policyStore.get();
    const wfs = this.workflows.list();
    const byState: Record<string, number> = {};
    for (const w of wfs) byState[w.state] = (byState[w.state] ?? 0) + 1;
    return {
      version: "3.6.0",
      ops_dir: this.paths.root,
      policy,
      projects: this.projects.list().length,
      workflows_by_state: byState,
      queue_depth: this.loadQueue().length,
      resources: this.resources.status(),
      active_workflows: this.workflows.activeCount(),
    };
  }

  overview(): Record<string, unknown> {
    return {
      projects: this.projects.list().map((p) => ({
        project_id: p.project_id,
        name: p.name,
        availability: p.availability,
        path: p.canonical_path,
        active_workflows: this.workflows.activeCount(p.project_id),
      })),
      queue: this.rebuildQueue(),
      blockers: this.workflows
        .list()
        .filter((w) => w.state === "BLOCKED" || w.state === "FAILED")
        .map((w) => ({
          workflow_id: w.workflow_id,
          state: w.state,
          reason: w.block_reason ?? w.wait_reason,
        })),
      resources: this.resources.status(),
    };
  }

  discoverAndOptionallyApplyGates(projectId: string, confirmLow = false): unknown {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`PROJECT_NOT_FOUND:${projectId}`);
    const discovered = discoverQualityGates(project.canonical_path);
    if (discovered.length === 0) {
      return { discovered: [], note: "no_gates_discovered_do_not_invent" };
    }
    const policy = applyDiscoveredGates(project.policy, discovered, confirmLow);
    this.projects.update(projectId, { policy });
    return { discovered, applied: policy.quality_gates };
  }
}

/** Persist a pointer file for ops dir discovery by TUI/CLI */
export function writeOpsPointer(opsDir: string, pointerPath: string): void {
  mkdirSync(join(pointerPath, ".."), { recursive: true });
  writeFileSync(pointerPath, JSON.stringify({ ops_dir: opsDir, at: nowIso() }, null, 2));
}
