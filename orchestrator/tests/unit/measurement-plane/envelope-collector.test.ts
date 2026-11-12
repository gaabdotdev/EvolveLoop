import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMeasurementEvent,
  validateMeasurementEvent,
  TelemetryCollector,
  MeasurementEventStore,
  resolveMeasurementPaths,
  buildUsageEvents,
  computeUsageAggregate,
  evaluateRun,
  buildAgentLifecycleEvent,
  buildDelegationEvent,
  reconstructExecution,
  computeHierarchyMetrics,
  runBenchmarkCase,
  loadCase,
  loadSuite,
  createExperiment,
  runExperiment,
  getMetricsCatalog,
} from "../../../src/telemetry/measurement-plane/index.js";
import { parseAnthropicCacheUsage } from "../../../src/providers/llm/vendor-cache-usage.js";

describe("measurement-plane envelope", () => {
  it("validates versioned envelope", () => {
    const ev = createMeasurementEvent({
      event_name: "run.started",
      source: { component: "test", module: "unit" },
      correlation: { run_id: "run_1" },
    });
    expect(ev.schema_version).toBe("1.0");
    expect(validateMeasurementEvent(ev).ok).toBe(true);
    expect(ev.critical).toBe(true);
  });

  it("rejects invented empty correlation silently (omits empties)", () => {
    const ev = createMeasurementEvent({
      event_name: "task.started",
      source: { component: "test", module: "unit" },
      correlation: { run_id: "run_1", agent_id: "" },
    });
    expect(ev.correlation.agent_id).toBeUndefined();
  });
});

describe("collector + store", () => {
  it("persists events and detects duplicates/loss in benchmark mode", () => {
    const root = mkdtempSync(join(tmpdir(), "bench-obs-"));
    const paths = resolveMeasurementPaths(root);
    const store = new MeasurementEventStore(paths);
    const collector = new TelemetryCollector(store, { mode: "benchmark", runId: "run_x" });

    const ev = createMeasurementEvent({
      event_name: "run.started",
      source: { component: "test", module: "unit" },
      correlation: { run_id: "run_x" },
    });
    expect(collector.ingest(ev).accepted).toBe(true);
    expect(collector.ingest(ev).accepted).toBe(false); // duplicate
    collector.flush();
    const loaded = store.load("run_x");
    expect(loaded.some((e) => e.event_name === "run.started")).toBe(true);
    expect(collector.getStats().duplicates).toBe(1);
  });
});

describe("usage provenance + dedup", () => {
  it("keeps PROVIDER_REPORTED distinct from ESTIMATED and dedups by request", () => {
    const usage = parseAnthropicCacheUsage({
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 0,
      },
    });
    const reported = buildUsageEvents({
      usage,
      run_id: "r1",
      request_id: "req1",
      provider_id: "anthropic",
      model_id: "m",
    });
    const estimated = buildUsageEvents({
      usage: null,
      run_id: "r1",
      request_id: "req2",
      estimated: { input: 50, output: 5, method: "whitespace_proxy" },
    });
    const unavailable = buildUsageEvents({
      usage: null,
      unavailable: true,
      run_id: "r1",
      request_id: "req3",
    });
    const all = [...reported, ...reported, ...estimated, ...unavailable];
    const agg = computeUsageAggregate(all);
    expect(agg.input_tokens.provenance).toBe("PROVIDER_REPORTED");
    expect(agg.input_tokens.value).toBe(100);
    expect(agg.total_estimated.provenance).toBe("ESTIMATED");
    expect(agg.deduped_request_count).toBe(3);
    expect(unavailable[0].provenance.kind).toBe("UNAVAILABLE");
  });
});

