/**
 * Autonomous Recovery Hierarchy (Meta 62 / Briefing V3-F5).
 * Ordered: retry → replan → rollback_checkpoint → quarantine → human_gate.
 * Least intervention first; human_gate is terminal.
 */

import { RecoveryExhaustedError } from "./errors.js";
import {
  RECOVERY_HIERARCHY_STEPS,
  type RecoveryStep,
} from "./types.js";

export interface RecoveryState {
  current_step: RecoveryStep;
  step_index: number;
  attempts_at_step: number;
  exhausted: boolean;
}

export interface RecoveryAdvanceResult {
  previous: RecoveryStep;
  current: RecoveryStep;
  exhausted: boolean;
}

export interface RecoveryHierarchyOptions {
  /** Max attempts before auto-escalating on `failCurrent()` (default 1). */
  max_attempts_per_step?: number;
}

/**
 * Stateful walker over RECOVERY_HIERARCHY_STEPS.
 * Does not perform OS kill / cloud DR — strategy selection only.
 */
export class RecoveryHierarchy {
  private readonly maxAttempts: number;
  private index = 0;
  private attempts = 0;

  constructor(options: RecoveryHierarchyOptions = {}) {
    this.maxAttempts = Math.max(1, options.max_attempts_per_step ?? 1);
  }

  get current(): RecoveryStep {
    return RECOVERY_HIERARCHY_STEPS[this.index]!;
  }

  get exhausted(): boolean {
    return this.index >= RECOVERY_HIERARCHY_STEPS.length - 1 && this.attempts >= this.maxAttempts;
  }

  snapshot(): RecoveryState {
    return {
      current_step: this.current,
      step_index: this.index,
      attempts_at_step: this.attempts,
      exhausted: this.exhausted,
    };
  }

  /** Record one attempt without escalating. */
  recordAttempt(): RecoveryState {
    this.attempts += 1;
    return this.snapshot();
  }

  /**
   * Move exactly one step forward in the hierarchy.
   * Throws RecoveryExhaustedError when already on human_gate.
   */
  next(): RecoveryAdvanceResult {
    const previous = this.current;
    if (this.index >= RECOVERY_HIERARCHY_STEPS.length - 1) {
      throw new RecoveryExhaustedError(previous);
    }
    this.index += 1;
    this.attempts = 0;
    return {
      previous,
      current: this.current,
      exhausted: this.current === "human_gate",
    };
  }

  /**
   * Fail the current step: retry in-place until max_attempts, then escalate via next().
   */
  failCurrent(): RecoveryAdvanceResult {
    if (this.attempts + 1 < this.maxAttempts) {
      this.attempts += 1;
      return {
        previous: this.current,
        current: this.current,
        exhausted: false,
      };
    }
    if (this.index >= RECOVERY_HIERARCHY_STEPS.length - 1) {
      this.attempts += 1;
      throw new RecoveryExhaustedError(this.current);
    }
    return this.next();
  }

  /** Force jump to a step at or after current — never go backwards. */
  escalateTo(step: RecoveryStep): RecoveryState {
    const target = RECOVERY_HIERARCHY_STEPS.indexOf(step);
    if (target < 0) {
      throw new RecoveryExhaustedError(String(step));
    }
    if (target < this.index) {
      throw new RecoveryExhaustedError(`refuse downgrade ${this.current} → ${step}`);
    }
    this.index = target;
    this.attempts = 0;
    return this.snapshot();
  }

  reset(): void {
    this.index = 0;
    this.attempts = 0;
  }
}

export function recoverySteps(): readonly RecoveryStep[] {
  return RECOVERY_HIERARCHY_STEPS;
}

export function nextRecoveryStep(current: RecoveryStep): RecoveryStep | null {
  const idx = RECOVERY_HIERARCHY_STEPS.indexOf(current);
  if (idx < 0 || idx >= RECOVERY_HIERARCHY_STEPS.length - 1) return null;
  return RECOVERY_HIERARCHY_STEPS[idx + 1]!;
}
