import { describe, it, expect } from "vitest";
import {
  ingestProviderUsage,
  parseProviderBody,
  recordLlmAdapterUsage,
} from "../../../src/telemetry/measurement-plane/adapters/provider-usage.js";
import { computeDelegationRoi } from "../../../src/telemetry/measurement-plane/metrics/delegation-roi.js";
import { computeUsageAggregate } from "../../../src/telemetry/measurement-plane/metrics/engine.js";
import type { CaseRunResult } from "../../../src/telemetry/measurement-plane/benchmark/runner.js";
import { TelemetryCollector } from "../../../src/telemetry/measurement-plane/collector.js";
import { MeasurementEventStore } from "../../../src/telemetry/measurement-plane/event-store.js";
import { resolveMeasurementPaths } from "../../../src/telemetry/measurement-plane/paths.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("provider usage adapter", () => {
  it("parses anthropic body as PROVIDER_REPORTED and does not invent missing fields", () => {
    const body = {
      usage: {
        input_tokens: 100,
        output_tokens: 40,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 0,
      },
    };
    const usage = parseProviderBody("anthropic", body);
    const events = ingestProviderUsage({
      run_id: "r",
      request_id: "req1",
      provider_id: "anthropic",
      model_id: "claude-test",
      source: { kind: "vendor_cache_usage", usage },
    });
    expect(events[0].provenance.kind).toBe("PROVIDER_REPORTED");
    const agg = computeUsageAggregate(events);
    expect(agg.input_tokens.value).toBe(100);
    expect(agg.input_tokens.provenance).toBe("PROVIDER_REPORTED");

    const missing = ingestProviderUsage({
      run_id: "r",
      request_id: "req2",
      source: { kind: "unavailable" },
    });
    expect(missing[0].provenance.kind).toBe("UNAVAILABLE");
    expect(computeUsageAggregate(missing).input_tokens.value).toBeNull();
  });

  it("budget record marks HARNESS_REPORTED totals without fabricating components", () => {
    const events = ingestProviderUsage({
      run_id: "r",
      request_id: "b1",
      source: {
        kind: "budget_record",
        tokens: 250,
        cost_usd: 0.02,
        reported_by: "agent-registry.budget",
      },
    });
    expect(events[0].provenance.kind).toBe("HARNESS_REPORTED");
    const total = events[0].measurements.total_reported;
    expect(typeof total === "object" && total && "value" in total && total.value).toBe(250);
    expect(events[0].quality.missing_fields).toContain("input_tokens");
  });

  it("recordLlmAdapterUsage ingests into collector", () => {
    const tmp = mkdtempSync(join(tmpdir(), "pu-"));
    try {
      const paths = resolveMeasurementPaths(tmp);
      const store = new MeasurementEventStore(paths);
      const collector = new TelemetryCollector(store, { mode: "normal", runId: "r" });
      recordLlmAdapterUsage({
        collector,
        run_id: "r",
        request_id: "req",
        provider_id: "openai",
        usage: parseProviderBody("openai", {
          usage: { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 0 } },
        }),
      });
      collector.flush();
      expect(store.load("r").some((e) => e.event_name === "usage.reported")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("delegation ROI decomposition", () => {
  it("compares components without treating depth as success", () => {
    const mk = (strategy: CaseRunResult["strategy"], depth: number, pass: boolean, ms: number): CaseRunResult =>
      ({
        run_id: `run_${strategy}_${depth}`,
        case_id: "BO-ORCH-02",
        strategy,
        repetition: 1,
        validity: "valid",
        invalid_reasons: [],
        true_full_pass: pass,
        metrics: {
          hierarchy: {
            agent_count_requested: 1,
            agent_count_created: 1 + depth,
            agent_count_started: 1,
            agent_count_completed: 1,
            agent_count_failed: 0,
            agent_count_cancelled: 0,
            agent_count_blocked: 0,
            subagent_count: depth,
            delegation_depth: depth,
            fan_out_max: depth,
            fan_out_mean: depth,
            fan_out_median: depth,
            delegation_requested: depth,
            delegation_accepted: depth,
            delegation_rejected: 0,
            delegation_acceptance_rate: depth ? 1 : null,
            delegated_task_share: depth ? 0.5 : 0,
            delegation_rework_rate: 0.1,
            root_direct_engineering_share: depth ? 0.2 : 0.8,
            root_coordination_share: depth ? 0.3 : 0.2,
            delegated_engineering_share: depth ? 0.5 : 0,
            unattributed_work_share: 0,
          },
          usage: {
            input_tokens: { metric: "input_tokens", value: null, unit: "tokens", provenance: "UNAVAILABLE" },
            output_tokens: { metric: "output_tokens", value: null, unit: "tokens", provenance: "UNAVAILABLE" },
            cached_input_tokens: { metric: "cached_input_tokens", value: null, unit: "tokens", provenance: "UNAVAILABLE" },
            cache_creation_tokens: { metric: "cache_creation_tokens", value: null, unit: "tokens", provenance: "UNAVAILABLE" },
            reasoning_tokens: { metric: "reasoning_tokens", value: null, unit: "tokens", provenance: "UNAVAILABLE" },
            total_reported: { metric: "total_reported", value: null, unit: "tokens", provenance: "UNAVAILABLE" },
            total_estimated: { metric: "total_estimated", value: null, unit: "tokens", provenance: "UNAVAILABLE" },
            cost_usd_reported: { metric: "cost_usd_reported", value: null, unit: "USD", provenance: "UNAVAILABLE" },
            cost_usd_calculated: { metric: "cost_usd_calculated", value: null, unit: "USD", provenance: "UNAVAILABLE" },
            cost_usd_estimated: { metric: "cost_usd_estimated", value: null, unit: "USD", provenance: "UNAVAILABLE" },
            request_count: 0,
            deduped_request_count: 0,
          },
          timing: {
            end_to_end_duration_ms: ms,
            time_to_first_useful_action_ms: ms / 2,
            active_engineering_time_ms: ms / 3,
            wall_clock_duration_ms: ms,
            provider_request_latency: {
              sample_size: 0,
              mean_ms: null,
              median_ms: null,
              p50_ms: null,
              p90_ms: null,
              p95_ms: null,
              min_ms: null,
              max_ms: null,
              reliability: "insufficient_sample",
            },
            tool_duration: {
              sample_size: 0,
              mean_ms: null,
              median_ms: null,
              p50_ms: null,
              p90_ms: null,
              p95_ms: null,
              min_ms: null,
              max_ms: null,
              reliability: "insufficient_sample",
            },
            provenance: "OBSERVED",
          },
          event_counts: {},
          coverage_gaps: [],
        },
        evaluation: {
          run_id: "x",
          criteria: [],
          true_full_pass: pass,
          true_full_pass_reason: pass ? "ok" : "fail",
          evidence_validity_rate: 1,
          false_positive_checks: [],
        },
      }) as CaseRunResult;

    const results = [
      mk("A_single_agent", 0, true, 100),
      mk("C_evolveloop_adaptive", 2, true, 150),
    ];
    const roi = computeDelegationRoi(results, "A_single_agent", "C_evolveloop_adaptive", "BO-ORCH-02");
    expect(roi.tokens.provenance).toBe("UNAVAILABLE");
    expect(roi.cost.provenance).toBe("UNAVAILABLE");
    expect(roi.hierarchy_context.mean_depth_candidate).toBe(2);
    expect(roi.hierarchy_context.note.includes("Contextual")).toBe(true);
    expect(roi.interpretation_notes.some((n) => n.includes("depth/subagent"))).toBe(true);
    expect(roi.quality.delta).toBe(0);
    expect(roi.latency.delta_ms).toBe(50);
  });
});
