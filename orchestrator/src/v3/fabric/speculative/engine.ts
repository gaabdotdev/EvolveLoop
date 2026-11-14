/**
 * Speculative / competitive execution — opt-in, budget-limited, no auto-integrate.
 */

import { randomUUID } from "node:crypto";

export interface SpeculativePolicy {
  enabled: boolean;
  max_alternatives: number;
  max_budget_units: number;
  require_immutable_inputs: boolean;
  allow_external_side_effects: boolean;
}

export interface SpeculativeAttempt {
  attempt_id: string;
  task_id: string;
  alternative_index: number;
  workspace_id: string;
  status: "running" | "completed" | "cancelled" | "failed";
  score?: number;
  budget_used: number;
}

export interface SpeculativeRun {
  run_id: string;
  task_id: string;
  attempts: SpeculativeAttempt[];
  winner_attempt_id?: string;
  cancelled_attempt_ids: string[];
  integrated: false; // never auto-integrate
}

const DEFAULT_POLICY: SpeculativePolicy = {
  enabled: false,
  max_alternatives: 2,
  max_budget_units: 100,
  require_immutable_inputs: true,
  allow_external_side_effects: false,
};

export class SpeculativeEngine {
  constructor(private readonly policy: SpeculativePolicy = DEFAULT_POLICY) {}

  start(input: {
    task_id: string;
    alternatives: number;
    inputs_immutable: boolean;
    has_external_side_effects: boolean;
    budget_units: number;
  }): SpeculativeRun | { blocked: true; reason: string } {
    if (!this.policy.enabled) return { blocked: true, reason: "policy_disabled" };
    if (this.policy.require_immutable_inputs && !input.inputs_immutable) {
      return { blocked: true, reason: "inputs_mutable" };
    }
    if (!this.policy.allow_external_side_effects && input.has_external_side_effects) {
      return { blocked: true, reason: "side_effects" };
    }
    if (input.alternatives > this.policy.max_alternatives) {
      return { blocked: true, reason: "too_many_alternatives" };
    }
    if (input.budget_units > this.policy.max_budget_units) {
      return { blocked: true, reason: "budget" };
    }
    const run_id = `spec_${randomUUID()}`;
    const attempts: SpeculativeAttempt[] = [];
    for (let i = 0; i < input.alternatives; i++) {
      attempts.push({
        attempt_id: `${run_id}_a${i}`,
        task_id: input.task_id,
        alternative_index: i,
        workspace_id: `${run_id}_ws${i}`,
        status: "running",
        budget_used: 0,
      });
    }
    return { run_id, task_id: input.task_id, attempts, cancelled_attempt_ids: [], integrated: false };
  }

  evaluateAndSelect(run: SpeculativeRun, scores: Record<string, number>): SpeculativeRun {
    let best: SpeculativeAttempt | undefined;
    for (const a of run.attempts) {
      a.score = scores[a.attempt_id] ?? Number.NEGATIVE_INFINITY;
      a.status = "completed";
      if (!best || (a.score ?? 0) > (best.score ?? 0)) best = a;
    }
    for (const a of run.attempts) {
      if (best && a.attempt_id !== best.attempt_id) {
        a.status = "cancelled";
        run.cancelled_attempt_ids.push(a.attempt_id);
      }
    }
    run.winner_attempt_id = best?.attempt_id;
    run.integrated = false;
    return run;
  }

  withPolicy(policy: Partial<SpeculativePolicy>): SpeculativeEngine {
    return new SpeculativeEngine({ ...this.policy, ...policy });
  }
}
