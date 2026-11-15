/**
 * Honesty validator for FairBaselineArtifact.
 * Does not execute workloads and does not invent scores.
 */

import { isIsoTimestamp, isRecord, PROVENANCE_KINDS } from "../contracts/common.js";
import { BaselineValidationError } from "./errors.js";
import { isQualityProofProvenance, M08_PUBLISHED_METHODOLOGY_ID } from "./protocol.js";
import {
  BASELINE_METRICS,
  CASE_RUN_STATUSES,
  COMPARATOR_CLASSES,
  FAIR_BASELINE_KIND,
  FAIR_BASELINE_SCHEMA_VERSION,
  FORBIDDEN_RANKING_FIELDS,
  HARNESS_ROLES,
  REFUSED_METRIC_PROVENANCE,
  type BaselineMetricSlot,
  type FairBaselineArtifact,
} from "./types.js";

const DISCLOSED_NOT_PROOF = ["PROVIDER_REPORTED", "DERIVED", "UNKNOWN"] as const;

function fail(code: string, message: string, path?: string): never {
  throw new BaselineValidationError(code, message, path);
}

function walkForbiddenKeys(node: unknown, path: string, names: ReadonlySet<string>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkForbiddenKeys(item, `${path}[${i}]`, names));
    return;
  }
  if (!isRecord(node)) return;
  for (const [key, child] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    if (names.has(key)) {
      fail("INV-FBA-03", `context-free ranking field "${key}" is forbidden at ${childPath}`, childPath);
    }
    walkForbiddenKeys(child, childPath, names);
  }
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail("STRUCT", `${path} must be a non-empty string`, path);
  return value;
}

function assertFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("STRUCT", `${path} must be a finite number`, path);
  return value;
}

function isMetricName(value: unknown): value is BaselineMetricSlot["metric"] {
  return typeof value === "string" && (BASELINE_METRICS as readonly string[]).includes(value);
}

function assertSourceRefs(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.some((s) => typeof s !== "string" || s.length === 0)) {
    fail("STRUCT", `${path} must be a non-empty string array`, path);
  }
  return value as string[];
}

