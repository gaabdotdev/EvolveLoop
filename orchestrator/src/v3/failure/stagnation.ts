/**
 * Anti-Loop / Anti-Stagnation detector (Meta 64 / §245).
 * Detects repeated action/hypothesis/failure without state progress.
 */

import type {
  StagnationEvent,
  StagnationReport,
  StagnationSignal,
} from "./types.js";

export interface StagnationDetectorOptions {
  /** Sliding window size (default 5). */
  window_size?: number;
  /** Min repeats inside window to flag (default 3). */
  repeat_threshold?: number;
  /** Consecutive identical fingerprints to flag no_state_progress (default 3). */
  no_progress_threshold?: number;
}

/**
 * Normalize action tokens before keying (WF-04b).
 * Trim + lowercase so case/whitespace variants collapse to one key.
 */
export function normalizeActionId(actionId: string | undefined): string | undefined {
  if (typeof actionId !== "string") return actionId;
  return actionId.trim().toLowerCase();
}

function countRepeats(values: Array<string | undefined>, key: string): number {
  return values.filter((v) => v === key).length;
}

function dominantRepeat(
  values: Array<string | undefined>,
  threshold: number,
): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n >= threshold) return v;
  }
  return undefined;
}

function hasOscillation(values: Array<string | undefined>): boolean {
  const filtered = values.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (filtered.length < 4) return false;
  // A-B-A-B pattern in last 4
  const [a, b, c, d] = filtered.slice(-4);
  return a === c && b === d && a !== b;
}

/**
 * Sliding-window stagnation detector.
 * Does not invent progress — missing fingerprints never count as progress.
 */
export class StagnationDetector {
  private readonly windowSize: number;
  private readonly repeatThreshold: number;
  private readonly noProgressThreshold: number;
  private readonly events: StagnationEvent[] = [];

  constructor(options: StagnationDetectorOptions = {}) {
    this.windowSize = Math.max(2, options.window_size ?? 5);
    this.repeatThreshold = Math.max(2, options.repeat_threshold ?? 3);
    this.noProgressThreshold = Math.max(2, options.no_progress_threshold ?? 3);
  }

  observe(event: StagnationEvent): StagnationReport {
    this.events.push({
      ...event,
      action_id: normalizeActionId(event.action_id),
      at: event.at ?? new Date().toISOString(),
    });
    while (this.events.length > this.windowSize) {
      this.events.shift();
    }
    return this.evaluate();
  }

  evaluate(): StagnationReport {
    const signals: StagnationSignal[] = [];
    const actions = this.events.map((e) => e.action_id);
    const hyps = this.events.map((e) => e.hypothesis_id);
    const fails = this.events.map((e) => e.failure_signature);
    const fps = this.events.map((e) => e.state_fingerprint);

    if (dominantRepeat(actions, this.repeatThreshold)) {
      signals.push("repeated_action");
    }
    if (dominantRepeat(hyps, this.repeatThreshold)) {
      signals.push("repeated_hypothesis");
    }
    if (dominantRepeat(fails, this.repeatThreshold)) {
      signals.push("repeated_failure");
    }

    const definedFps = fps.filter((f): f is string => typeof f === "string" && f.length > 0);
    if (definedFps.length >= this.noProgressThreshold) {
      const last = definedFps[definedFps.length - 1]!;
      const trailing = definedFps.slice(-this.noProgressThreshold);
      if (trailing.every((f) => f === last)) {
        signals.push("no_state_progress");
      }
    }

    if (hasOscillation(actions) || hasOscillation(hyps)) {
      signals.push("oscillation");
    }

    const stagnant = signals.length > 0;
    let recommended_action: StagnationReport["recommended_action"] = "continue";
    if (stagnant) {
      if (signals.includes("repeated_failure") || signals.includes("oscillation")) {
        recommended_action = "escalate";
      } else if (signals.includes("no_state_progress")) {
        recommended_action = "replan";
      } else {
        recommended_action = "change_strategy";
      }
    }

    return {
      stagnant,
      signals,
      window_size: this.windowSize,
      recommended_action,
    };
  }

  reset(): void {
    this.events.length = 0;
  }

  /** Exposed for tests — current window length. */
  get size(): number {
    return this.events.length;
  }
}

/** Pure helper: count how many times `key` appears for a field. */
export function countFieldRepeats(
  events: StagnationEvent[],
  field: keyof Pick<
    StagnationEvent,
    "action_id" | "hypothesis_id" | "failure_signature" | "state_fingerprint"
  >,
  key: string,
): number {
  return countRepeats(
    events.map((e) => e[field]),
    key,
  );
}
