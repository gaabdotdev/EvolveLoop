import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FairBaselineArtifact, RecordedMetricSlot } from "../../../src/v4/benchmarks/index.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../");

export const CANONICAL_ARTIFACT_PATH = join(
  REPO_ROOT,
  "docs/v4/benchmarks/artifacts/el-v4-fair-baseline.declared-unavailable.v0.json",
);

export function loadCanonicalArtifact(): unknown {
  return JSON.parse(readFileSync(CANONICAL_ARTIFACT_PATH, "utf8"));
}

export const NOW = "2026-11-15T16:00:00.000Z";
export const PAST = "2026-11-15T15:00:00.000Z";

function recorded(
  metric: RecordedMetricSlot["metric"],
  value: number,
  unit: string,
  extra: Partial<RecordedMetricSlot> = {},
): RecordedMetricSlot {
  return {
    metric,
    status: "RECORDED",
    value,
    unit,
    sample_size: 3,
    window: { from: PAST, to: NOW },
    uncertainty: { method: "point_interval.v0", lower: value, upper: value },
    provenance: "HARNESS_REPORTED",
    source_refs: ["run_m17fixture0001"],
    quality_proof: true,
    ...extra,
  };
}

/** Labelled test fixture — not a production score. */
export function executedFixture(overrides: Record<string, unknown> = {}): FairBaselineArtifact {
  const base: FairBaselineArtifact = {
    kind: "FairBaselineArtifact",
    schema_version: "0.1.0",
    artifact_id: "el-v4-fba-fixture-baseline",
    suite_id: "el-v4-fair-baseline",
    suite_version: "0.1.0",
    workload: {
      suite_id: "el-v4-fair-baseline",
      suite_version: "0.1.0",
      work_category: "software.engineering",
      task_kind: "verified_delivery",
      comparator_class: "v4_non_adaptive",
      cases: [
        { case_id: "FBC-SE-01", description: "fixture case 1", run_status: "EXECUTED" },
        { case_id: "FBC-SE-02", description: "fixture case 2", run_status: "EXECUTED" },
        { case_id: "FBC-SE-03", description: "fixture case 3", run_status: "EXECUTED" },
      ],
      acceptance_criteria: ["independent verification", "cost includes overhead"],
    },
    harness: {
      harness_id: "el-v4-bench-harness",
      harness_version: "0.1.0",
      role: "workload_executor",
    },
    environment: { class: "local-first" },
    metrics: [
      recorded("cost_per_verified_result", 20, "USD"),
      recorded("validated_quality", 0.7, "1"),
      recorded("verified_completion", 0.6, "1", {
        executor_id: "executor_fixture01",
        independent_verifier_id: "executor_verifier01",
      }),
    ],
    cost: {
      amount: 20,
      currency: "USD",
      provenance: "HARNESS_REPORTED",
      includes: ["execution", "retries", "coordination", "verification", "recovery", "platform_overhead"],
    },
    comparison_scope: {
      compared: ["same suite"],
      not_compared: ["self-score"],
    },
    methodology_note: {
      m08_methodology_id: "cprof-methodology.provisional.v0",
      m08_methodology_version: "0.1.0",
      m08_methodology_status: "PROVISIONAL",
      this_artifact_stamps_methodology_accepted: false,
    },
    production_scores: "PARTIAL",
    computed_at: NOW,
    limitations: ["test fixture; not a production score"],
  };
  return structuredClone({ ...base, ...overrides }) as FairBaselineArtifact;
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
