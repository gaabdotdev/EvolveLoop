/**
 * V0-ORCH-06 — rigid failure buckets + circuit breaker (3 attempts / task).
 * V1-GATE-COMPAT — INFRA_QUOTA does not burn task attempts; applies cooldown instead.
 */

export const FAILURE_BUCKETS = ["INFRA_QUOTA", "EXEC_CODE", "POLICY_AUTHORITY"] as const;
export type FailureBucket = (typeof FAILURE_BUCKETS)[number];

export const CIRCUIT_BREAKER_MAX_ATTEMPTS = 3;

/** Default cooldown after an INFRA_QUOTA provider fault (ms). */
export const INFRA_COOLDOWN_MS_DEFAULT = 5_000;

export interface ClassifiableFailure {
  code?: string;
  message?: string;
  exit_code?: number | null;
  signal?: string | null;
  http_status?: number;
}

const INFRA_CODE_RE =
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNRESET|ENETUNREACH|AbortError|TimeoutError|timeout|mid[_ ]?stream|quota|rate[_ ]?limit|429|503|502|overloaded|provider_unavailable|infra|BAD_JSON|truncated|UNREACHABLE|EXHAUSTED/i;

const POLICY_CODE_RE =
  /AUTHORITY_DENIED|POLICY_DENIED|CAPABILITY_DENIED|PERMISSION_DENIED|FORBIDDEN|UNAUTHORIZED|403|401|default.?deny|capability.?gate|policy|NEEDS_KEY/i;

export function classifyFailure(input: ClassifiableFailure): FailureBucket {
  const blob = [input.code, input.message, input.signal].filter(Boolean).join(" ");
  if (input.http_status === 429 || input.http_status === 503 || input.http_status === 502) {
    return "INFRA_QUOTA";
  }
  if (input.http_status === 401 || input.http_status === 403) {
    return "POLICY_AUTHORITY";
  }
  if (POLICY_CODE_RE.test(blob) || POLICY_CODE_RE.test(String(input.code ?? ""))) {
    return "POLICY_AUTHORITY";
  }
  if (INFRA_CODE_RE.test(blob) || INFRA_CODE_RE.test(String(input.code ?? ""))) {
    return "INFRA_QUOTA";
  }
  return "EXEC_CODE";
}

/**
 * V1-GATE-COMPAT: Infra faults (quota/timeout/unreachable/truncated) must NOT burn
 * a task attempt — they trigger cooldown + fallback instead.
 */
export function burnsTaskAttempt(bucket: FailureBucket): boolean {
  return bucket !== "INFRA_QUOTA";
}

export interface CircuitBreakerState {
  task_id: string;
  attempts: number;
  max_attempts: number;
  open: boolean;
  last_bucket?: FailureBucket;
  last_reason?: string;
  /** Epoch ms — when set and in the future, infra cooldown is active. */
  cooldown_until_ms?: number;
}

export function createCircuitBreaker(taskId: string): CircuitBreakerState {
  return {
    task_id: taskId,
    attempts: 0,
    max_attempts: CIRCUIT_BREAKER_MAX_ATTEMPTS,
    open: false,
  };
}

/**
 * Record a failed attempt that burns the attempt counter.
 * Prefer {@link applyCircuitFailure} so INFRA_QUOTA does not burn.
 */
export function recordCircuitFailure(
  state: CircuitBreakerState,
  bucket: FailureBucket,
  reason?: string,
): CircuitBreakerState {
  if (state.open) {
    return { ...state, last_bucket: bucket, last_reason: reason ?? state.last_reason };
  }
  const attempts = state.attempts + 1;
  const open = attempts >= state.max_attempts;
  return {
    ...state,
    attempts,
    open,
    last_bucket: bucket,
    last_reason: reason,
  };
}

/**
 * Apply a classified failure to the circuit.
 * - EXEC_CODE / POLICY_AUTHORITY → burn attempt (may open circuit)
 * - INFRA_QUOTA → no burn; set cooldown_until_ms
 */
export function applyCircuitFailure(
  state: CircuitBreakerState,
  bucket: FailureBucket,
  reason?: string,
  opts?: { now_ms?: number; cooldown_ms?: number },
): CircuitBreakerState {
  if (!burnsTaskAttempt(bucket)) {
    const now = opts?.now_ms ?? Date.now();
    const cooldown_ms = opts?.cooldown_ms ?? INFRA_COOLDOWN_MS_DEFAULT;
    return {
      ...state,
      last_bucket: bucket,
      last_reason: reason,
      cooldown_until_ms: now + cooldown_ms,
    };
  }
  return recordCircuitFailure(state, bucket, reason);
}

export function isInfraCooldownActive(
  state: CircuitBreakerState,
  now_ms: number = Date.now(),
): boolean {
  return typeof state.cooldown_until_ms === "number" && state.cooldown_until_ms > now_ms;
}

export function canAttempt(state: CircuitBreakerState, now_ms: number = Date.now()): boolean {
  if (isInfraCooldownActive(state, now_ms)) return false;
  return !state.open && state.attempts < state.max_attempts;
}
