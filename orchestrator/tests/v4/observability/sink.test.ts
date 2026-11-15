import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MeasurementEventStore, resolveMeasurementPaths } from "../../../src/telemetry/measurement-plane/index.js";
import type { MeasurementSinkPort } from "../../../src/v4/contracts/index.js";
import {
  ObservabilitySink,
  computeUnknownProvenanceRate,
  evaluateCostAnomaly,
  evaluateStagnation,
  incidentSignal,
  reconstructObservedExecution,
} from "../../../src/v4/observability/index.js";

function sink(): ObservabilitySink {
  const root = mkdtempSync(join(tmpdir(), "m12-obs-"));
  const store = new MeasurementEventStore(resolveMeasurementPaths(root));
  return new ObservabilitySink({ runId: "run_m12", store, collectorOptions: { mode: "benchmark" } });
}

describe("M12 ObservabilitySink wraps Measurement Plane", () => {
  it("implements MeasurementSinkPort.emit", () => {
    const s: MeasurementSinkPort = sink();
    expect(typeof s.emit).toBe("function");
  });

  it("persists unlabeled events as UNKNOWN via the MP collector", () => {
    const s = sink();
    s.emit({
      event_name: "run.started",
      source: { component: "test", module: "sink" },
      correlation: { run_id: "run_m12", trace_id: "tr_1", span_id: "sp_1" },
    });
    s.flush();
    const loaded = s.store.load("run_m12");
    const started = loaded.find((e) => e.event_name === "run.started");
    expect(started).toBeDefined();
    expect(started!.provenance.kind).toBe("UNKNOWN");
    expect(started!.provenance.kind).not.toBe("OBSERVED");
    expect(s.acceptedEvents()).toHaveLength(1);
  });

  it("does not let emit() persist OBSERVED even when the producer claims it", () => {
    const s = sink();
    const result = s.ingest(
      {
        event_name: "task.started",
        source: { component: "executor", module: "worker" },
        provenance: { kind: "OBSERVED", reported_by: "worker" },
        correlation: { run_id: "run_m12", task_id: "task_abc123" },
      },
      "unauthenticated",
    );
    expect(result.accepted).toBe(true);
    expect(result.observed_downgraded).toBe(true);
    expect(s.acceptedEvents()[0].provenance.kind).toBe("UNKNOWN");
  });

  it("allows explicit OBSERVED only from an in-process control-plane observer", () => {
    const s = sink();
    s.emitFromControlPlane(
      {
        event_name: "checkpoint.created",
        provenance: { kind: "OBSERVED" },
        correlation: { run_id: "run_m12" },
      },
      { component: "v4-control-plane", module: "checkpoint" },
    );
    const ev = s.acceptedEvents()[0];
    expect(ev.provenance.kind).toBe("OBSERVED");
    expect(ev.provenance.reported_by).toBe("v4-control-plane:checkpoint");
    expect(ev.source.component).toBe("v4-control-plane");
    expect(ev.source.module).toBe("checkpoint");
  });

  it("preserves PROVIDER_REPORTED and ESTIMATED labels through the collector", () => {
    const s = sink();
    s.emit({
      event_name: "usage.reported",
      source: { component: "provider", module: "anthropic" },
      provenance: { kind: "PROVIDER_REPORTED", reported_by: "anthropic" },
      measurements: {
        input_tokens: { metric: "input_tokens", value: 40, unit: "tokens", provenance: "PROVIDER_REPORTED" },
      },
      correlation: { run_id: "run_m12" },
    });
    s.emit({
      event_name: "usage.estimated",
      source: { component: "measurement-plane", module: "usage-adapter" },
      provenance: { kind: "ESTIMATED", reported_by: "usage-adapter", estimate_method: "whitespace_proxy" },
      measurements: {
        input_tokens: {
          metric: "input_tokens",
          value: 7,
          unit: "tokens",
          provenance: "ESTIMATED",
          estimate_method: "whitespace_proxy",
        },
      },
      correlation: { run_id: "run_m12" },
    });
    const kinds = s.acceptedEvents().map((e) => e.provenance.kind);
    expect(kinds).toEqual(["PROVIDER_REPORTED", "ESTIMATED"]);
  });

  it("does not invent events from garbage input", () => {
    const s = sink();
    s.emit("nope");
    s.emit({ foo: 1 });
    expect(s.acceptedEvents()).toHaveLength(0);
    expect(s.rejectedCount()).toBe(2);
  });
});