function assertMetricSlot(raw: unknown, index: number): BaselineMetricSlot {
  const path = `metrics[${index}]`;
  if (!isRecord(raw)) fail("STRUCT", `${path} must be an object`, path);
  if (!isMetricName(raw.metric)) fail("STRUCT", `${path}.metric is not a baseline metric`, `${path}.metric`);
  if (typeof raw.quality_proof !== "boolean") fail("STRUCT", `${path}.quality_proof must be boolean`, `${path}.quality_proof`);
  const provenance = raw.provenance;
  if (typeof provenance !== "string") fail("STRUCT", `${path}.provenance required`, `${path}.provenance`);
  if ((REFUSED_METRIC_PROVENANCE as readonly string[]).includes(provenance)) {
    fail("INV-FBA-01", `${path}.provenance SELF_REPORTED cannot be ground truth`, `${path}.provenance`);
  }
  if (!(PROVENANCE_KINDS as readonly string[]).includes(provenance)) {
    fail("STRUCT", `${path}.provenance unknown`, `${path}.provenance`);
  }
  assertString(raw.unit, `${path}.unit`);
  assertSourceRefs(raw.source_refs, `${path}.source_refs`);

  if (raw.quality_proof === true) {
    if (!isQualityProofProvenance(provenance)) {
      fail("INV-FBA-01", `${path}.quality_proof requires OBSERVED or HARNESS_REPORTED`, `${path}.provenance`);
    }
    if (raw.status !== "RECORDED") fail("STRUCT", `${path}.status must be RECORDED when quality_proof`, `${path}.status`);
    assertFinite(raw.value, `${path}.value`);
    if (!Number.isInteger(raw.sample_size) || (raw.sample_size as number) < 1) {
      fail("STRUCT", `${path}.sample_size must be an integer >= 1`, `${path}.sample_size`);
    }
    if (!isRecord(raw.window) || !isIsoTimestamp(raw.window.from) || !isIsoTimestamp(raw.window.to)) {
      fail("STRUCT", `${path}.window requires ISO-8601 UTC from/to`, `${path}.window`);
    }
    if (Date.parse(raw.window.from as string) > Date.parse(raw.window.to as string)) {
      fail("STRUCT", `${path}.window.from must be <= window.to`, `${path}.window`);
    }
    if (!isRecord(raw.uncertainty) || typeof raw.uncertainty.method !== "string" || raw.uncertainty.method.length === 0) {
      fail("STRUCT", `${path}.uncertainty.method required`, `${path}.uncertainty`);
    }
    const lo = assertFinite(raw.uncertainty.lower, `${path}.uncertainty.lower`);
    const hi = assertFinite(raw.uncertainty.upper, `${path}.uncertainty.upper`);
    if (lo > hi) fail("STRUCT", `${path}.uncertainty lower must be <= upper`, `${path}.uncertainty.lower`);
    if (raw.metric === "verified_completion") {
      const executor = raw.executor_id;
      const verifier = raw.independent_verifier_id;
      if (typeof verifier !== "string" || verifier.length === 0) {
        fail("INV-FBA-07", `${path} RECORDED verified_completion requires independent_verifier_id`, `${path}.independent_verifier_id`);
      }
      if (typeof executor === "string" && executor === verifier) {
        fail("INV-FBA-07", `${path} verifier must not be the executor`, `${path}.independent_verifier_id`);
      }
    }
    return raw as unknown as BaselineMetricSlot;
  }

  if (raw.value !== null) {
    if (provenance === "UNAVAILABLE" || provenance === "ESTIMATED") {
      fail("INV-FBA-02", `${path} UNAVAILABLE/ESTIMATED cannot carry a numeric value`, `${path}.value`);
    }
  }

  if (raw.status === "DECLARED_UNAVAILABLE" || raw.status === "ESTIMATED_NOT_PROOF") {
    if (raw.value !== null) fail("INV-FBA-02", `${path}.value must be null`, `${path}.value`);
    if (raw.quality_proof !== false) fail("INV-FBA-02", `${path}.quality_proof must be false`, `${path}.quality_proof`);
    if (raw.status === "DECLARED_UNAVAILABLE" && provenance !== "UNAVAILABLE") {
      fail("INV-FBA-02", `${path}.provenance must be UNAVAILABLE`, `${path}.provenance`);
    }
    if (raw.status === "ESTIMATED_NOT_PROOF" && provenance !== "ESTIMATED") {
      fail("INV-FBA-02", `${path}.provenance must be ESTIMATED`, `${path}.provenance`);
    }
    assertString(raw.reason, `${path}.reason`);
    return raw as unknown as BaselineMetricSlot;
  }

  if (raw.status === "DISCLOSED_NOT_PROOF") {
    if (raw.quality_proof !== false) fail("INV-FBA-01", `${path}.quality_proof must be false`, `${path}.quality_proof`);
    if (!(DISCLOSED_NOT_PROOF as readonly string[]).includes(provenance)) {
      fail("INV-FBA-01", `${path}.provenance cannot support a claim`, `${path}.provenance`);
    }
    assertString(raw.reason, `${path}.reason`);
    if (raw.value !== null && typeof raw.value !== "number") fail("STRUCT", `${path}.value must be number or null`, `${path}.value`);
    return raw as unknown as BaselineMetricSlot;
  }

  fail("STRUCT", `${path}.status is not a valid metric slot status`, `${path}.status`);
}

