/**
 * WorkRepositoryPort implementation — in-memory projection, no chat memory.
 * Durable log is M02. This store is the queryable read model (constitution §4.1).
 */

import type { GoalContract, Task, Work, WorkEvent, WorkRepositoryPort } from "../contracts/index.js";
import { applyEvents, emptyProjection, type ProjectionIssue, type WorkProjection } from "./projector.js";

export interface WorkSnapshot {
  work?: Work;
  goals: GoalContract[];
  tasks: Task[];
  accepted_version?: number;
}

export class InMemoryWorkRepository implements WorkRepositoryPort {
  private readonly byWork = new Map<string, WorkProjection>();
  private readonly goalIndex = new Map<string, Map<number, GoalContract>>();

  async getWork(work_id: string): Promise<Work | undefined> {
    return this.byWork.get(work_id)?.work;
  }

  async getGoalContract(goal_contract_id: string, version: number): Promise<GoalContract | undefined> {
    return this.goalIndex.get(goal_contract_id)?.get(version);
  }

  async listTasks(work_id: string): Promise<Task[]> {
    const proj = this.byWork.get(work_id);
    return proj ? [...proj.tasks.values()] : [];
  }

  projection(work_id: string): WorkProjection {
    let proj = this.byWork.get(work_id);
    if (!proj) {
      proj = emptyProjection();
      this.byWork.set(work_id, proj);
    }
    return proj;
  }

  apply(work_id: string, events: readonly WorkEvent[]): ProjectionIssue[] {
    const proj = this.projection(work_id);
    const issues = applyEvents(proj, events);
    this.indexGoals(proj);
    return issues;
  }

  snapshot(work_id: string): WorkSnapshot {
    const proj = this.byWork.get(work_id) ?? emptyProjection();
    return {
      work: proj.work,
      goals: [...proj.goals.values()].sort((a, b) => a.version - b.version),
      tasks: [...proj.tasks.values()],
      accepted_version: proj.accepted_version,
    };
  }

  restore(work_id: string, snap: WorkSnapshot): void {
    const proj = emptyProjection();
    proj.work = snap.work;
    for (const g of snap.goals) proj.goals.set(g.version, g);
    for (const t of snap.tasks) proj.tasks.set(t.task_id, t);
    proj.accepted_version = snap.accepted_version;
    this.byWork.set(work_id, proj);
    this.indexGoals(proj);
  }

  private indexGoals(proj: WorkProjection): void {
    for (const g of proj.goals.values()) {
      let versions = this.goalIndex.get(g.goal_contract_id);
      if (!versions) {
        versions = new Map();
        this.goalIndex.set(g.goal_contract_id, versions);
      }
      versions.set(g.version, g);
    }
  }
}
