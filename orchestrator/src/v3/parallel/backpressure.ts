/**
 * V2-ORCH-04 — Dynamic backpressure for parallel scheduling.
 *
 * Adjusts `ParallelPolicy.max_in_progress` from rate-limit headers
 * (`x-ratelimit-remaining` / `x-ratelimit-limit`) and optional local
 * CPU/VRAM/mem telemetry. Deterministic; no LLM; no real OOM crashes.
 *
 * ## Policy (documented, fixed thresholds)
 *
 * Let `ratio = remaining / limit` when both are finite and `limit > 0`.
 *
 * 1. **Immediate reduce** (step −1, not below floor) if any of:
 *    - `vramUsedPercent >= 90`
 *    - `cpuPercent >= 95`
 *    - `memPercent >= 95`
 *    - `ratio < 0.2`
 * 2. **Increase** (step +1, not above ceiling) if:
 *    - `ratio > 0.5` AND telemetry is not in the critical bands above
 * 3. Otherwise **hold**.
 *
 * Missing rate-limit fields skip the ratio checks. Missing telemetry
 * fields are treated as non-critical.
 *
 * Integrate with `scheduleReadyTasks` by injecting the resulting policy:
 * `scheduleReadyTasks(paths, workId, applyBackpressure(policy, signal, bounds))`
 * or `scheduleReadyTasks(paths, workId, controller.observe(signal))`.
 */

import type { ParallelPolicy } from "./scheduler.js";

/** Rate-limit saturation threshold → reduce. */
export const BACKPRESSURE_RATE_LOW = 0.2;
/** Headroom threshold → allow increase when telemetry OK. */
export const BACKPRESSURE_RATE_HIGH = 0.5;
/** VRAM used % at/above which concurrency reduces immediately. */
export const BACKPRESSURE_VRAM_CRITICAL = 90;
/** CPU used % at/above which concurrency reduces immediately. */
export const BACKPRESSURE_CPU_CRITICAL = 95;
/** Mem used % at/above which concurrency reduces immediately. */
export const BACKPRESSURE_MEM_CRITICAL = 95;
/** Concurrency step size per observation. */
export const BACKPRESSURE_STEP = 1;

export interface BackpressureBounds {
  floor: number;
  ceiling: number;
}

export interface LocalTelemetry {
  cpuPercent?: number;
  vramUsedPercent?: number;
  memPercent?: number;
}

/**
 * Inputs derived from HTTP `x-ratelimit-*` headers and optional host telemetry.
 */
export interface BackpressureSignal {
  rateLimitRemaining?: number;
  rateLimitLimit?: number;
  localTelemetry?: LocalTelemetry;
}

export type BackpressureAction = "reduce" | "increase" | "hold";

export interface BackpressureDecision {
  max_in_progress: number;
  previous: number;
  action: BackpressureAction;
  reason: string;
  rateRatio: number | null;
}

export interface BackpressureControllerState {
  max_in_progress: number;
  floor: number;
  ceiling: number;
}