function assertCost(raw: unknown): FairBaselineArtifact["cost"] {
  if (!isRecord(raw)) fail("STRUCT", "cost must be an object", "cost");
  const provenance = raw.provenance;
  if (typeof provenance !== "string" || !(PROVENANCE_KINDS as readonly string[]).includes(provenance)) {
    fail("STRUCT", "cost.provenance required", "cost.provenance");
  }
  if (provenance === "SELF_REPORTED") {
    fail("INV-FBA-01", "SELF_REPORTED cost cannot be ground truth", "cost.provenance");
  }
  if (raw.amount !== null && typeof raw.amount !== "number") fail("STRUCT", "cost.amount must be number or null", "cost.amount");
  if (typeof raw.amount === "number" && !Number.isFinite(raw.amount)) fail("STRUCT", "cost.amount must be finite", "cost.amount");
  if (raw.amount !== null && !isQualityProofProvenance(provenance) && provenance !== "DERIVED" && provenance !== "PROVIDER_REPORTED") {
    fail("INV-FBA-02", "numeric cost requires quality-proof, DERIVED, or PROVIDER_REPORTED provenance", "cost.provenance");
  }
  if ((provenance === "UNAVAILABLE" || provenance === "ESTIMATED") && raw.amount !== null) {
    fail("INV-FBA-02", "UNAVAILABLE/ESTIMATED cost.amount must be null", "cost.amount");
  }
  assertString(raw.currency, "cost.currency");
  if (!Array.isArray(raw.includes) || raw.includes.length < 1 || raw.includes.some((s) => typeof s !== "string")) {
    fail("STRUCT", "cost.includes must be a non-empty string array", "cost.includes");
  }
  return raw as unknown as FairBaselineArtifact["cost"];
}

function assertWorkload(raw: unknown): FairBaselineArtifact["workload"] {
  if (!isRecord(raw)) fail("STRUCT", "workload must be an object", "workload");
  assertString(raw.suite_id, "workload.suite_id");
  assertString(raw.suite_version, "workload.suite_version");
  assertString(raw.work_category, "workload.work_category");
  assertString(raw.task_kind, "workload.task_kind");
  if (!(COMPARATOR_CLASSES as readonly string[]).includes(raw.comparator_class as string)) {
    fail("STRUCT", "workload.comparator_class invalid", "workload.comparator_class");
  }
  if (!Array.isArray(raw.cases) || raw.cases.length < 1) fail("STRUCT", "workload.cases must be non-empty", "workload.cases");
  const ids = new Set<string>();
  for (const [i, c] of raw.cases.entries()) {
    if (!isRecord(c)) fail("STRUCT", `workload.cases[${i}] must be an object`, `workload.cases[${i}]`);
    const id = assertString(c.case_id, `workload.cases[${i}].case_id`);
    if (ids.has(id)) fail("STRUCT", `duplicate case_id ${id}`, `workload.cases[${i}].case_id`);
    ids.add(id);
    assertString(c.description, `workload.cases[${i}].description`);
    if (!(CASE_RUN_STATUSES as readonly string[]).includes(c.run_status as string)) {
      fail("STRUCT", `workload.cases[${i}].run_status invalid`, `workload.cases[${i}].run_status`);
    }
  }
  if (!Array.isArray(raw.acceptance_criteria) || raw.acceptance_criteria.length < 1) {
    fail("STRUCT", "workload.acceptance_criteria must be non-empty", "workload.acceptance_criteria");
  }
  return raw as unknown as FairBaselineArtifact["workload"];
}

/**
 * Validate a FairBaselineArtifact. Throws BaselineValidationError on dishonesty or structural failure.
 */
