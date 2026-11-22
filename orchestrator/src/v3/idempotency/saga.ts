/**
 * V2-ORCH-03 — Minimal compensating saga for partial effects (UNKNOWN path).
 * Completed steps are compensated in reverse registration order.
 */

import type { StateDb } from "../state-db/store.js";
import {
  reconcileWorkOnBoot,
  type BootReconcileReport,
  type ReconcileDecision,
} from "../mso/boot-reconciler.js";

export interface SagaStep<T = unknown> {
  name: string;
  execute: () => T | Promise<T>;
  compensate: () => void | Promise<void>;
}

interface CompletedStep {
  name: string;
  compensate: () => void | Promise<void>;
}

export interface SagaCompensationReport {
  kind: "SagaCompensationReport";
  compensated: string[];
  clean: boolean;
}

export class Saga {
  private completed: CompletedStep[] = [];

  get completedStepNames(): readonly string[] {
    return this.completed.map((s) => s.name);
  }

  isClean(): boolean {
    return this.completed.length === 0;
  }

  /**
   * Run a step; on success, register its compensate() for reverse unwind.
   */
  async runStep<T>(step: SagaStep<T>): Promise<T> {
    const result = await step.execute();
    this.completed.push({ name: step.name, compensate: step.compensate });
    return result;
  }

  /**
   * Compensate completed steps in reverse order, then clear local state.
   */
  async compensateReverse(): Promise<SagaCompensationReport> {
    const compensated: string[] = [];
    for (const step of [...this.completed].reverse()) {
      await step.compensate();
      compensated.push(step.name);
    }
    this.completed = [];
    return {
      kind: "SagaCompensationReport",
      compensated,
      clean: true,
    };
  }
}

function sagaKey(workId: string, taskId: string): string {
  return `${workId}::${taskId}`;
}

/**
 * Per-task saga registry — boot reconciler / UNKNOWN path looks up by task_id.
 */
export class SagaRegistry {
  private readonly sagas = new Map<string, Saga>();

  register(workId: string, taskId: string, saga: Saga): void {
    this.sagas.set(sagaKey(workId, taskId), saga);
  }

  get(workId: string, taskId: string): Saga | undefined {
    return this.sagas.get(sagaKey(workId, taskId));
  }

  unregister(workId: string, taskId: string): void {
    this.sagas.delete(sagaKey(workId, taskId));
  }
}

export interface UnknownSagaApplyReport {
  kind: "UnknownSagaApplyReport";
  work_id: string;
  tasks: Array<{
    task_id: string;
    decision: ReconcileDecision;
    compensation: SagaCompensationReport | null;
    reason: string;
  }>;
}

/**
 * For tasks that are / became UNKNOWN on a reconcile report, run reverse compensations.
 * Does not auto-retry the task — only unwinds partial effects.
 */
export async function applyUnknownSagaCompensations(
  report: BootReconcileReport,
  registry: SagaRegistry,
): Promise<UnknownSagaApplyReport> {
  const tasks: UnknownSagaApplyReport["tasks"] = [];

  for (const decision of report.decisions) {
    const isUnknown =
      decision.next_state === "UNKNOWN" || decision.previous_state === "UNKNOWN";
    if (!isUnknown) continue;

    const saga = registry.get(report.work_id, decision.task_id);
    if (!saga) {
      tasks.push({
        task_id: decision.task_id,
        decision,
        compensation: null,
        reason: "no_saga_registered",
      });
      continue;
    }

    const compensation = await saga.compensateReverse();
    registry.unregister(report.work_id, decision.task_id);
    tasks.push({
      task_id: decision.task_id,
      decision,
      compensation,
      reason: "compensated_on_unknown",
    });
  }

  return {
    kind: "UnknownSagaApplyReport",
    work_id: report.work_id,
    tasks,
  };
}

export type BootReconcileWithSagaReport = BootReconcileReport & {
  saga_compensations: UnknownSagaApplyReport;
};

/**
 * Boot reconcile then unwind sagas for UNKNOWN tasks (never blind-retry).
 */
export async function reconcileWorkOnBootWithSaga(
  db: StateDb,
  workId: string,
  registry: SagaRegistry,
): Promise<BootReconcileWithSagaReport> {
  const report = reconcileWorkOnBoot(db, workId);
  const saga_compensations = await applyUnknownSagaCompensations(report, registry);
  return { ...report, saga_compensations };
}
