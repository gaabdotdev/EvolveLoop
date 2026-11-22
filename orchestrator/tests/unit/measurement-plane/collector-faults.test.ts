import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMeasurementPaths } from "../../../src/telemetry/measurement-plane/paths.js";
import { MeasurementEventStore } from "../../../src/telemetry/measurement-plane/event-store.js";
import { TelemetryCollector } from "../../../src/telemetry/measurement-plane/collector.js";
import { createMeasurementEvent } from "../../../src/telemetry/measurement-plane/envelope.js";
import type { MeasurementEvent } from "../../../src/telemetry/measurement-plane/types.js";

class FailingStore extends MeasurementEventStore {
  failNext = 0;
  append(runId: string, event: MeasurementEvent): void {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("simulated_storage_unavailable");
    }
    super.append(runId, event);
  }
}

describe("collector fault modes", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "fault-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("detects duplicates and delayed events", () => {
    const paths = resolveMeasurementPaths(tmp);
    const store = new MeasurementEventStore(paths);
    const c = new TelemetryCollector(store, { mode: "benchmark", runId: "r1" });
    const a = createMeasurementEvent({
      event_name: "run.started",
      source: { component: "t", module: "t" },
      correlation: { run_id: "r1" },
      occurred_at: "2026-01-01T00:00:02.000Z",
      event_id: "evt_same_001",
    });
    expect(c.ingest(a).accepted).toBe(true);
    expect(c.ingest(a).reason).toBe("duplicate");

    const delayed = createMeasurementEvent({
      event_name: "task.started",
      source: { component: "t", module: "t" },
      correlation: { run_id: "r1" },
      occurred_at: "2026-01-01T00:00:01.000Z",
    });
    expect(c.ingest(delayed).accepted).toBe(true);
    expect(c.getStats().delayed).toBe(1);
    expect(c.getStats().duplicates).toBe(1);
  });

  it("rejects invalid schema without inventing acceptance", () => {
    const paths = resolveMeasurementPaths(tmp);
    const store = new MeasurementEventStore(paths);
    const c = new TelemetryCollector(store, { mode: "normal", runId: "r2" });
    const bad = { schema_version: "0.0", event_id: "x" } as unknown as MeasurementEvent;
    const r = c.ingest(bad);
    expect(r.accepted).toBe(false);
    expect(c.getStats().rejected_invalid).toBe(1);
  });

  it("drops on queue overflow and marks benchmark incomplete for critical loss", () => {
    const paths = resolveMeasurementPaths(tmp);
    const store = new MeasurementEventStore(paths);
    const c = new TelemetryCollector(store, { mode: "benchmark", runId: "r3", maxQueue: 1 });
    // First critical is flushed immediately in benchmark mode; fill queue with non-flushed path:
    // use normal-like by sending non-critical after setting mode... In benchmark, critical flushes.
    // Force overflow: ingest non-critical with mode that queues — switch: create collector normal maxQueue 1
    const c2 = new TelemetryCollector(store, { mode: "normal", runId: "r3b", maxQueue: 1 });
    const e1 = createMeasurementEvent({
      event_name: "tool.completed",
      source: { component: "t", module: "t" },
      correlation: { run_id: "r3b" },
      critical: false,
    });
    c2.ingest(e1);
    const e2 = createMeasurementEvent({
      event_name: "tool.completed",
      source: { component: "t", module: "t" },
      correlation: { run_id: "r3b" },
      critical: false,
    });
    const overflow = c2.ingest(e2);
    expect(overflow.accepted).toBe(false);
    expect(overflow.reason).toBe("queue_overflow");
    expect(c2.getStats().dropped).toBeGreaterThanOrEqual(1);

    // benchmark critical write failure → incomplete
    const failing = new FailingStore(paths);
    failing.failNext = 1;
    const cb = new TelemetryCollector(failing, { mode: "benchmark", runId: "r4" });
    const critical = createMeasurementEvent({
      event_name: "run.started",
      source: { component: "t", module: "t" },
      correlation: { run_id: "r4" },
      critical: true,
    });
    const lost = cb.ingest(critical);
    expect(lost.accepted).toBe(false);
    expect(cb.getStats().write_failures).toBeGreaterThanOrEqual(1);
    expect(cb.isRunComplete().complete).toBe(false);
  });
});