export function validateBaselineArtifact(value: unknown): FairBaselineArtifact {
  if (!isRecord(value)) fail("STRUCT", "artifact must be an object");
  walkForbiddenKeys(value, "", new Set<string>(FORBIDDEN_RANKING_FIELDS));
  if (value.kind !== FAIR_BASELINE_KIND) fail("STRUCT", `kind must be ${FAIR_BASELINE_KIND}`, "kind");
  if (value.schema_version !== FAIR_BASELINE_SCHEMA_VERSION) {
    fail("STRUCT", `schema_version must be ${FAIR_BASELINE_SCHEMA_VERSION}`, "schema_version");
  }
  assertString(value.artifact_id, "artifact_id");
  assertString(value.suite_id, "suite_id");
  assertString(value.suite_version, "suite_version");
  const workload = assertWorkload(value.workload);
  if (workload.suite_id !== value.suite_id || workload.suite_version !== value.suite_version) {
    fail("STRUCT", "workload suite identity must match artifact suite identity", "workload.suite_id");
  }
  if (!isRecord(value.harness)) fail("STRUCT", "harness must be an object", "harness");
  assertString(value.harness.harness_id, "harness.harness_id");
  assertString(value.harness.harness_version, "harness.harness_version");
  if (!(HARNESS_ROLES as readonly string[]).includes(value.harness.role as string)) {
    fail("STRUCT", "harness.role invalid", "harness.role");
  }
  if (!isRecord(value.environment) || typeof value.environment.class !== "string" || value.environment.class.length === 0) {
    fail("STRUCT", "environment.class required", "environment.class");
  }
  if (!Array.isArray(value.metrics) || value.metrics.length < 1) fail("STRUCT", "metrics must be non-empty", "metrics");
  const metrics = value.metrics.map((m, i) => assertMetricSlot(m, i));
  const hasQualityProof = metrics.some((m) => m.quality_proof);
  if (value.harness.role === "schema_validator" && hasQualityProof) {
    fail("INV-FBA-04", "schema_validator harness cannot emit quality-proof metrics", "harness.role");
  }
  const anyDeclaredNotRun = workload.cases.some((c) => c.run_status === "DECLARED_NOT_RUN");
  if (anyDeclaredNotRun && hasQualityProof) {
    fail("INV-FBA-05", "DECLARED_NOT_RUN cases cannot share an artifact with quality-proof metrics", "workload.cases");
  }
  assertCost(value.cost);
  if (!isRecord(value.comparison_scope) || !Array.isArray(value.comparison_scope.compared) || !Array.isArray(value.comparison_scope.not_compared)) {
    fail("STRUCT", "comparison_scope.compared and not_compared required", "comparison_scope");
  }
  if (!isRecord(value.methodology_note)) fail("STRUCT", "methodology_note required", "methodology_note");
  if (value.methodology_note.this_artifact_stamps_methodology_accepted !== false) {
    fail("INV-FBA-06", "M17 must not stamp M08 methodology ACCEPTED", "methodology_note.this_artifact_stamps_methodology_accepted");
  }
  if (value.methodology_note.m08_methodology_status === "ACCEPTED") {
    fail("INV-FBA-06", "methodology_note cannot claim M08 ACCEPTED in this cut", "methodology_note.m08_methodology_status");
  }
  if (value.methodology_note.m08_methodology_status !== "PROVISIONAL" && value.methodology_note.m08_methodology_status !== "PLACEHOLDER") {
    fail("STRUCT", "methodology_note.m08_methodology_status must be PROVISIONAL or PLACEHOLDER", "methodology_note.m08_methodology_status");
  }
  if (typeof value.methodology_note.m08_methodology_id !== "string") {
    fail("STRUCT", "methodology_note.m08_methodology_id required", "methodology_note.m08_methodology_id");
  }
  if (
    value.methodology_note.m08_methodology_id === M08_PUBLISHED_METHODOLOGY_ID &&
    value.methodology_note.m08_methodology_status !== "PROVISIONAL"
  ) {
    fail("INV-FBA-06", "published M08 methodology is PROVISIONAL", "methodology_note.m08_methodology_status");
  }
  if (value.production_scores !== "ABSENT" && value.production_scores !== "PARTIAL") {
    fail("STRUCT", "production_scores must be ABSENT or PARTIAL", "production_scores");
  }
  if (hasQualityProof && value.harness.role === "workload_executor") {
    if (value.production_scores !== "PARTIAL") {
      fail("STRUCT", "quality-proof executor runs must set production_scores PARTIAL", "production_scores");
    }
  } else if (value.production_scores !== "ABSENT") {
    fail("STRUCT", "artifacts without quality-proof metrics must set production_scores ABSENT", "production_scores");
  }
  if (!isIsoTimestamp(value.computed_at)) fail("STRUCT", "computed_at must be ISO-8601 UTC", "computed_at");
  if (!Array.isArray(value.limitations) || value.limitations.length < 1) {
    fail("STRUCT", "limitations must be a non-empty string array", "limitations");
  }
  return value as unknown as FairBaselineArtifact;
}
