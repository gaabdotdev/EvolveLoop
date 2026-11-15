/**
 * Engine-level INV-CPROF enforcement on top of the frozen validator.
 * The contract is FROZEN; this module does not edit it. Extra checks are
 * fail-closed and never invent a ranking formula.
 */

import {
  CAPABILITY_METRICS,
  FORBIDDEN_SELF_TRUST_FIELDS,
  isIsoTimestamp,
  isRecord,
  validateCapabilityProfile,
  type CapabilityProfile,
  type MetricEstimate,
  type ValidationResult,
} from "../contracts/index.js";
import { CapabilityValidationError } from "./errors.js";
import { methodologyAllowsActive } from "./methodology.js";
import {
  CAPABILITY_METRIC_PROVENANCE,
  FORBIDDEN_RANKING_FIELDS,
  UNSUPPORTED_METRIC_PROVENANCE,
} from "./types.js";

const DISCLOSURE_METRIC_KEYS = ["metric", "value", "unit", "sample_size", "window", "uncertainty", "provenance", "source_refs"] as const;

export function issuesOrThrow(result: ValidationResult, label: string): void {
  if (result.valid) return;
  const first = result.issues[0];
  throw new CapabilityValidationError(
    first?.code ?? "INVALID_PROFILE",
    `${label}: ${result.issues.map((i) => `${i.code}@${i.path}`).join(",")}`,
    first?.path,
  );
}

export function assertConformsProfile(value: unknown): CapabilityProfile {
  const result = validateCapabilityProfile(value);
  issuesOrThrow(result, "CapabilityProfile");
  return value as CapabilityProfile;
}

function walkForbiddenKeys(node: unknown, path: string, names: ReadonlySet<string>, code: string, message: string): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkForbiddenKeys(item, `${path}[${i}]`, names, code, message));
    return;
  }
  if (!isRecord(node)) return;
  for (const [key, child] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    if (names.has(key)) {
      throw new CapabilityValidationError(code, `${message} ("${key}" at ${childPath})`, childPath);
    }
    walkForbiddenKeys(child, childPath, names, code, message);
  }
}

export function rejectRankingFields(value: unknown, label: string): void {
  walkForbiddenKeys(
    value,
    "",
    new Set<string>(FORBIDDEN_RANKING_FIELDS),
    "INV-CPROF-03",
    `${label} carries a context-free ranking field`,
  );
}

export function rejectSelfTrustFields(value: unknown, label: string): void {
  walkForbiddenKeys(
    value,
    "",
    new Set<string>(FORBIDDEN_SELF_TRUST_FIELDS),
    "INV-EVT-05",
    `${label} carries a self-asserted trust field`,
  );
}

export function provenanceSupportsMetric(kind: unknown): kind is (typeof CAPABILITY_METRIC_PROVENANCE)[number] {
  return typeof kind === "string" && (CAPABILITY_METRIC_PROVENANCE as readonly string[]).includes(kind);
}

export function provenanceForbiddenForMetric(kind: unknown): kind is (typeof UNSUPPORTED_METRIC_PROVENANCE)[number] {
  return typeof kind === "string" && (UNSUPPORTED_METRIC_PROVENANCE as readonly string[]).includes(kind);
}

function assertFinite(n: unknown, path: string): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new CapabilityValidationError("NON_FINITE_VALUE", `${path} must be a finite number`, path);
  }
  return n;
}

