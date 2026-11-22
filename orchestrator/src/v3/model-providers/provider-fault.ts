/**
 * V1-GATE-COMPAT — provider fault injection classification.
 * Maps FreeLLMAPI / protocol faults → INFRA (no task-attempt burn) + cooldown + fallback hint.
 */

import {
  classifyFailure,
  burnsTaskAttempt,
  applyCircuitFailure,
  INFRA_COOLDOWN_MS_DEFAULT,
  type CircuitBreakerState,
  type FailureBucket,
} from "../mso/failure.js";
import type { FreeLLMAPIState, FreeLLMAPIInvokeMeta } from "./freellmapi.js";
import type { ModelInvokeResult } from "./types.js";

export type ProviderFaultKind =
  | "http_429"
  | "timeout_mid_stream"
  | "truncated_json"
  | "unreachable"
  | "exhausted"
  | "needs_key"
  | "other";

export interface ProviderFaultReport {
  kind: "ProviderFaultReport";
  fault_kind: ProviderFaultKind;
  bucket: FailureBucket;
  /** Always false for INFRA_QUOTA; true for POLICY/EXEC. */
  burns_task_attempt: boolean;
  cooldown_ms: number;
  fallback_recommended: boolean;
  code: string;
  message: string;
  http_status?: number;
  provider_state?: FreeLLMAPIState;
}

export interface HandleProviderFaultResult {
  report: ProviderFaultReport;
  circuit: CircuitBreakerState;
}

const DEFAULT_COOLDOWN: Record<ProviderFaultKind, number> = {
  http_429: 10_000,
  timeout_mid_stream: INFRA_COOLDOWN_MS_DEFAULT,
  truncated_json: INFRA_COOLDOWN_MS_DEFAULT,
  unreachable: INFRA_COOLDOWN_MS_DEFAULT,
  exhausted: 15_000,
  needs_key: 0,
  other: INFRA_COOLDOWN_MS_DEFAULT,
};

export function detectProviderFaultKind(input: {
  http_status?: number;
  code?: string;
  message?: string;
  provider_state?: FreeLLMAPIState;
  abort_reason?: string;
}): ProviderFaultKind {
  const blob = [input.code, input.message, input.abort_reason, input.provider_state]
    .filter(Boolean)
    .join(" ");
  if (input.http_status === 429 || input.provider_state === "exhausted") return "http_429";
  if (/429|rate.?limit|quota|exhausted/i.test(blob)) {
    return /exhausted|quota|no.?credits/i.test(blob) && input.http_status !== 429
      ? "exhausted"
      : "http_429";
  }
  if (
    /AbortError|TimeoutError|timeout|mid.?stream|aborted/i.test(blob) ||
    input.abort_reason === "timeout"
  ) {
    return "timeout_mid_stream";
  }
  if (/BAD_JSON|truncated|invalid .+ JSON|Unexpected end/i.test(blob)) {
    return "truncated_json";
  }
  if (
    input.provider_state === "needsKey" ||
    /NEEDS_KEY|needsKey/i.test(blob) ||
    input.http_status === 401 ||
    input.http_status === 403
  ) {
    return "needs_key";
  }
  if (
    input.provider_state === "unreachable" ||
    /UNREACHABLE|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(blob)
  ) {
    return "unreachable";
  }
  return "other";
}

/**
 * Classify a provider/HTTP fault for gate-compat fault injection.
 * Infra faults → burns_task_attempt=false, fallback_recommended=true, cooldown>0.
 */
export function classifyProviderFault(input: {
  http_status?: number;
  code?: string;
  message?: string;
  provider_state?: FreeLLMAPIState;
  abort_reason?: string;
  cooldown_ms?: number;
}): ProviderFaultReport {
  const fault_kind = detectProviderFaultKind(input);
  // Known infra fault kinds are always INFRA_QUOTA (no task-attempt burn).
  const infraKinds: ProviderFaultKind[] = [
    "http_429",
    "timeout_mid_stream",
    "truncated_json",
    "unreachable",
    "exhausted",
  ];
  const bucket: FailureBucket = infraKinds.includes(fault_kind)
    ? "INFRA_QUOTA"
    : classifyFailure({
        http_status: input.http_status,
        code: input.code ?? fault_kind.toUpperCase(),
        message: input.message ?? fault_kind,
      });
  const burns = burnsTaskAttempt(bucket);
  const cooldown_ms =
    input.cooldown_ms ?? (burns ? 0 : DEFAULT_COOLDOWN[fault_kind]);
  return {
    kind: "ProviderFaultReport",
    fault_kind,
    bucket,
    burns_task_attempt: burns,
    cooldown_ms,
    fallback_recommended: bucket === "INFRA_QUOTA",
    code: input.code ?? fault_kind.toUpperCase(),
    message: input.message ?? `provider fault: ${fault_kind}`,
    http_status: input.http_status,
    provider_state: input.provider_state,
  };
}

/** Apply fault to circuit (no burn for Infra) and return report. */
export function handleProviderFault(
  circuit: CircuitBreakerState,
  input: Parameters<typeof classifyProviderFault>[0],
  opts?: { now_ms?: number },
): HandleProviderFaultResult {
  const report = classifyProviderFault(input);
  const next = applyCircuitFailure(circuit, report.bucket, report.message, {
    now_ms: opts?.now_ms,
    cooldown_ms: report.cooldown_ms,
  });
  return { report, circuit: next };
}

/** Map a FreeLLMAPI invoke failure into a fault report. */
export function faultFromFreeLLMAPIResult(
  result: ModelInvokeResult & { freellmapi?: FreeLLMAPIInvokeMeta },
): ProviderFaultReport | null {
  if (result.status === "ok") return null;
  const state = result.freellmapi?.provider_state;
  const httpMatch = /HTTP (\d+)/.exec(result.message);
  const http_status = httpMatch ? Number(httpMatch[1]) : undefined;
  return classifyProviderFault({
    http_status,
    code: result.code,
    message: result.message,
    provider_state: state,
    abort_reason: /abort|timeout/i.test(result.message) ? "timeout" : undefined,
  });
}