describe("M12 traces, anomalies, signals", () => {
  it("reconstructs traces as DERIVED and does not invent a root when there are no events", () => {
    const empty = reconstructObservedExecution([]);
    expect(empty.events_used).toBe(0);
    expect(empty.forest).toEqual([]);
    expect(empty.agent_tree).toEqual([]);
    expect(empty.reconstruction_provenance).toBe("DERIVED");
    expect(empty.gap_provenance).toBe("UNAVAILABLE");
  });

  it("builds a forest from accepted events without inventing missing spans", () => {
    const s = sink();
    s.emitFromControlPlane(
      {
        event_name: "task.started",
        provenance: { kind: "OBSERVED" },
        correlation: { run_id: "run_m12", trace_id: "tr", span_id: "sp_root", agent_id: "ag_1" },
      },
      { component: "v4-control-plane", module: "exec" },
    );
    const tr = s.traces();
    expect(tr.forest).toHaveLength(1);
    expect(tr.forest[0].span_id).toBe("sp_root");
    expect(tr.reconstruction_provenance).toBe("DERIVED");
  });

  it("stagnation and cost-anomaly hooks are honest UNAVAILABLE stubs", () => {
    const s = sink();
    s.emit({
      event_name: "usage.reported",
      source: { component: "p", module: "m" },
      provenance: { kind: "PROVIDER_REPORTED", reported_by: "p" },
      measurements: {
        cost_usd: { metric: "cost_usd", value: 12.5, unit: "USD", provenance: "PROVIDER_REPORTED" },
      },
    });
    expect(s.stagnation()).toEqual(evaluateStagnation(s.acceptedEvents()));
    expect(s.stagnation()).toMatchObject({
      signal: "stagnation",
      status: "UNAVAILABLE",
      provenance: "UNAVAILABLE",
      value: null,
    });
    expect(s.costAnomaly()).toEqual(evaluateCostAnomaly(s.acceptedEvents()));
    expect(s.costAnomaly()).toMatchObject({
      signal: "cost_anomaly",
      status: "UNAVAILABLE",
      provenance: "UNAVAILABLE",
      value: null,
    });
  });

  it("UNKNOWN-rate is OBSERVED counts / DERIVED ratio, or UNAVAILABLE when empty", () => {
    expect(computeUnknownProvenanceRate([])).toMatchObject({
      total: 0,
      unknown: 0,
      rate: null,
      rate_provenance: "UNAVAILABLE",
    });
    const s = sink();
    s.emit({ event_name: "run.started", source: { component: "t", module: "u" } });
    s.emit({
      event_name: "usage.reported",
      source: { component: "t", module: "u" },
      provenance: { kind: "PROVIDER_REPORTED", reported_by: "p" },
    });
    const rate = s.unknownRate();
    expect(rate.total).toBe(2);
    expect(rate.unknown).toBe(1);
    expect(rate.rate).toBe(0.5);
    expect(rate.rate_provenance).toBe("DERIVED");
    expect(rate.count_provenance).toBe("OBSERVED");
  });

  it("incident signal is UNAVAILABLE in M12-init (no freeze/revocation invented)", () => {
    expect(incidentSignal()).toMatchObject({
      status: "UNAVAILABLE",
      provenance: "UNAVAILABLE",
      freeze: null,
      revocation: null,
    });
    expect(sink().incident().freeze).toBeNull();
  });
});
