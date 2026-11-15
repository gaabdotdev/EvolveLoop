/**
 * Capability Profile v1 — observed, contextual competence of an executor
 * (constitution §4.8, §5; ADR-V4-0010). Producer: M08. Consumers: M07, M09, M15.
 *
 * Methodology is DEFERRED (ADR-V4-0010); this contract fixes only what every estimate must
 * disclose: context, sample, uncertainty, recency and provenance. Self-assessment never counts.
 */

import { type ContractHeader, type ExecutorRef, type IsoTimestamp, PROVENANCE_KINDS, validateWith, type ValidationResult } from "./common.js";

export const CAPABILITY_PROFILE_SCHEMA_VERSION = "1.0.0";

export type CapabilityMetric =
  | "success_rate"
  | "validated_quality"
  | "latency_ms_p50"
  | "latency_ms_p95"
  | "cost_per_verified_result"
  | "stability"
  | "recovery_rate";

export const CAPABILITY_METRICS: readonly CapabilityMetric[] = [
  "success_rate",
  "validated_quality",
  "latency_ms_p50",
  "latency_ms_p95",
  "cost_per_verified_result",
  "stability",
  "recovery_rate",
];

export interface MetricEstimate {
  metric: CapabilityMetric;
  value: number;
  unit: string;
  sample_size: number;
  window: { from: IsoTimestamp; to: IsoTimestamp };
  uncertainty: { method: string; lower: number; upper: number; confidence?: number };
  provenance: "OBSERVED" | "DERIVED" | "PROVIDER_REPORTED" | "HARNESS_REPORTED";
  /** Evidence/benchmark run ids the estimate was computed from. */
  source_refs: string[];
  benchmark_ref?: { suite_id: string; suite_version: string };
}

export interface CapabilityProfile extends ContractHeader<"CapabilityProfile"> {
  profile_id: string;
  subject: ExecutorRef;
  /** No absolute rankings: every profile is scoped to a context (INV-CPROF-03). */
  context: { work_category: string; task_kind: string; environment?: string };
  metrics: MetricEstimate[];
  methodology: { id: string; version: string; status: "PLACEHOLDER" | "PROVISIONAL" | "ACCEPTED" };
  status: "PROVISIONAL" | "ACTIVE" | "STALE";
  computed_at: IsoTimestamp;
  valid_until: IsoTimestamp;
}

const ALLOWED_PROFILE_PROVENANCE = ["OBSERVED", "DERIVED", "PROVIDER_REPORTED", "HARNESS_REPORTED"] as const;

export function validateCapabilityProfile(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("CapabilityProfile");
    c.id("profile_id", "capability_profile");
    c.executorRef("subject");
    c.nested("context", (cc) => {
      cc.string("work_category");
      cc.string("task_kind");
    });
    c.each(
      "metrics",
      (cc) => {
        cc.oneOf("metric", CAPABILITY_METRICS);
        cc.ensure(typeof cc.get("value") === "number", "STRUCT", "value", "must be a number");
        cc.string("unit");
        cc.ensure(
          typeof cc.get("sample_size") === "number" && Number.isInteger(cc.get("sample_size")) && (cc.get("sample_size") as number) >= 1,
          "INV-CPROF-02",
          "sample_size",
          "sample_size must be an integer >= 1",
        );
        cc.nested("window", (w) => {
          w.timestamp("from");
          w.timestamp("to");
        });
        cc.nested("uncertainty", (u) => {
          u.string("method");
          const lo = u.get("lower");
          const hi = u.get("upper");
          u.ensure(typeof lo === "number" && typeof hi === "number" && lo <= hi, "INV-CPROF-02", "lower", "uncertainty interval required (lower <= upper)");
        });
        const prov = cc.get("provenance");
        cc.ensure(
          (ALLOWED_PROFILE_PROVENANCE as readonly unknown[]).includes(prov),
          "INV-CPROF-01",
          "provenance",
          (PROVENANCE_KINDS as readonly unknown[]).includes(prov)
            ? `provenance ${String(prov)} cannot support a capability estimate (self-assessment/estimates excluded)`
            : "unknown provenance",
        );
        cc.stringArray("source_refs", { minLength: 1 });
      },
      { minLength: 1 },
    );
    c.nested("methodology", (cc) => {
      cc.string("id");
      cc.string("version");
      cc.oneOf("status", ["PLACEHOLDER", "PROVISIONAL", "ACCEPTED"] as const);
    });
    const status = c.oneOf("status", ["PROVISIONAL", "ACTIVE", "STALE"] as const);
    c.timestamp("computed_at");
    c.timestamp("valid_until");
    const methodology = c.get("methodology") as CapabilityProfile["methodology"] | undefined;
    if (status === "ACTIVE") {
      c.ensure(methodology?.status === "ACCEPTED", "INV-CPROF-04", "status", "ACTIVE profiles require an ACCEPTED methodology (ADR-V4-0010)");
    }
    for (const forbidden of ["global_score", "rank", "overall_score"]) {
      c.ensure(!c.has(forbidden), "INV-CPROF-03", forbidden, "context-free rankings are not allowed");
    }
  });
}