function clampInt(n: number, floor: number, ceiling: number): number {
  const lo = Math.min(floor, ceiling);
  const hi = Math.max(floor, ceiling);
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function normalizeBounds(bounds: BackpressureBounds): BackpressureBounds {
  const floor = Math.max(0, Math.trunc(bounds.floor));
  const ceiling = Math.max(floor, Math.trunc(bounds.ceiling));
  return { floor, ceiling };
}

export function rateLimitRatio(signal: BackpressureSignal): number | null {
  const remaining = signal.rateLimitRemaining;
  const limit = signal.rateLimitLimit;
  if (
    remaining == null ||
    limit == null ||
    !Number.isFinite(remaining) ||
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    return null;
  }
  return remaining / limit;
}

export function telemetryCritical(telemetry: LocalTelemetry | undefined): {
  critical: boolean;
  reason: string | null;
} {
  if (!telemetry) return { critical: false, reason: null };
  const { vramUsedPercent, cpuPercent, memPercent } = telemetry;
  if (
    vramUsedPercent != null &&
    Number.isFinite(vramUsedPercent) &&
    vramUsedPercent >= BACKPRESSURE_VRAM_CRITICAL
  ) {
    return {
      critical: true,
      reason: `vramUsedPercent=${vramUsedPercent}>=${BACKPRESSURE_VRAM_CRITICAL}`,
    };
  }
  if (
    cpuPercent != null &&
    Number.isFinite(cpuPercent) &&
    cpuPercent >= BACKPRESSURE_CPU_CRITICAL
  ) {
    return {
      critical: true,
      reason: `cpuPercent=${cpuPercent}>=${BACKPRESSURE_CPU_CRITICAL}`,
    };
  }
  if (
    memPercent != null &&
    Number.isFinite(memPercent) &&
    memPercent >= BACKPRESSURE_MEM_CRITICAL
  ) {
    return {
      critical: true,
      reason: `memPercent=${memPercent}>=${BACKPRESSURE_MEM_CRITICAL}`,
    };
  }
  return { critical: false, reason: null };
}

/**
 * Pure decision: next `max_in_progress` from current value, bounds, and signal.
 */
export function computeBackpressureMax(
  current: number,
  bounds: BackpressureBounds,
  signal: BackpressureSignal,
): BackpressureDecision {
  const { floor, ceiling } = normalizeBounds(bounds);
  const previous = clampInt(current, floor, ceiling);
  const ratio = rateLimitRatio(signal);
  const tel = telemetryCritical(signal.localTelemetry);

  let action: BackpressureAction = "hold";
  let reason = "hold: no pressure signal";

  if (tel.critical) {
    action = "reduce";
    reason = `reduce: telemetry critical (${tel.reason})`;
  } else if (ratio != null && ratio < BACKPRESSURE_RATE_LOW) {
    action = "reduce";
    reason = `reduce: rateLimit ratio=${ratio.toFixed(4)}<${BACKPRESSURE_RATE_LOW}`;
  } else if (ratio != null && ratio > BACKPRESSURE_RATE_HIGH) {
    action = "increase";
    reason = `increase: rateLimit ratio=${ratio.toFixed(4)}>${BACKPRESSURE_RATE_HIGH} and telemetry OK`;
  } else if (ratio != null) {
    reason = `hold: rateLimit ratio=${ratio.toFixed(4)} in [${BACKPRESSURE_RATE_LOW},${BACKPRESSURE_RATE_HIGH}]`;
  }

  let next = previous;
  if (action === "reduce") next = previous - BACKPRESSURE_STEP;
  if (action === "increase") next = previous + BACKPRESSURE_STEP;
  next = clampInt(next, floor, ceiling);

  if (next === previous && action !== "hold") {
    // Hit floor/ceiling — still record intended action for observability.
    reason = `${reason}; clamped to [${floor},${ceiling}]`;
  }

  return {
    max_in_progress: next,
    previous,
    action,
    reason,
    rateRatio: ratio,
  };
}

/**
 * Apply a backpressure signal onto a `ParallelPolicy`, returning a new policy
 * with adjusted `max_in_progress` (clamped to floor/ceiling).
 *
 * Default bounds: floor=1, ceiling=max(policy.max_in_progress, 1).
 */
export function applyBackpressure(
  policy: ParallelPolicy,
  signal: BackpressureSignal,
  bounds?: Partial<BackpressureBounds>,
): ParallelPolicy {
  const current = Math.max(0, Math.trunc(policy.max_in_progress));
  const floor = bounds?.floor ?? 1;
  const ceiling = bounds?.ceiling ?? Math.max(current, floor);
  const decision = computeBackpressureMax(current, { floor, ceiling }, signal);
  return {
    ...policy,
    max_in_progress: decision.max_in_progress,
  };
}

export interface BackpressureControllerOptions {
  floor: number;
  ceiling: number;
  /** Initial concurrency; defaults to ceiling, clamped to [floor, ceiling]. */
  initial?: number;
}

/**
 * Stateful controller: remembers current max_in_progress between observations.
 */
export class BackpressureController {
  private maxInProgress: number;
  private floor: number;
  private ceiling: number;
  private lastDecision: BackpressureDecision | null = null;

  constructor(opts: BackpressureControllerOptions) {
    const normalized = normalizeBounds({
      floor: opts.floor,
      ceiling: opts.ceiling,
    });
    this.floor = normalized.floor;
    this.ceiling = normalized.ceiling;
    const initial =
      opts.initial != null ? opts.initial : this.ceiling;
    this.maxInProgress = clampInt(initial, this.floor, this.ceiling);
  }

  getState(): BackpressureControllerState {
    return {
      max_in_progress: this.maxInProgress,
      floor: this.floor,
      ceiling: this.ceiling,
    };
  }

  getLastDecision(): BackpressureDecision | null {
    return this.lastDecision;
  }

  getPolicy(extra: Omit<ParallelPolicy, "max_in_progress"> = {}): ParallelPolicy {
    return {
      ...extra,
      max_in_progress: this.maxInProgress,
    };
  }

  /**
   * Observe a signal, update internal max_in_progress, return injectable policy.
   */
  observe(
    signal: BackpressureSignal,
    extra: Omit<ParallelPolicy, "max_in_progress"> = {},
  ): ParallelPolicy {
    const decision = computeBackpressureMax(
      this.maxInProgress,
      { floor: this.floor, ceiling: this.ceiling },
      signal,
    );
    this.maxInProgress = decision.max_in_progress;
    this.lastDecision = decision;
    return this.getPolicy(extra);
  }
}