describe("hierarchy + evaluation", () => {
  it("reconstructs agent tree and separates spawn_requested from spawned", () => {
    const events = [
      buildAgentLifecycleEvent({ run_id: "r", agent_id: "root", role: "root", kind: "spawn_requested" }),
      buildAgentLifecycleEvent({ run_id: "r", agent_id: "root", role: "root", kind: "spawned" }),
      buildAgentLifecycleEvent({
        run_id: "r",
        agent_id: "child",
        parent_agent_id: "root",
        role: "worker",
        kind: "spawn_requested",
      }),
      buildAgentLifecycleEvent({
        run_id: "r",
        agent_id: "child",
        parent_agent_id: "root",
        role: "worker",
        kind: "spawned",
      }),
      buildDelegationEvent({
        run_id: "r",
        delegation_id: "d1",
        from_agent_id: "root",
        to_agent_id: "child",
        kind: "accepted",
      }),
    ];
    expect(events[0]?.correlation?.agent_id).toBe("root");
    const recon = reconstructExecution(events);
    const tree = recon.agent_tree;
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].spawn_confirmed).toBe(true);
    const h = computeHierarchyMetrics(events);
    expect(h.agent_count_created).toBe(2);
    expect(h.agent_count_requested).toBe(2);
    expect(h.delegation_depth).toBeGreaterThanOrEqual(1);
  });

  it("rejects false-positive declaration without file changes", () => {
    const { result } = evaluateRun({
      run_id: "r",
      caseManifest: {
        case_id: "c",
        acceptance_criteria: [
          { id: "c1", description: "done", mandatory: true, evaluator: "diff" },
        ],
      },
      evidences: [
        {
          evidence_id: "e1",
          criterion_id: "c1",
          kind: "declaration",
          agent_declared_success: true,
          files_changed: 0,
        },
      ],
    });
    expect(result.true_full_pass).toBe(false);
    expect(result.false_positive_checks.some((f) => f.rejected)).toBe(true);
  });
});

describe("benchmark runner strategies", () => {
  it("runs suite strategies A/B/C and builds comparison", () => {
    const repoRoot = resolveRepoRoot();
    const root = mkdtempSync(join(tmpdir(), "bench-obs-exp-"));
    const paths = resolveMeasurementPaths(root);
    const suite = loadSuite(join(repoRoot, "benchmarks/bench-obs/suites/engineering-v1.json"));
    const cases = ["BO-ORCH-01", "BO-ORCH-02", "BO-TEL-01"].map((id) =>
      loadCase(join(repoRoot, `benchmarks/bench-obs/cases/${id}.json`)),
    );
    const exp = createExperiment(paths, {
      name: "smoke",
      suite_id: suite.suite_id,
      strategies: ["A_single_agent", "B_evolveloop_no_delegation", "C_evolveloop_adaptive"],
      case_ids: cases.map((c) => c.case_id),
      repetitions: 1,
    });
    const out = runExperiment(exp, suite, cases, {
      paths,
      repoRoot,
      priceTablePath: join(repoRoot, "benchmarks/bench-obs/pricing/prices.v1.json"),
    });
    expect(out.results.length).toBeGreaterThanOrEqual(3);
    expect(out.results.every((r) => r.validity === "valid" || r.validity === "incomplete")).toBe(true);
    expect(out.comparison.arms).toBeTruthy();

    const adaptive = out.results.find(
      (r) => r.strategy === "C_evolveloop_adaptive" && r.case_id === "BO-ORCH-02",
    );
    expect(adaptive?.metrics.hierarchy.subagent_count).toBeGreaterThan(0);

    const simple = out.results.find(
      (r) => r.strategy === "C_evolveloop_adaptive" && r.case_id === "BO-ORCH-01",
    );
    expect(simple?.metrics.hierarchy.delegation_depth ?? 0).toBe(0);

    expect(getMetricsCatalog().metrics.length).toBeGreaterThan(10);
  });

  it("records spawn_blocked for denied spawn case", () => {
    const repoRoot = resolveRepoRoot();
    const root = mkdtempSync(join(tmpdir(), "bench-obs-deny-"));
    const paths = resolveMeasurementPaths(root);
    const c = loadCase(join(repoRoot, "benchmarks/bench-obs/cases/BO-ORCH-05.json"));
    const result = runBenchmarkCase(c, "C_evolveloop_adaptive", { paths, repoRoot });
    const store = new MeasurementEventStore(paths);
    const events = store.load(result.run_id);
    expect(events.some((e) => e.event_name === "agent.spawn_blocked")).toBe(true);
  });
});

function resolveRepoRoot(): string {
  // tests run from orchestrator/
  return join(process.cwd(), "..");
}
