import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OrchestrationTask, TaskGraphSnapshot } from "./types.js";
import type { TaskState } from "../goal-contract/types.js";

export class TaskGraphError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TaskGraphError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class TaskGraphStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(workId: string): string {
    return join(this.rootDir, `${workId}.json`);
  }

  create(workId: string, goalContractId: string, goalContractVersion: number): TaskGraphSnapshot {
    if (existsSync(this.pathFor(workId))) {
      throw new TaskGraphError("ALREADY_EXISTS", workId);
    }
    const snap: TaskGraphSnapshot = {
      kind: "OrchestrationTaskGraph",
      work_id: workId,
      goal_contract_id: goalContractId,
      goal_contract_version: goalContractVersion,
      tasks: [],
      updated_at: nowIso(),
    };
    this.save(snap);
    return snap;
  }

  load(workId: string): TaskGraphSnapshot {
    const path = this.pathFor(workId);
    if (!existsSync(path)) throw new TaskGraphError("NOT_FOUND", workId);
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as TaskGraphSnapshot;
    if (parsed.kind !== "OrchestrationTaskGraph") {
      throw new TaskGraphError("INVALID", path);
    }
    return parsed;
  }

  addTask(
    workId: string,
    task: Omit<OrchestrationTask, "work_id" | "created_at" | "updated_at" | "evidence_ids" | "state"> & {
      state?: TaskState;
      evidence_ids?: string[];
    },
  ): TaskGraphSnapshot {
    const snap = this.load(workId);
    if (snap.tasks.some((t) => t.task_id === task.task_id)) {
      throw new TaskGraphError("DUPLICATE_TASK", task.task_id);
    }
    const ts = nowIso();
    const full: OrchestrationTask = {
      ...task,
      work_id: workId,
      state: task.state ?? "PENDING",
      evidence_ids: task.evidence_ids ?? [],
      depends_on: task.depends_on ?? [],
      created_at: ts,
      updated_at: ts,
    };
    snap.tasks.push(full);
    snap.updated_at = ts;
    this.save(snap);
    return snap;
  }

  /**
   * Records PLAN_APPROVED for a planner task — required before domain workers start.
   */
  approvePlan(workId: string, plannerTaskId: string, planVersion: number): TaskGraphSnapshot {
    const snap = this.load(workId);
    const task = snap.tasks.find((t) => t.task_id === plannerTaskId);
    if (!task) throw new TaskGraphError("TASK_NOT_FOUND", plannerTaskId);
    task.plan_version = planVersion;
    task.plan_approved = true;
    task.state = "TRUE_PASS";
    task.updated_at = nowIso();
    snap.updated_at = task.updated_at;
    this.save(snap);
    return snap;
  }

  setTaskState(workId: string, taskId: string, state: TaskState): TaskGraphSnapshot {
    const snap = this.load(workId);
    const task = snap.tasks.find((t) => t.task_id === taskId);
    if (!task) throw new TaskGraphError("TASK_NOT_FOUND", taskId);
    task.state = state;
    task.updated_at = nowIso();
    snap.updated_at = task.updated_at;
    this.save(snap);
    return snap;
  }

  linkEngineRun(
    workId: string,
    taskId: string,
    ids: { feature_id?: string; ir_id?: string; run_id?: string },
  ): TaskGraphSnapshot {
    const snap = this.load(workId);
    const task = snap.tasks.find((t) => t.task_id === taskId);
    if (!task) throw new TaskGraphError("TASK_NOT_FOUND", taskId);
    Object.assign(task, ids);
    task.updated_at = nowIso();
    snap.updated_at = task.updated_at;
    this.save(snap);
    return snap;
  }

  setTaskOwner(workId: string, taskId: string, ownerAgentId: string): TaskGraphSnapshot {
    const snap = this.load(workId);
    const task = snap.tasks.find((t) => t.task_id === taskId);
    if (!task) throw new TaskGraphError("TASK_NOT_FOUND", taskId);
    task.owner_agent_id = ownerAgentId;
    task.updated_at = nowIso();
    snap.updated_at = task.updated_at;
    this.save(snap);
    return snap;
  }

  private save(snap: TaskGraphSnapshot): void {
    atomicWrite(this.pathFor(snap.work_id), JSON.stringify(snap, null, 2));
  }
}