export function assertMetricDisclosure(estimate: MetricEstimate, index: number): void {
  const prefix = `metrics[${index}]`;
  if (!(CAPABILITY_METRICS as readonly string[]).includes(estimate.metric)) {
    throw new CapabilityValidationError("STRUCT", `${prefix}.metric is not a CapabilityMetric`, `${prefix}.metric`);
  }
  assertFinite(estimate.value, `${prefix}.value`);
  if (typeof estimate.unit !== "string" || estimate.unit.length === 0) {
    throw new CapabilityValidationError("STRUCT", `${prefix}.unit must be a non-empty string`, `${prefix}.unit`);
  }
  if (!Number.isInteger(estimate.sample_size) || estimate.sample_size < 1) {
    throw new CapabilityValidationError("INV-CPROF-02", `${prefix}.sample_size must be an integer >= 1`, `${prefix}.sample_size`);
  }
  if (!estimate.window || !isIsoTimestamp(estimate.window.from) || !isIsoTimestamp(estimate.window.to)) {
    throw new CapabilityValidationError("STRUCT", `${prefix}.window requires ISO-8601 UTC from/to`, `${prefix}.window`);
  }
  if (Date.parse(estimate.window.from) > Date.parse(estimate.window.to)) {
    throw new CapabilityValidationError("WINDOW_ORDER", `${prefix}.window.from must be <= window.to`, `${prefix}.window`);
  }
  const u = estimate.uncertainty;
  if (!u || typeof u.method !== "string" || u.method.length === 0) {
    throw new CapabilityValidationError("INV-CPROF-02", `${prefix}.uncertainty.method required`, `${prefix}.uncertainty`);
  }
  const lo = assertFinite(u.lower, `${prefix}.uncertainty.lower`);
  const hi = assertFinite(u.upper, `${prefix}.uncertainty.upper`);
  if (lo > hi) {
    throw new CapabilityValidationError("INV-CPROF-02", `${prefix}.uncertainty lower must be <= upper`, `${prefix}.uncertainty.lower`);
  }
  if (provenanceForbiddenForMetric(estimate.provenance) || !provenanceSupportsMetric(estimate.provenance)) {
    throw new CapabilityValidationError(
      "INV-CPROF-01",
      `${prefix}.provenance ${String(estimate.provenance)} cannot support a capability estimate`,
      `${prefix}.provenance`,
    );
  }
  if (!Array.isArray(estimate.source_refs) || estimate.source_refs.length < 1 || estimate.source_refs.some((s) => typeof s !== "string" || s.length === 0)) {
    throw new CapabilityValidationError("STRUCT", `${prefix}.source_refs must be a non-empty string array`, `${prefix}.source_refs`);
  }
  for (const key of DISCLOSURE_METRIC_KEYS) {
    if (!(key in estimate)) {
      throw new CapabilityValidationError("STRUCT", `${prefix} missing disclosure field ${key}`, `${prefix}.${key}`);
    }
  }
}

export function assertProfileEngineRules(profile: CapabilityProfile): void {
  rejectRankingFields(profile, "CapabilityProfile");
  rejectSelfTrustFields(profile, "CapabilityProfile");
  if (!profile.context || typeof profile.context.work_category !== "string" || typeof profile.context.task_kind !== "string") {
    throw new CapabilityValidationError("STRUCT", "context.work_category and context.task_kind are required", "context");
  }
  if (!profile.methodology || typeof profile.methodology.id !== "string" || typeof profile.methodology.version !== "string") {
    throw new CapabilityValidationError("STRUCT", "methodology id/version required", "methodology");
  }
  if (profile.status === "ACTIVE" && !methodologyAllowsActive(profile.methodology)) {
    throw new CapabilityValidationError(
      "INV-CPROF-04",
      "ACTIVE profiles require an ACCEPTED methodology; V4.2 first cut has none (ADR-V4-0010)",
      "status",
    );
  }
  if (profile.methodology.status === "ACCEPTED" && !methodologyAllowsActive(profile.methodology)) {
    throw new CapabilityValidationError(
      "INV-CPROF-04",
      `methodology ${profile.methodology.id}@${profile.methodology.version} is not recognized as ACCEPTED (M17 baselines absent)`,
      "methodology.status",
    );
  }
  if (!Array.isArray(profile.metrics) || profile.metrics.length < 1) {
    throw new CapabilityValidationError("STRUCT", "metrics must be a non-empty array", "metrics");
  }
  profile.metrics.forEach((m, i) => assertMetricDisclosure(m, i));
  if (Date.parse(profile.computed_at) > Date.parse(profile.valid_until)) {
    throw new CapabilityValidationError("WINDOW_ORDER", "computed_at must be <= valid_until", "valid_until");
  }
}

export function assertStoreableProfile(value: unknown): CapabilityProfile {
  const profile = assertConformsProfile(value);
  assertProfileEngineRules(profile);
  return profile;
}
