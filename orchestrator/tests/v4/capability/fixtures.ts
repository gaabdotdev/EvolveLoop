import {
  CAPABILITY_PROFILE_SCHEMA_VERSION,
  DEFAULT_TENANT_ID,
  type CapabilityProfile,
  type MetricEstimate,
} from "../../../src/v4/contracts/index.js";
import {
  PLACEHOLDER_METHODOLOGY,
  POINT_INTERVAL_METHOD,
  PUBLISHED_METHODOLOGY,
  sequentialProfileId,
} from "../../../src/v4/capability/index.js";

export const NOW = "2026-11-15T12:00:00.000Z";
export const LATER = "2026-11-22T12:00:00.000Z";
export const PAST = "2026-11-01T12:00:00.000Z";
export const EXECUTOR_A = "executor_worker01";
export const EXECUTOR_B = "executor_worker02";
export const SOURCE = "run_m08obs0001";

export const CONTEXT = { work_category: "code.review", task_kind: "pr_summary", environment: "local" } as const;

export function observedEstimate(overrides: Partial<MetricEstimate> = {}): MetricEstimate {
  return {
    metric: "success_rate",
    value: 0.8,
    unit: "1",
    sample_size: 4,
    window: { from: PAST, to: NOW },
    uncertainty: { method: POINT_INTERVAL_METHOD, lower: 0.8, upper: 0.8 },
    provenance: "OBSERVED",
    source_refs: [SOURCE],
    ...overrides,
  };
}

export function validProfile(overrides: Partial<CapabilityProfile> = {}): CapabilityProfile {
  return {
    kind: "CapabilityProfile",
    schema_version: CAPABILITY_PROFILE_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    profile_id: sequentialProfileId(1),
    subject: { executor_id: EXECUTOR_A, executor_version: "1.0.0" },
    context: { ...CONTEXT },
    metrics: [observedEstimate()],
    methodology: { ...PUBLISHED_METHODOLOGY },
    status: "PROVISIONAL",
    computed_at: NOW,
    valid_until: LATER,
    ...overrides,
  };
}

export function placeholderProfile(overrides: Partial<CapabilityProfile> = {}): CapabilityProfile {
  return validProfile({
    profile_id: sequentialProfileId(2),
    methodology: { ...PLACEHOLDER_METHODOLOGY },
    ...overrides,
  });
}

export function cpMeasurement(value: number, extra: Record<string, unknown> = {}) {
  return {
    metric: "success_rate",
    value,
    unit: "1",
    provenance: "OBSERVED",
    ...extra,
  };
}

export function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === code) return;
    throw new Error(`expected code ${code}, got ${String(e.code)} (${String(e.message)})`);
  }
  throw new Error(`expected ${code} to be thrown`);
}
